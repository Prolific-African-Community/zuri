"use server";

import { getPrisma } from "@/lib/prisma";
import { ensureScore } from "@/lib/prospect-scoring";
import {
  generateProspectIntelligence,
  intelligenceFingerprint,
} from "@/lib/sales-intelligence";
import { loadIntelligenceInput } from "@/lib/sales-intelligence-input";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type IntelligenceState = { status: "idle" | "done" | "error"; message: string };

/**
 * Generates or refreshes the brief. It writes the interpreted layer and nothing
 * else: no evidence, and no fit — the brief explains the scoring snapshot.
 */
export async function generateIntelligence(
  prospectId: string,
  _prevState: IntelligenceState,
  _formData: FormData,
): Promise<IntelligenceState> {
  await requireSession();

  let input;
  let intelligence;
  try {
    input = await loadIntelligenceInput(prospectId);
    if (!input) return { status: "error", message: "Prospect not found." };
    // Scoring is its own workflow: unchanged inputs reuse the stored snapshot,
    // so refreshing the brief can never move fit or qualification.
    const { snapshot } = await ensureScore(prospectId, { frenchExplanations: true });
    intelligence = await generateProspectIntelligence(input, snapshot);
  } catch (error) {
    console.error("Prospect intelligence failed", error);
    return {
      status: "error",
      message:
        error instanceof Error && error.message.startsWith("OpenAI")
          ? error.message
          : "Could not generate intelligence. Nothing was changed — try again.",
    };
  }

  const data = {
    whyThisProspect: intelligence.whyThisProspect,
    likelyPainPoints: intelligence.likelyPainPoints,
    qualificationPriorities: intelligence.qualificationPriorities,
    decisionMakers: intelligence.decisionMakers,
    recommendedContactId: intelligence.recommendedContactId,
    entryPointRationale: intelligence.entryPointRationale,
    commercialAngle: intelligence.commercialAngle,
    discoveryQuestions: intelligence.discoveryQuestions,
    gatekeeperScript: intelligence.gatekeeperScript,
    decisionMakerOpening: intelligence.decisionMakerOpening,
    objections: intelligence.objections,
    negotiationLevers: intelligence.negotiationLevers,
    estimatedTicketMin: intelligence.estimatedTicketMin,
    estimatedTicketMax: intelligence.estimatedTicketMax,
    estimatedTicketCurrency: intelligence.estimatedTicketCurrency,
    estimatedTicketBasis: intelligence.estimatedTicketBasis,
    nextBestAction: intelligence.nextBestAction,
    nextBestActionRationale: intelligence.nextBestActionRationale,
    fitScore: intelligence.fitScore,
    fitConfidence: intelligence.fitConfidence,
    fitExplanation: intelligence.fitExplanation,
    model: intelligence.model,
    generatedAt: new Date(),
    sourceFingerprint: intelligenceFingerprint(input),
  };

  // The brief is written, and only the brief: fit was settled by the scoring
  // workflow above and is copied here for reference, never recomputed.
  const prospect = await getPrisma().$transaction(async (tx) => {
    await tx.prospectIntelligence.upsert({
      where: { prospectId },
      create: { prospectId, ...data },
      update: data,
    });
    return tx.prospect.findUniqueOrThrow({ where: { id: prospectId }, select: { campaignId: true } });
  });

  revalidatePath(`/dashboard/sales/prospects/${prospectId}`);
  revalidatePath(`/dashboard/sales/campaigns/${prospect.campaignId}`);
  revalidatePath("/dashboard/sales/prospects");
  return { status: "done", message: "Intelligence generated." };
}

/** Re-assesses fit on demand, only when the factual inputs changed. */
export async function rescoreProspectAction(prospectId: string) {
  await requireSession();
  const { rescored } = await ensureScore(prospectId);
  const prospect = await getPrisma().prospect.findUniqueOrThrow({
    where: { id: prospectId },
    select: { campaignId: true },
  });
  revalidatePath(`/dashboard/sales/prospects/${prospectId}`);
  revalidatePath(`/dashboard/sales/campaigns/${prospect.campaignId}`);
  revalidatePath("/dashboard/sales/prospects");
  return rescored;
}
