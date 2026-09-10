"use server";

import {
  ActionStatus,
  ActionType,
  RiskLevel,
} from "@/lib/generated/prisma/enums";
import {
  buildAdsProposals,
  type AdsActionType,
  type AdsRowLike,
} from "@/lib/ads-proposals";
import { buildAdsRecommendations } from "@/lib/ads-recommendations";
import { getConnection, hasAdsScope } from "@/lib/google";
import {
  addKeyword,
  addNegativeKeyword,
  findAdGroup,
  findKeywordCriterion,
  setKeywordStatus,
  brandCustomerId,
} from "@/lib/google-ads";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type AdsProposalState = {
  status: "idle" | "done" | "error";
  message: string;
};

/** Everything a future execution needs, and nothing else. */
export type AdsPayload = {
  channel: "GOOGLE_ADS";
  adsActionType: AdsActionType;
  customerId: string;
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  keywordText: string;
  matchType: string;
  criterionId: string | null;
  current: string;
  proposed: string;
  evidence: string;
  key: string;
  /** DIRECT when Zuri calls the API itself, EXTERNAL when a person does. */
  executionMode?: "DIRECT" | "EXTERNAL";
  implementedExternally?: boolean;
  result?: string;
};

function refresh() {
  revalidatePath("/dashboard/ads");
  revalidatePath("/dashboard/actions");
}

function readPayload(value: unknown): Partial<AdsPayload> {
  return typeof value === "object" && value !== null
    ? (value as Partial<AdsPayload>)
    : {};
}

