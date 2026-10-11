"use server";

import type { Prisma } from "@/lib/generated/prisma/client";
import {
  analyzeInteraction as runAnalysis,
  interactionSourceName,
  type Analysis,
  type Proposal,
} from "@/lib/interaction-learning";
import { getPrisma } from "@/lib/prisma";
import { type DecisionGroup } from "@/lib/prospect-research";
import { ensureScore } from "@/lib/prospect-scoring";
import { readQualification } from "@/lib/sales";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type LearningState = { status: "idle" | "done" | "error"; message: string };

function refresh(prospectId: string, campaignId: string) {
  revalidatePath(`/dashboard/sales/prospects/${prospectId}`);
  revalidatePath(`/dashboard/sales/campaigns/${campaignId}`);
  revalidatePath("/dashboard/sales/prospects");
}

/* -------------------------------------------------------------------------- */
/* Analyze                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Proposes changes from one interaction. The interaction is already saved;
 * whatever happens here, it stays saved.
 */
export async function analyzeInteraction(
  interactionId: string,
  _prevState: LearningState,
  _formData: FormData,
): Promise<LearningState> {
  await requireSession();
  const prisma = getPrisma();

  const interaction = await prisma.prospectInteraction.findUnique({
    where: { id: interactionId },
    include: {
      prospect: {
        include: {
          campaign: true,
          evidence: { where: { supersededAt: null, resolvedAt: null }, orderBy: { createdAt: "asc" } },
          contacts: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
          intelligence: { select: { whyThisProspect: true, nextBestAction: true } },
        },
      },
    },
  });
  if (!interaction) return { status: "error", message: "Interaction not found." };
  if (interaction.analysisStatus === "APPLIED") {
    return { status: "error", message: "This interaction has already been applied." };
  }

  const { prospect } = interaction;
  const qualification = readQualification(prospect.fitExplanation);

  try {
    const analysis = await runAnalysis({
      campaign: {
        name: prospect.campaign.name,
        offer: prospect.campaign.offer,
        geography: prospect.campaign.geography,
        industries: prospect.campaign.industries,
        targetCompanySize: prospect.campaign.targetCompanySize,
        preferredProfile: prospect.campaign.preferredProfile,
        exclusions: prospect.campaign.exclusions,
      },
      prospect: {
        name: prospect.name,
        status: prospect.status,
        country: prospect.country,
        city: prospect.city,
        industry: prospect.industry,
        fleetSize: prospect.fleetSize,
        employeeCount: prospect.employeeCount,
        revenue: prospect.revenue,
        tms: prospect.tms,
        erp: prospect.erp,
        crm: prospect.crm,
        telematics: prospect.telematics,
        clientPortal: prospect.clientPortal,
        driverApp: prospect.driverApp,
        detectedTools: prospect.detectedTools,
        nextAction: prospect.nextAction,
      },
      fit: {
        score: prospect.fitScore,
        confidence: prospect.fitConfidence,
        qualification: qualification ? (qualification.passes ? "passes" : `fails: ${qualification.reason}`) : null,
      },
      evidence: prospect.evidence.map((item) => ({ id: item.id, type: item.type, category: item.category, statement: item.statement })),
      contacts: prospect.contacts,
      intelligence: prospect.intelligence,
      interaction: {
        type: interaction.type,
        occurredAt: interaction.occurredAt,
        rawNote: interaction.rawNote,
        contactId: interaction.contactId,
        userResultingStatus: interaction.resultingStatus,
        userNextAction: interaction.nextAction,
        userNextActionAt: interaction.nextActionAt,
      },
    });

    await prisma.prospectInteraction.update({
      where: { id: interaction.id },
      data: {
        analysisStatus: "PROPOSED",
        analysis: analysis as unknown as Prisma.InputJsonValue,
        analysisError: null,
        analyzedAt: new Date(),
      },
    });
    refresh(prospect.id, prospect.campaignId);
    return {
      status: "done",
      message: `${analysis.proposals.length} proposed change${analysis.proposals.length === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    console.error("Interaction analysis failed", error);
    await prisma.prospectInteraction
      .update({
        where: { id: interaction.id },
        data: {
          analysisStatus: "FAILED",
          analysisError: error instanceof Error ? error.message.slice(0, 200) : "Analysis failed.",
        },
      })
      .catch(() => undefined);
    refresh(prospect.id, prospect.campaignId);
    return { status: "error", message: "Analysis failed. The interaction is saved — try again." };
  }
}

export async function dismissAnalysis(interactionId: string) {
  await requireSession();
  const interaction = await getPrisma().prospectInteraction.update({
    where: { id: interactionId },
    data: { analysisStatus: "DISMISSED" },
    select: { prospectId: true, prospect: { select: { campaignId: true } } },
  });
  refresh(interaction.prospectId, interaction.prospect.campaignId);
}

/* -------------------------------------------------------------------------- */
/* Apply                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Applies the approved proposals, and nothing else. Evidence is superseded or
 * resolved, never deleted. Dependencies are checked again here: a field update
 * or a supersession whose fact was not approved is skipped, not applied.
 * The fit is then recomputed by the shared scorer from active evidence.
 */
export async function applyInteractionAnalysis(
  interactionId: string,
  _prevState: LearningState,
  formData: FormData,
): Promise<LearningState> {
  await requireSession();
  const prisma = getPrisma();

  const interaction = await prisma.prospectInteraction.findUnique({
    where: { id: interactionId },
    include: { contact: true, prospect: true },
  });
  if (!interaction) return { status: "error", message: "Interaction not found." };
  if (interaction.analysisStatus !== "PROPOSED" || !interaction.analysis) {
    return { status: "error", message: "There is nothing to apply for this interaction." };
  }

  const analysis = interaction.analysis as unknown as Analysis;
  const selected = new Set(formData.getAll("proposal").map(String));
  const chosen = analysis.proposals.filter((proposal) => selected.has(proposal.id));
  if (!chosen.length) return { status: "error", message: "Select at least one change, or dismiss." };

  const { prospect } = interaction;
  const before = { fit: prospect.fitScore, confidence: prospect.fitConfidence, status: prospect.status };
  const skipped: string[] = [];
  const appliedIds: string[] = [];
  const sourceName = interactionSourceName(interaction.type, interaction.occurredAt, interaction.contact);

  const applied = await prisma.$transaction(async (tx) => {
    let count = 0;
    const factIds = new Map<string, string>();

    for (const proposal of chosen.filter((p): p is Extract<Proposal, { kind: "NEW_FACT" }> => p.kind === "NEW_FACT")) {
      const created = await tx.prospectEvidence.create({
        data: {
          prospectId: prospect.id,
          interactionId: interaction.id,
          type: "FACT",
          category: proposal.category,
          statement: proposal.statement,
          evidenceExcerpt: proposal.quote,
          sourceName,
          observedAt: interaction.occurredAt,
          confidence: proposal.confidence,
          // Heard directly from the company: a first-hand source.
          sourceQuality: "HIGH",
        },
      });
      factIds.set(proposal.id, created.id);
      appliedIds.push(proposal.id);
      count++;
    }

    const now = new Date();
    for (const proposal of chosen) {
      switch (proposal.kind) {
        case "RESOLVE_UNKNOWN":
        case "SUPERSEDE": {
          const byId = factIds.get(proposal.byFactId);
          if (!byId) {
            skipped.push(`“${proposal.evidenceStatement}” kept: its new fact was not approved.`);
            break;
          }
          const { count: changed } = await tx.prospectEvidence.updateMany({
            where: { id: proposal.evidenceId, prospectId: prospect.id, supersededAt: null, resolvedAt: null },
            data:
              proposal.kind === "RESOLVE_UNKNOWN"
                ? { resolvedAt: now, resolvedById: byId }
                : { supersededAt: now, supersededById: byId },
          });
          if (changed) {
            count++;
            appliedIds.push(proposal.id);
          } else skipped.push(`“${proposal.evidenceStatement}” had already changed.`);
          break;
        }
        case "FIELD": {
          const backed = proposal.byFactId
            ? factIds.has(proposal.byFactId)
            : Boolean(
                proposal.byEvidenceId &&
                  (await tx.prospectEvidence.findFirst({
                    where: { id: proposal.byEvidenceId, prospectId: prospect.id, type: "FACT", supersededAt: null },
                  })),
              );
          if (!backed) {
            skipped.push(`${proposal.field} not updated: its supporting fact was not approved.`);
            break;
          }
          const data: Prisma.ProspectUpdateInput =
            proposal.field === "fleetSize" || proposal.field === "employeeCount"
              ? { [proposal.field]: Number.parseInt(proposal.value, 10) }
              : proposal.field === "detectedTools"
                ? {
                    detectedTools: {
                      set: [...new Set([...(await tx.prospect.findUniqueOrThrow({ where: { id: prospect.id } })).detectedTools, proposal.value])],
                    },
                  }
                : { [proposal.field]: proposal.value };
          await tx.prospect.update({ where: { id: prospect.id }, data });
          appliedIds.push(proposal.id);
          count++;
          break;
        }
        case "CONTACT": {
          if (proposal.makePrimary) {
            await tx.prospectContact.updateMany({ where: { prospectId: prospect.id }, data: { isPrimary: false } });
          }
          const { count: changed } = await tx.prospectContact.updateMany({
            where: { id: proposal.contactId, prospectId: prospect.id },
            data: {
              ...(proposal.decisionRole ? { decisionRole: proposal.decisionRole as "UNKNOWN" } : {}),
              ...(proposal.makePrimary ? { isPrimary: true } : {}),
            },
          });
          if (changed) {
            count++;
            appliedIds.push(proposal.id);
          }
          break;
        }
        case "PIPELINE":
          await tx.prospect.update({ where: { id: prospect.id }, data: { status: proposal.to as "CONTACTED" } });
          appliedIds.push(proposal.id);
          count++;
          break;
        case "NEXT_ACTION":
          await tx.prospect.update({
            where: { id: prospect.id },
            data: { nextAction: proposal.text, nextActionAt: proposal.at ? new Date(proposal.at) : null },
          });
          appliedIds.push(proposal.id);
          count++;
          break;
      }
    }
    return count;
  });

  /* ---- re-score through the scoring workflow ------------------------------ */
  // Only factual changes move the scoring fingerprint: a pipeline or next-action
  // change alone reuses the stored snapshot without a model call.
  let rescoreError: string | null = null;
  let after = { fit: prospect.fitScore, confidence: prospect.fitConfidence as string };
  let rescored = false;
  try {
    const result = await ensureScore(prospect.id);
    after = { fit: result.snapshot.fitScore, confidence: result.snapshot.fitConfidence };
    rescored = result.rescored;
  } catch (error) {
    console.error("Re-score after interaction failed", error);
    rescoreError = "The changes were applied, but the fit could not be recalculated.";
  }

  const updated = await prisma.prospect.findUniqueOrThrow({ where: { id: prospect.id }, select: { status: true, nextAction: true } });
  await prisma.prospectInteraction.update({
    where: { id: interaction.id },
    data: {
      analysisStatus: "APPLIED",
      appliedAt: new Date(),
      outcome: {
        applied,
        appliedIds,
        skipped,
        rejected: analysis.proposals.length - chosen.length,
        fitBefore: before.fit,
        fitAfter: after.fit,
        confidenceBefore: before.confidence,
        confidenceAfter: after.confidence,
        pipelineBefore: before.status,
        pipelineAfter: updated.status,
        nextAction: updated.nextAction,
        rescored,
        rescoreError,
      },
    },
  });

  refresh(prospect.id, prospect.campaignId);
  return {
    status: rescoreError ? "error" : "done",
    message: rescoreError ?? `${applied} change${applied === 1 ? "" : "s"} applied.`,
  };
}

/* -------------------------------------------------------------------------- */
/* Decision group                                                             */
/* -------------------------------------------------------------------------- */

/** Keep / review / remove is a person's decision; this records it. */
export async function setDecisionGroup(prospectId: string, group: DecisionGroup, reason: string) {
  await requireSession();
  const prisma = getPrisma();
  const prospect = await prisma.prospect.findUniqueOrThrow({
    where: { id: prospectId },
    select: { fitExplanation: true, campaignId: true },
  });
  const explanation = (prospect.fitExplanation ?? {}) as Record<string, unknown>;
  const qualification = (explanation.qualification ?? {}) as Record<string, unknown>;
  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      fitExplanation: {
        ...explanation,
        qualification: {
          ...qualification,
          group,
          groupReason: reason,
          suggestedGroup: null,
          suggestedGroupReason: null,
          reviewedAt: new Date().toISOString(),
        },
      } as Prisma.InputJsonValue,
    },
  });
  refresh(prospectId, prospect.campaignId);
}
