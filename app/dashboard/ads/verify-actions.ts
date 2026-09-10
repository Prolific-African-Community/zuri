"use server";

import { VerificationOutcome } from "@/lib/generated/prisma/enums";
import {
  brandCustomerId,
  findKeywordCriteria,
  findNegativeKeywords,
} from "@/lib/google-ads";
import { getConnection, hasAdsScope } from "@/lib/google";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type VerifyState = { status: "idle" | "done" | "error"; message: string };

type Payload = {
  adsActionType?: string;
  customerId?: string;
  campaignId?: string | null;
  adGroupId?: string | null;
  keywordText?: string;
  matchType?: string;
  executionMode?: string;
  result?: string;
};

function readPayload(value: unknown): Payload {
  return typeof value === "object" && value !== null ? (value as Payload) : {};
}

type Verdict = {
  outcome: VerificationOutcome;
  actual: string;
  note: string;
};

/**
 * Reads the live account and says whether the change is really there. It is a
 * read: nothing is written, nothing is re-executed, nothing is corrected.
 */
export async function verifyAdsAction(
  _prevState: VerifyState,
  formData: FormData,
): Promise<VerifyState> {
  await requireSession();

  const actionId = String(formData.get("actionId") ?? "").trim();
  if (!actionId) return { status: "error", message: "Missing action." };

  const prisma = getPrisma();
  const action = await prisma.proposedAction.findUnique({
    where: { id: actionId },
    include: { brand: true },
  });
  if (!action) return { status: "error", message: "Action not found." };
  if (!action.executedAt) {
    return { status: "error", message: "Only an executed action can be verified." };
  }

  const connection = await getConnection();
  if (!connection || !hasAdsScope(connection.scope)) {
    return { status: "error", message: "Google Ads is not connected." };
  }

  // The account is this brand's, never a global one.
  const customerId = brandCustomerId(action.brand);
  if (!customerId) {
    return {
      status: "error",
      message: "No Google Ads customer configured for this brand.",
    };
  }

  const payload = readPayload(action.payload);
  if (payload.customerId && payload.customerId !== customerId) {
    return {
      status: "error",
      message: `This action was executed on ${payload.customerId}, which is not this brand's ${customerId}.`,
    };
  }

  try {
    const verdict = await inspect(customerId, payload);

    await prisma.proposedAction.update({
      where: { id: actionId },
      data: {
        verifiedAt: new Date(),
        verificationOutcome: verdict.outcome,
        actualState: verdict.actual,
        verificationNote: verdict.note,
      },
    });

    revalidatePath("/dashboard/actions");
    revalidatePath("/dashboard/ads");
    return {
      status: verdict.outcome === "DIVERGED" ? "error" : "done",
      message: verdict.note,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not read the account.",
    };
  }
}

async function inspect(customerId: string, payload: Payload): Promise<Verdict> {
  const external = payload.executionMode === "EXTERNAL";
  const keyword = (payload.keywordText ?? "").trim();
  const expected = (payload.matchType ?? "").toUpperCase();

  // A diagnosis carries no concrete change, so there is nothing to look for.
  if (!keyword) {
    return {
      outcome: VerificationOutcome.NOT_VERIFIABLE,
      actual: "No keyword or negative to look up.",
      note: external
        ? "Confirmed externally — not fully verifiable from current Ads data."
        : "This action describes no observable change.",
    };
  }

  if (payload.adsActionType === "ADD_NEGATIVE_KEYWORD") {
    if (!payload.campaignId) {
      return {
        outcome: VerificationOutcome.NOT_VERIFIABLE,
        actual: "No campaign recorded on the action.",
        note: "The campaign the negative belongs to is unknown.",
      };
    }
    const found = await findNegativeKeywords(customerId, payload.campaignId, keyword);
    if (!found.length) {
      return {
        outcome: external
          ? VerificationOutcome.NOT_VERIFIABLE
          : VerificationOutcome.DIVERGED,
        actual: `No negative "${keyword}" on the campaign.`,
        note: external
          ? "Confirmed externally — not found on the campaign, so nothing is verified."
          : "The negative keyword is not on the account.",
      };
    }
    const match = found[0];
    return {
      outcome: VerificationOutcome.VERIFIED,
      actual: `Negative "${match.text}" (${match.matchType.toLowerCase()}) on ${match.campaignName}.`,
      note: "The negative keyword is present on the campaign.",
    };
  }

  if (!payload.adGroupId) {
    return {
      outcome: VerificationOutcome.NOT_VERIFIABLE,
      actual: "No ad group recorded on the action.",
      note: "Without an ad group there is nothing to inspect.",
    };
  }

  const live = await findKeywordCriteria(customerId, payload.adGroupId, keyword);
  if (!live.length) {
    return {
      outcome: external
        ? VerificationOutcome.NOT_VERIFIABLE
        : VerificationOutcome.DIVERGED,
      actual: `"${keyword}" is not in that ad group.`,
      note: external
        ? "Confirmed externally — the keyword is not in this ad group, so nothing is verified."
        : "The keyword Zuri reported creating is not on the account.",
    };
  }

  const describe = (entry: (typeof live)[number]) =>
    `"${entry.text}" · ${entry.matchType.toLowerCase()} · ${entry.status.toLowerCase()} · ${entry.campaignName} / ${entry.adGroupName}`;
  const actual = live.map(describe).join(" | ");

  if (payload.adsActionType === "PAUSE_KEYWORD") {
    const target = live.find((entry) => entry.matchType === expected) ?? live[0];
    return target.status === "PAUSED"
      ? {
          outcome: VerificationOutcome.VERIFIED,
          actual,
          note: "The keyword is paused on the account.",
        }
      : {
          outcome: VerificationOutcome.DIVERGED,
          actual,
          note: `The keyword is ${target.status.toLowerCase()}, not paused.`,
        };
  }

  // ADD_KEYWORD and CHANGE_MATCH_TYPE both expect one specific match type.
  const exact = live.find((entry) => entry.matchType === expected);
  if (!exact) {
    return {
      outcome: VerificationOutcome.DIVERGED,
      actual,
      note: `Expected ${expected.toLowerCase()} match; the account has ${live
        .map((entry) => entry.matchType.toLowerCase())
        .join(", ")}.`,
    };
  }

  if (payload.adsActionType === "CHANGE_MATCH_TYPE") {
    const broad = live.find((entry) => entry.matchType === "BROAD");
    if (broad && broad.status !== "PAUSED") {
      return {
        outcome: VerificationOutcome.DIVERGED,
        actual,
        note: "The phrase keyword exists but the broad one is still enabled.",
      };
    }
  }

  return {
    outcome: VerificationOutcome.VERIFIED,
    actual,
    note: `Present as ${exact.matchType.toLowerCase()} match, ${exact.status.toLowerCase()}.`,
  };
}