export async function proposeAdsActions(
  _prevState: AdsProposalState,
  formData: FormData,
): Promise<AdsProposalState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return { status: "error", message: "Pick a brand first." };

  try {
    const prisma = getPrisma();
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return { status: "error", message: "Brand not found." };

    const customerId = brandCustomerId(brand);
    if (!customerId) {
      return { status: "error", message: "No Google Ads customer configured for this brand." };
    }

    const sync = await prisma.adsSync.findFirst({
      where: { brandId, customerId },
      orderBy: { startDate: "desc" },
      include: { rows: true },
    });
    if (!sync) {
      return { status: "error", message: "Sync Google Ads first." };
    }

    const rows = sync.rows as unknown as AdsRowLike[];
    const adGroups = rows.filter((row) => row.level === "AD_GROUP");
    const keywords = rows.filter((row) => row.level === "KEYWORD");
    const searchTerms = rows.filter((row) => row.level === "SEARCH_TERM");

    // New keywords land in the ad group that already holds the most terms.
    const counts = new Map<string, number>();
    for (const keyword of keywords) {
      if (keyword.adGroupId) {
        counts.set(keyword.adGroupId, (counts.get(keyword.adGroupId) ?? 0) + 1);
      }
    }
    const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const target =
      adGroups.find((row) => row.adGroupId === busiest) ?? adGroups[0] ?? null;

    const [zuriKeywords, gscRows] = await Promise.all([
      prisma.keyword.findMany({
        where: { brandId },
        orderBy: { priorityScore: "desc" },
        select: {
          keyword: true,
          priorityScore: true,
          intent: true,
          searchVolume: true,
        },
      }),
      prisma.searchConsoleRow.findMany({
        where: { brandId, dimension: "QUERY" },
        orderBy: { impressions: "desc" },
        take: 50,
        select: { value: true, clicks: true, impressions: true },
      }),
    ]);

    const proposals = buildAdsProposals({
      keywords,
      searchTerms,
      zuriKeywords,
      searchConsoleQueries: gscRows,
      defaultAdGroup:
        target && target.adGroupId && target.campaignId
          ? {
              adGroupId: target.adGroupId,
              adGroupName: target.adGroupName ?? "",
              campaignId: target.campaignId,
              campaignName: target.campaignName ?? "",
            }
          : null,
    });

    if (!proposals.length) {
      return {
        status: "done",
        message: "Nothing to propose — the data does not justify a change.",
      };
    }

    // An open action for the same change must never be duplicated.
    const existing = await prisma.proposedAction.findMany({
      where: {
        brandId,
        type: ActionType.GOOGLE_ADS,
        status: { in: [ActionStatus.PROPOSED, ActionStatus.APPROVED, ActionStatus.EXECUTED] },
      },
      select: { payload: true },
    });
    const existingKeys = new Set(
      existing.map((action) => readPayload(action.payload).key).filter(Boolean),
    );

    const fresh = proposals.filter((proposal) => !existingKeys.has(proposal.key));
    if (!fresh.length) {
      return { status: "done", message: "Every justified change is already proposed." };
    }

    for (const proposal of fresh) {
      const payload: AdsPayload = {
        channel: "GOOGLE_ADS",
        adsActionType: proposal.actionType,
        customerId,
        campaignId: proposal.campaignId,
        campaignName: proposal.campaignName,
        adGroupId: proposal.adGroupId,
        adGroupName: proposal.adGroupName,
        keywordText: proposal.keywordText,
        matchType: proposal.matchType,
        criterionId: proposal.criterionId,
        current: proposal.current,
        proposed: proposal.proposed,
        evidence: proposal.evidence,
        key: proposal.key,
      };

      await prisma.proposedAction.create({
        data: {
          brandId,
          type: ActionType.GOOGLE_ADS,
          status: ActionStatus.PROPOSED,
          title: proposal.title,
          summary: proposal.proposed,
          rationale: proposal.why,
          target: [proposal.campaignName, proposal.adGroupName]
            .filter(Boolean)
            .join(" / "),
          riskLevel: proposal.risk as RiskLevel,
          payload: { ...payload },
        },
      });
    }

    refresh();
    return {
      status: "done",
      message: `${fresh.length} action${fresh.length === 1 ? "" : "s"} proposed.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not propose.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Execution                                                                  */
/* -------------------------------------------------------------------------- */

export async function executeAdsAction(
  _prevState: AdsProposalState,
  formData: FormData,
): Promise<AdsProposalState> {
  await requireSession();

  const actionId = String(formData.get("actionId") ?? "").trim();
  if (!actionId) return { status: "error", message: "Missing action." };

  try {
    const prisma = getPrisma();
    const action = await prisma.proposedAction.findUnique({ where: { id: actionId } });
    if (!action) return { status: "error", message: "Action not found." };
    if (action.type !== ActionType.GOOGLE_ADS) {
      return { status: "error", message: "This is not a Google Ads action." };
    }
    if (action.status !== ActionStatus.APPROVED) {
      return { status: "error", message: "Only an approved action can be executed." };
    }

    const connection = await getConnection();
    if (!connection || !hasAdsScope(connection.scope)) {
      return { status: "error", message: "Google Ads is not connected." };
    }

    const payload = readPayload(action.payload);
    const brand = await prisma.brand.findUnique({ where: { id: action.brandId } });
    // The account is the one this brand owns, never a global default.
    const configured = brand ? brandCustomerId(brand) : "";

    // Never touch an account other than the configured one.
    if (!configured) {
      return { status: "error", message: "No Google Ads customer configured for this brand." };
    }
    if (!payload.customerId || payload.customerId !== configured) {
      return {
        status: "error",
        message: `This action targets ${payload.customerId ?? "no account"}, not this brand's ${configured}.`,
      };
    }
    if (!payload.adsActionType || !payload.keywordText) {
      return { status: "error", message: "The action payload is incomplete." };
    }

    const customerId = payload.customerId;
    const matchType = payload.matchType ?? "PHRASE";
    let result = "";

    if (
      payload.adsActionType === "ADD_KEYWORD" ||
      payload.adsActionType === "CHANGE_MATCH_TYPE"
    ) {
      if (!payload.adGroupId) {
        return { status: "error", message: "No ad group on this action." };
      }

      const adGroup = await findAdGroup(customerId, payload.adGroupId);
      if (!adGroup) {
        return {
          status: "error",
          message: `Ad group ${payload.adGroupId} no longer exists in ${customerId}.`,
        };
      }

      // Idempotence: an identical criterion means the work is already done.
      const already = await findKeywordCriterion(
        customerId,
        payload.adGroupId,
        payload.keywordText,
        matchType,
      );

      if (already) {
        result = `Already present as criterion ${already.criterionId} (${already.status}).`;
      } else {
        const [resourceName] = await addKeyword(
          customerId,
          payload.adGroupId,
          payload.keywordText,
          matchType,
        );
        result = `Created ${resourceName}.`;
      }

      // Tightening a match type pauses the broad original, never deletes it.
      if (payload.adsActionType === "CHANGE_MATCH_TYPE") {
        const broad = await findKeywordCriterion(
          customerId,
          payload.adGroupId,
          payload.keywordText,
          "BROAD",
        );
        if (broad && broad.status !== "PAUSED") {
          await setKeywordStatus(
            customerId,
            payload.adGroupId,
            broad.criterionId,
            "PAUSED",
          );
          result += ` Paused the broad criterion ${broad.criterionId}.`;
        }
      }
    } else if (payload.adsActionType === "PAUSE_KEYWORD") {
      if (!payload.adGroupId) {
        return { status: "error", message: "No ad group on this action." };
      }
      const criterion = await findKeywordCriterion(
        customerId,
        payload.adGroupId,
        payload.keywordText,
        matchType,
      );
      if (!criterion) {
        return { status: "error", message: "That keyword no longer exists." };
      }
      if (criterion.status === "PAUSED") {
        result = `Already paused (criterion ${criterion.criterionId}).`;
      } else {
        await setKeywordStatus(
          customerId,
          payload.adGroupId,
          criterion.criterionId,
          "PAUSED",
        );
        result = `Paused criterion ${criterion.criterionId}.`;
      }
    } else {
      if (!payload.campaignId) {
        return { status: "error", message: "No campaign on this action." };
      }
      const [resourceName] = await addNegativeKeyword(
        customerId,
        payload.campaignId,
        payload.keywordText,
        matchType,
      );
      result = `Created negative ${resourceName}.`;
    }

    console.log("Google Ads action executed", actionId, payload.adsActionType, result);

    // EXECUTED only once the API call has genuinely succeeded.
    await prisma.proposedAction.update({
      where: { id: actionId },
      data: {
        status: ActionStatus.EXECUTED,
        executedAt: new Date(),
        payload: { ...payload, result },
      },
    });

    refresh();
    return { status: "done", message: result };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Ads execution failed.";
    // A failed write is recorded, never silently retried.
    await getPrisma()
      .proposedAction.update({
        where: { id: actionId },
        data: { status: ActionStatus.FAILED },
      })
      .catch(() => undefined);
    return { status: "error", message };
  }
}

