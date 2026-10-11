/**
 * The scoring workflow: the one place a prospect's fit is decided.
 *
 * Fit is a snapshot of verdicts, one per campaign criterion, stored on the
 * prospect with a fingerprint of the factual inputs it was made from. As long
 * as those inputs do not change, the snapshot is reused as is — no model call,
 * so regenerating prose can never move a score or a qualification.
 *
 * When inputs do change, the criteria are assessed again (previous verdicts
 * are carried forward unless the new facts bear on them), geography is settled
 * deterministically wherever country data allows, every verdict must cite its
 * support, and the server does the arithmetic.
 */

import { SALES_LANGUAGE, detectLanguage } from "@/lib/sales-intelligence";
import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { callOpenAi, openAiModel } from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { qualificationVerdict, reviewFlags, suggestDecisionGroup } from "@/lib/prospect-research";
import { readQualification } from "@/lib/sales";
import {
  EPISTEMIC_RULES,
  FIT_FACTORS_SCHEMA,
  SCORING_FIELDS,
  SCORING_RULE,
  computeConfidence,
  scoreFitFactors,
  scoringRubric,
  type FitFactor,
  type IntelligenceInput,
} from "@/lib/sales-intelligence";
import { loadIntelligenceInput } from "@/lib/sales-intelligence-input";
import { applyGeographyCheck, checkGeography } from "@/lib/geography";

/* -------------------------------------------------------------------------- */
/* Fingerprint                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Only what can change a verdict: the campaign's criteria, the prospect's
 * factual fields, active evidence and contact roles. Pipeline status, next
 * actions, notes and generated prose are deliberately left out.
 */
