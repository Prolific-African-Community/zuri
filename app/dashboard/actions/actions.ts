"use server";

import {
  ActionStatus,
  ActionType,
  RiskLevel,
  SeoActionType,
} from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

function refresh() {
  revalidatePath("/dashboard/actions");
  revalidatePath("/dashboard/opportunities");
}

/**
 * Every SEO action type routes to the SEO channel for now. The map exists so
 * the next channels slot in without touching the call site.
 */
const CHANNEL_BY_SEO_ACTION: Record<SeoActionType, ActionType> = {
  CREATE_PAGE: ActionType.SEO,
  REFRESH_PAGE: ActionType.SEO,
  TECHNICAL_FIX: ActionType.SEO,
  INTERNAL_LINK: ActionType.SEO,
};

/** How much a change could disturb the live site if it went wrong. */
const RISK_BY_SEO_ACTION: Record<SeoActionType, RiskLevel> = {
  CREATE_PAGE: RiskLevel.LOW,
  REFRESH_PAGE: RiskLevel.MEDIUM,
  TECHNICAL_FIX: RiskLevel.LOW,
  INTERNAL_LINK: RiskLevel.LOW,
};

const WHAT_CHANGES: Record<SeoActionType, string> = {
  CREATE_PAGE: "Adds a new page to the site. Nothing existing is touched.",
  REFRESH_PAGE: "Rewrites an existing page that already receives traffic.",
  TECHNICAL_FIX: "Edits the page's title, meta description or markup only.",
  INTERNAL_LINK: "Adds links between pages that already exist.",
};

export type ActionState = {
  status: "idle" | "done" | "error";
  message: string;
};

export async function proposeActionFromOpportunity(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSession();

  const opportunityId = String(formData.get("opportunityId") ?? "").trim();
  if (!opportunityId) return { status: "error", message: "Missing opportunity." };

  try {
    const prisma = getPrisma();
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { seoBrief: { select: { id: true } } },
    });
    if (!opportunity) return { status: "error", message: "Opportunity not found." };
    if (!opportunity.actionType) {
      return {
        status: "error",
        message: "This opportunity has no SEO action type to propose from.",
      };
    }

    const existing = await prisma.proposedAction.findFirst({
      where: {
        opportunityId,
        status: { in: [ActionStatus.PROPOSED, ActionStatus.APPROVED] },
      },
    });
    if (existing) {
      return { status: "error", message: "An action is already open for this." };
    }

    const seoAction = opportunity.actionType;

    await prisma.proposedAction.create({
      data: {
        brandId: opportunity.brandId,
        opportunityId,
        type: CHANNEL_BY_SEO_ACTION[seoAction],
        status: ActionStatus.PROPOSED,
        title: opportunity.title,
        summary: WHAT_CHANGES[seoAction],
        rationale:
          opportunity.rationale ??
          opportunity.description ??
          "Derived from a scored SEO opportunity.",
        target: opportunity.targetUrl ?? opportunity.targetKeyword,
        riskLevel: RISK_BY_SEO_ACTION[seoAction],
        // Only what a future executor would need — no prose, no duplication.
        payload: {
          actionType: seoAction,
          targetUrl: opportunity.targetUrl,
          targetKeyword: opportunity.targetKeyword,
          briefId: opportunity.seoBrief?.id ?? null,
        },
      },
    });

    refresh();
    return { status: "done", message: "Action proposed." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not propose it.",
    };
  }
}

export async function approveAction(actionId: string) {
  await requireSession();

  await getPrisma().proposedAction.update({
    where: { id: actionId },
    data: { status: ActionStatus.APPROVED, approvedAt: new Date() },
  });
  refresh();
}

export async function dismissAction(actionId: string) {
  await requireSession();

  await getPrisma().proposedAction.update({
    where: { id: actionId },
    data: { status: ActionStatus.DISMISSED },
  });
  refresh();
}

export async function reopenAction(actionId: string) {
  await requireSession();

  await getPrisma().proposedAction.update({
    where: { id: actionId },
    data: { status: ActionStatus.PROPOSED, approvedAt: null },
  });
  refresh();
}

/**
 * The user did the work outside Zuri. Zuri records the confirmation and says
 * so plainly — it never claims to have made the change itself.
 */
export async function markActionImplemented(actionId: string) {
  await requireSession();

  const prisma = getPrisma();
  const action = await prisma.proposedAction.findUnique({ where: { id: actionId } });
  if (!action) return;

  const payload =
    typeof action.payload === "object" && action.payload !== null
      ? (action.payload as Record<string, unknown>)
      : {};

  await prisma.proposedAction.update({
    where: { id: actionId },
    data: {
      status: ActionStatus.EXECUTED,
      executedAt: new Date(),
      payload: { ...payload, implementedManually: true },
    },
  });
  refresh();
}