/* -------------------------------------------------------------------------- */
/* One recommendation at a time                                               */
/* -------------------------------------------------------------------------- */

/**
 * Turns a single recommendation into a ProposedAction. The recommendation is
 * rebuilt server-side from the stored snapshot, so the client cannot inject a
 * change Zuri did not derive itself.
 */
export async function proposeAdsRecommendation(
  _prevState: AdsProposalState,
  formData: FormData,
): Promise<AdsProposalState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  if (!brandId || !key) return { status: "error", message: "Missing recommendation." };

  try {
    const prisma = getPrisma();
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return { status: "error", message: "Brand not found." };

    const customerId = brandCustomerId(brand);
    if (!customerId) {
      return { status: "error", message: "No Google Ads customer configured for this brand." };
    }

    const sync = await prisma.adsSync.findFirst({
      where: { brandId, customerId },
      orderBy: { startDate: "desc" },
      include: { rows: true },
    });
    if (!sync) return { status: "error", message: "Sync Google Ads first." };

    const rows = sync.rows as unknown as AdsRowLike[];
    const zuriKeywords = await prisma.keyword.findMany({
      where: { brandId },
      orderBy: { priorityScore: "desc" },
      select: { keyword: true, priorityScore: true, intent: true },
    });

    const recommendation = buildAdsRecommendations({
      campaigns: rows.filter((row) => row.level === "CAMPAIGN"),
      adGroups: rows.filter((row) => row.level === "AD_GROUP"),
      keywords: rows.filter((row) => row.level === "KEYWORD"),
      searchTerms: rows.filter((row) => row.level === "SEARCH_TERM"),
      zuriKeywords,
    }).find((item) => item.key === key);

    if (!recommendation) {
      return { status: "error", message: "That recommendation no longer applies." };
    }
    if (!recommendation.actionType) {
      return { status: "error", message: "This is a diagnosis, not an executable change." };
    }

    const already = await prisma.proposedAction.findMany({
      where: {
        brandId,
        type: ActionType.GOOGLE_ADS,
        status: { in: [ActionStatus.PROPOSED, ActionStatus.APPROVED, ActionStatus.EXECUTED] },
      },
      select: { payload: true },
    });
    // Only actions on this brand's current account can be duplicates; ones
    // left over from another account are history, not a conflict.
    if (
      already.some((action) => {
        const previous = readPayload(action.payload);
        return previous.key === key && previous.customerId === customerId;
      })
    ) {
      return { status: "done", message: "Already in the Action Center." };
    }

    const payload: AdsPayload = {
      channel: "GOOGLE_ADS",
      adsActionType: recommendation.actionType,
      customerId,
      campaignId: recommendation.campaignId,
      campaignName: recommendation.campaignName,
      adGroupId: recommendation.adGroupId,
      adGroupName: recommendation.adGroupName,
      keywordText: recommendation.keywordText,
      matchType: recommendation.matchType,
      criterionId: null,
      current: recommendation.why,
      proposed: recommendation.what,
      evidence: recommendation.evidence,
      key: recommendation.key,
      executionMode: "DIRECT",
    };

    await prisma.proposedAction.create({
      data: {
        brandId,
        type: ActionType.GOOGLE_ADS,
        status: ActionStatus.PROPOSED,
        title: recommendation.title,
        summary: recommendation.what,
        rationale: recommendation.why,
        target: [recommendation.campaignName, recommendation.adGroupName]
          .filter(Boolean)
          .join(" / "),
        riskLevel: recommendation.risk as RiskLevel,
        payload: { ...payload },
      },
    });

    refresh();
    return { status: "done", message: "Proposed — approve it in the Action Center." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not propose it.",
    };
  }
}