export function scoringFingerprint(input: IntelligenceInput) {
  const rubric = scoringRubric(input.campaign);
  const fields = Object.fromEntries(
    SCORING_FIELDS.map((name) => [name, (input.prospect as Record<string, unknown>)[name] ?? null]),
  );
  const payload = {
    rubric,
    exclusions: input.campaign.exclusions,
    fields,
    evidence: input.evidence
      .map((item) => ({ id: item.id, type: item.type, category: item.category, statement: item.statement }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    contacts: input.contacts
      .map((contact) => ({ id: contact.id, jobTitle: contact.jobTitle, decisionRole: contact.decisionRole }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32);
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

const PROMPT = [
  "You assess how well ONE stored prospect matches its sales campaign, reasoning only from the JSON given. You do not research.",
  "",
  ...EPISTEMIC_RULES.slice(0, 5),
  "",
  SCORING_RULE,
  "",
  "STABILITY: previousVerdicts holds the last assessment. Keep each previous verdict unchanged unless the evidence or fields relevant to that criterion changed or the previous verdict is clearly unsupported. Re-assessing the same facts must give the same verdicts.",
  "geographyCheck, when present, is authoritative for the geography criterion: return exactly that verdict.",
  "Write labels and rationales in natural, professional French.",
].join("\n");

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fitFactors"],
  properties: { fitFactors: FIT_FACTORS_SCHEMA },
} as const;

export type ScoringSnapshot = {
  fitScore: number;
  fitConfidence: "LOW" | "MEDIUM" | "HIGH";
  fitExplanation: {
    factors: FitFactor[];
    confidenceNotes: string[];
    coverage: number;
  };
};

type StoredExplanation = {
  factors?: FitFactor[];
  confidenceNotes?: string[];
  coverage?: number;
  strongestReason?: string;
  scoring?: { fingerprint?: string; assessedAt?: string };
} & Record<string, unknown>;

/** True when the stored snapshot no longer matches the factual inputs. */
export async function scoringIsStale(prospectId: string) {
  const [input, prospect] = await Promise.all([
    loadIntelligenceInput(prospectId),
    getPrisma().prospect.findUnique({ where: { id: prospectId }, select: { fitExplanation: true } }),
  ]);
  if (!input || !prospect) return false;
  const stored = (prospect.fitExplanation ?? {}) as StoredExplanation;
  return stored.scoring?.fingerprint !== scoringFingerprint(input);
}

/**
 * Returns the prospect's scoring snapshot, re-assessing only when the factual
 * inputs changed (or when forced). The decision group a person chose is never
 * changed here; a different group is only suggested.
 */
export async function ensureScore(
  prospectId: string,
  options: { force?: boolean; frenchExplanations?: boolean } = {},
): Promise<{ snapshot: ScoringSnapshot; rescored: boolean }> {
  const prisma = getPrisma();
  const input = await loadIntelligenceInput(prospectId);
  const prospect = await prisma.prospect.findUnique({
    where: { id: prospectId },
    select: { fitScore: true, fitConfidence: true, fitExplanation: true },
  });
  if (!input || !prospect) throw new Error("Prospect not found.");

  const fingerprint = scoringFingerprint(input);
  const stored = (prospect.fitExplanation ?? {}) as StoredExplanation;

  // Explanations written before the French-only policy are regenerated on request; verdicts stay stable.
  const explanationsInOtherLanguage =
    options.frenchExplanations &&
    Array.isArray(stored.factors) &&
    (() => {
      const detected = detectLanguage(stored.factors.map((factor) => `${factor.label} ${factor.rationale ?? ""}`).join(" "));
      return Boolean(detected && detected !== SALES_LANGUAGE);
    })();

  if (
    !options.force &&
    !explanationsInOtherLanguage &&
    stored.scoring?.fingerprint === fingerprint &&
    Array.isArray(stored.factors) &&
    prospect.fitScore !== null
  ) {
    return {
      rescored: false,
      snapshot: {
        fitScore: prospect.fitScore,
        fitConfidence: prospect.fitConfidence,
        fitExplanation: {
          factors: stored.factors,
          confidenceNotes: stored.confidenceNotes ?? [],
          coverage: stored.coverage ?? 0,
        },
      },
    };
  }

  const rubric = scoringRubric(input.campaign);
  const evidenceRef = new Map(input.evidence.map((item, index) => [`E${index + 1}`, item]));
  const refById = new Map([...evidenceRef.entries()].map(([ref, item]) => [item.id, ref]));
  const fields = Object.fromEntries(
    SCORING_FIELDS.map((name) => [name, (input.prospect as Record<string, unknown>)[name] ?? null]),
  );
  const geography = checkGeography(input.campaign.geography, {
    country: input.prospect.country,
    city: input.prospect.city,
    locations: input.prospect.locations,
  });

  const raw = (await callOpenAi(
    PROMPT,
    {
      campaign: {
        offer: input.campaign.offer,
        geography: input.campaign.geography,
        industries: input.campaign.industries,
        targetCompanySize: input.campaign.targetCompanySize,
        preferredProfile: input.campaign.preferredProfile,
        exclusions: input.campaign.exclusions,
      },
      scoringRubric: rubric,
      prospect: fields,
      evidence: [...evidenceRef.entries()].map(([ref, item]) => ({
        ref,
        type: item.type,
        category: item.category,
        statement: item.statement,
      })),
      contacts: input.contacts.map((contact) => ({ jobTitle: contact.jobTitle, decisionRole: contact.decisionRole })),
      previousVerdicts: (stored.factors ?? [])
        .filter((factor) => factor.criterion)
        .map((factor) => ({
          criterion: factor.criterion,
          verdict: factor.assessment,
          rationale: factor.rationale ?? "",
          evidenceRefs: (factor.supportingEvidenceIds ?? [])
            .map((id) => refById.get(id))
            .filter(Boolean),
          supportingFields: factor.supportingFields ?? [],
        })),
      geographyCheck: geography,
    },
    "prospect_scoring",
    SCHEMA,
  )) as { fitFactors?: unknown };

  // Geography decided by data overrides whatever the model returned for it.
  const rawFactors = applyGeographyCheck(raw.fitFactors, rubric, geography);
  const score = scoreFitFactors(rawFactors, evidenceRef, rubric, { fields });
  const factors = score.factors.map((factor) => ({
    ...factor,
    supportingEvidenceIds: factor.evidenceRefs
      .map((ref) => evidenceRef.get(ref)?.id)
      .filter((id): id is string => Boolean(id)),
  }));
  const { level, notes } = computeConfidence(input, score.coverage);

  const verdict = qualificationVerdict({
    fitScore: score.fitScore,
    fitConfidence: level,
    coverage: score.coverage,
    factors,
    hasFact: input.evidence.some((item) => item.type === "FACT"),
    strongestReason: stored.strongestReason ?? "",
  });
  const flags = reviewFlags({
    targetCompanySize: input.campaign.targetCompanySize,
    fleetSize: input.prospect.fleetSize ?? null,
    employeeCount: input.prospect.employeeCount ?? null,
    industry: input.prospect.industry ?? null,
    activities: input.prospect.activities ?? [],
    fitScore: score.fitScore,
    coverage: score.coverage,
    factors,
  });
  const suggestion = suggestDecisionGroup({ verdict, coverage: score.coverage, fitConfidence: level, factors, flags });
  const previousQualification = readQualification(prospect.fitExplanation);
  const group = previousQualification?.group ?? null;

  const explanation = {
    factors,
    confidenceNotes: notes,
    coverage: score.coverage,
    ...(stored.strongestReason ? { strongestReason: stored.strongestReason } : {}),
    scoring: { fingerprint, assessedAt: new Date().toISOString(), model: openAiModel() },
    qualification: {
      passes: verdict.passes,
      reason: verdict.reason,
      flags,
      // The group a person chose stays; a different one is only suggested.
      group,
      groupReason: previousQualification?.groupReason ?? null,
      suggestedGroup: suggestion.group !== group ? suggestion.group : null,
      suggestedGroupReason: suggestion.group !== group ? suggestion.reason : null,
      reviewedAt: new Date().toISOString(),
    },
  };

  await prisma.prospect.update({
    where: { id: prospectId },
    data: {
      fitScore: score.fitScore,
      fitConfidence: level,
      fitExplanation: explanation as unknown as Prisma.InputJsonValue,
    },
  });

  return {
    rescored: true,
    snapshot: {
      fitScore: score.fitScore,
      fitConfidence: level,
      fitExplanation: { factors, confidenceNotes: notes, coverage: score.coverage },
    },
  };
}