/**
 * Records a change the user made in Google Ads themselves, from an execution
 * brief. Zuri stores the trail and says plainly that it did not run it.
 */
export async function markAdsExecutedExternally(
  _prevState: AdsProposalState,
  formData: FormData,
): Promise<AdsProposalState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  const key = String(formData.get("key") ?? "").trim();
  if (!brandId || !key) return { status: "error", message: "Missing recommendation." };

  try {
    const prisma = getPrisma();
    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return { status: "error", message: "Brand not found." };

    const customerId = brandCustomerId(brand);
    if (!customerId) {
      return { status: "error", message: "No Google Ads customer configured for this brand." };
    }

    const sync = await prisma.adsSync.findFirst({
      where: { brandId, customerId },
      orderBy: { startDate: "desc" },
      include: { rows: true },
    });
    if (!sync) return { status: "error", message: "Sync Google Ads first." };

    const rows = sync.rows as unknown as AdsRowLike[];
    const zuriKeywords = await prisma.keyword.findMany({
      where: { brandId },
      orderBy: { priorityScore: "desc" },
      select: { keyword: true, priorityScore: true, intent: true },
    });

    const recommendation = buildAdsRecommendations({
      campaigns: rows.filter((row) => row.level === "CAMPAIGN"),
      adGroups: rows.filter((row) => row.level === "AD_GROUP"),
      keywords: rows.filter((row) => row.level === "KEYWORD"),
      searchTerms: rows.filter((row) => row.level === "SEARCH_TERM"),
      zuriKeywords,
    }).find((item) => item.key === key);

    if (!recommendation) {
      return { status: "error", message: "That recommendation no longer applies." };
    }

    const existing = await prisma.proposedAction.findMany({
      where: { brandId, type: ActionType.GOOGLE_ADS },
      select: { id: true, payload: true },
    });
    const already = existing.find(
      (action) => readPayload(action.payload).key === key,
    );

    const payload = {
      channel: "GOOGLE_ADS" as const,
      adsActionType: (recommendation.actionType ?? "ADD_KEYWORD") as AdsActionType,
      customerId,
      campaignId: recommendation.campaignId,
      campaignName: recommendation.campaignName,
      adGroupId: recommendation.adGroupId,
      adGroupName: recommendation.adGroupName,
      keywordText: recommendation.keywordText,
      matchType: recommendation.matchType,
      criterionId: null,
      current: recommendation.why,
      proposed: recommendation.what,
      evidence: recommendation.evidence,
      key,
      executionMode: "EXTERNAL",
      implementedExternally: true,
      result: "Executed outside Zuri, confirmed by the user.",
    };

    if (already) {
      await prisma.proposedAction.update({
        where: { id: already.id },
        data: {
          status: ActionStatus.EXECUTED,
          executedAt: new Date(),
          payload: { ...payload },
        },
      });
    } else {
      await prisma.proposedAction.create({
        data: {
          brandId,
          type: ActionType.GOOGLE_ADS,
          status: ActionStatus.EXECUTED,
          executedAt: new Date(),
          title: recommendation.title,
          summary: recommendation.what,
          rationale: recommendation.why,
          target: [recommendation.campaignName, recommendation.adGroupName]
            .filter(Boolean)
            .join(" / "),
          riskLevel: recommendation.risk as RiskLevel,
          payload: { ...payload },
        },
      });
    }

    refresh();
    return { status: "done", message: "Recorded as executed outside Zuri." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not record it.",
    };
  }
}
