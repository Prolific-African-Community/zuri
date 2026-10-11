/**
 * Prospect Intelligence: interprets what Zuri already knows about a prospect.
 * It never researches and never writes evidence.
 *
 * The model reasons, but the server keeps the guarantees:
 * - every FACT it leans on must cite a stored FACT, or it is downgraded;
 * - every contact it names must be a stored contact, or it is dropped;
 * - fit is summed here from validated factors (inferences at half weight);
 * - confidence is computed here from evidence coverage, not asked for;
 * - the ticket comes from the campaign range, never from the model.
 */

import { createHash } from "node:crypto";
import { callOpenAi, openAiModel } from "@/lib/openai";

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

export type IntelligenceInput = {
  brand: {
    name: string;
    language: string;
    positioning: string;
    valueProposition: string;
    voiceDescription: string;
    voiceRules: { type: string; rule: string }[];
  };
  campaign: {
    name: string;
    offer: string;
    description: string | null;
    geography: string[];
    industries: string[];
    targetCompanySize: string | null;
    idealCustomerProfile: string;
    painPoints: string[];
    valueProposition: string;
    primaryAngle: string;
    targetTicketMin: number | null;
    targetTicketMax: number | null;
    currency: string | null;
    preferredProfile: string[];
    exclusions: string[];
    scoringCriteria: unknown;
  };
  prospect: {
    name: string;
    website: string | null;
    country: string | null;
    city: string | null;
    industry: string | null;
    description: string | null;
    employeeCount: number | null;
    revenue: string | null;
    fleetSize: number | null;
    activities: string[];
    locations: string[];
    digitalMaturityScore: number | null;
    detectedTools: string[];
    tms: string | null;
    erp: string | null;
    crm: string | null;
    telematics: string | null;
    clientPortal: string | null;
    driverApp: string | null;
    visibleAutomations: string[];
    priority: string;
    status: string;
    nextAction: string | null;
    nextActionAt: Date | null;
    lastContactAt: Date | null;
    notes: string | null;
  };
  evidence: {
    id: string;
    type: string;
    category: string;
    statement: string;
    sourceName: string | null;
    sourceUrl: string | null;
    confidence: string;
  }[];
  contacts: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    jobTitle: string | null;
    seniority: string | null;
    decisionRole: string;
    isPrimary: boolean;
    hasEmail: boolean;
    hasPhone: boolean;
  }[];
  interactions: {
    type: string;
    occurredAt: Date;
    rawNote: string;
    contactId: string | null;
    previousStatus: string | null;
    resultingStatus: string | null;
    nextAction: string | null;
  }[];
};

/**
 * A stable hash of everything the brief is built from. Fit fields are left
 * out on purpose: generation writes them, and they must not make the brief
 * look stale the moment it is saved.
 */
export function intelligenceFingerprint(input: IntelligenceInput) {
  const stable = {
    ...input,
    evidence: [...input.evidence].sort((a, b) => a.id.localeCompare(b.id)),
    contacts: [...input.contacts].sort((a, b) => a.id.localeCompare(b.id)),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 32);
}

/* -------------------------------------------------------------------------- */
/* Sales language                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Sales Intelligence speaks one language: everything Zuri writes for the
 * salesperson or for the prospect is French, whatever the prospect's country.
 * Source pages and notes stay as written; Zuri summarises them in French.
 */
export const SALES_LANGUAGE = "French";

/** The instruction every Sales prompt carries, so no model call drifts into another language. */
export const FRENCH_OUTPUT_RULE =
  "LANGUAGE: write every text field you return in natural, professional French — whatever the prospect's country, the language of its website or the language of the notes. Never write Dutch, German or English prose. Quoted excerpts stay exactly as written in their source; proper nouns, product names and enum values (FACT, MET, DECISION_MAKER…) stay as they are.";

const LANGUAGE_MARKERS: Record<string, RegExp> = {
  French: /\b(vous|votre|nous|est|les|des|pour|avec|une|sur|qui|dans)\b/gi,
  English: /\b(you|your|we|the|is|are|for|with|and|what|how|our)\b/gi,
  Dutch: /\b(u|uw|wij|het|een|voor|met|zijn|van|niet|hoe|wat)\b/gi,
  German: /\b(sie|ihr|wir|der|die|das|und|nicht|mit|wie|was|ist)\b/gi,
};

/** The language a piece of generated sales copy is mostly written in, by common words. */
export function detectLanguage(text: string): string | null {
  const counts = Object.entries(LANGUAGE_MARKERS)
    .map(([language, pattern]) => [language, text.match(pattern)?.length ?? 0] as const)
    .sort((a, b) => b[1] - a[1]);
  return counts[0][1] >= 3 ? counts[0][0] : null;
}

/* -------------------------------------------------------------------------- */
/* Prompt                                                                     */
/* -------------------------------------------------------------------------- */

/** Rules about facts, inferences and unknowns, shared by every Sales prompt. */
export const EPISTEMIC_RULES = [
  "EPISTEMIC RULES — these override everything else:",
  "1. A FACT is only what appears in evidence items of type FACT, in prospect fields, or in interactions. Cite FACT evidence by its ref (E1, E2…) in the evidenceRefs fields.",
  "2. An INFERENCE is your reasoned hypothesis. Mark it through the basis field and phrase it as a hypothesis ('may', 'likely', 'to be validated'). Never phrase an inference as a fact.",
  "3. Absence of evidence is NEVER a negative fact. If no TMS is recorded, the TMS is UNKNOWN — never write 'they have no TMS' or 'they use Excel'. You may infer that a stack may be fragmented, as a hypothesis that still needs qualification.",
  "4. UNKNOWN evidence items and missing fields are things to qualify. They must never lower fit.",
  "5. Only name people who appear in contacts. Never invent a person, a name, a title or a phone number.",
  "6. Scripts and questions must not reveal unverified assumptions as facts. Write 'Comment gérez-vous aujourd'hui la planification des remorques ?', never 'Puisque vous planifiez vos remorques sur Excel…'. Never say 'we noticed you use X' unless X is a FACT. Never claim the brand has audited or looked into their systems. No fake familiarity.",
  "7. Refs (E1, C1…) belong in the evidenceRefs and contactRef fields ONLY. Never write a ref inside any prose: refer to people by their name or role and to facts by what they say.",
  "8. Never prefix text with labels such as 'INFERENCE:' or 'FACT:' — the basis field carries that.",
  "9. The caller's own name is not known: in scripts write the placeholder [Prénom Nom], never an invented name.",
];

/** How fit factors are produced, shared by intelligence, research and re-scoring. */
export const SCORING_RULE =
  "SCORING: use the scoringRubric given in the context. Return exactly one factor for EVERY rubric criterion, in rubric order, with rubricCriterion copied exactly and an assessment: MET (full maxPoints), PARTLY (part of it), NOT_MET (0 points — the evidence shows it is not satisfied, e.g. headquarters outside the target geography, a fleet below the target size), or UNKNOWN (0 points — nothing speaks to it). Never use UNKNOWN when the evidence answers the criterion, even unfavourably. When a city or country is recorded, decide a geography criterion from it with ordinary geographic knowledge (which region or country a town belongs to) — that is assessment, not speculation. Exclusion factors outside the rubric use an empty rubricCriterion and assessment NOT_MET. You may add a negative factor for a stated exclusion. A geography criterion is met by where the company is BASED or has operating sites, as a page states it — never by the places it delivers to or serves. A company whose stated headquarters and sites are all outside the target geography scores 0 on it. Criteria that describe an ABSENCE (e.g. 'no apparent modern TMS', 'fragmented digital tooling') can only be supported by positive evidence such as a named legacy tool or a stated manual process — never award them because nothing was found. Each factor has points between -20 and +25 and a basis: PROSPECT_FIELD, FACT (must cite FACT refs), INFERENCE (cite supporting refs if any; its points are halved later), or CAMPAIGN_CRITERION. Use campaign scoringCriteria, preferredProfile and exclusions. A negative factor must rest on a FACT or prospect field (e.g. a stated exclusion), never on something unknown. Every MET, PARTLY or NOT_MET verdict must cite what it rests on: stored evidence refs in evidenceRefs and/or filled structured fields in supportingFields — a verdict with neither is treated as UNKNOWN. NOT_MET needs positive proof of failure (a FACT or a structured field), never an inference or a gap. rationale: one short sentence saying why. Do not invent signals. Do not output a total.";

const SYSTEM_PROMPT = [
  FRENCH_OUTPUT_RULE,
  "This covers the whole brief: whyThisProspect, pain points and rationales, qualification priorities, decision-maker relevance, entry point rationale, commercialAngle, discoveryQuestions, gatekeeperScript, decisionMakerOpening, objections and responses, negotiation levers, ticket basis, nextBestAction and its rationale.",
  "",
  "You are a senior B2B sales strategist preparing a call brief for one prospect. You reason ONLY from the JSON you are given. You do not research, and you know nothing about this company beyond that JSON.",
  "",
  ...EPISTEMIC_RULES,
  "",
  "FIT: the fitAssessment given is final — it was scored separately and must not be re-scored or contradicted. Use it to explain why the prospect fits and what still needs qualifying.",
  "",
  "CONTENT:",
  "- whyThisProspect: at most 3 short paragraphs: why it matches the campaign, what makes it interesting, what still needs validating. No generic sales language.",
  "- likelyPainPoints: ranked, most important first. basis FACT only if a FACT ref supports it, otherwise INFERENCE.",
  "- qualificationPriorities: the most commercially important unknowns, ranked by impact on qualification (e.g. current TMS, how dispatch is organised, number of dispatchers, trailer planning, driver communication, manual re-entry, reporting, customer visibility, purchasing authority, timing and budget). Include stored UNKNOWN items and gaps you identify.",
  "- decisionMakers: one entry per contact ref given, with relevance and a contact priority. recommendedContactRef is the best entry point for this offer — not necessarily the most senior person — or an empty string if none is suitable.",
  "- commercialAngle: one specific operational hypothesis tailored to the campaign, the company profile and the likely pain. Not 'digital transformation'.",
  "- discoveryQuestions: 5 to 8 open questions that resolve the unknowns and test the inferences.",
  "- gatekeeperScript.opening: a short phone line introducing the caller by name (use the caller name from the brand context when given) and asking for the person who runs the relevant function. gatekeeperScript.ifAskedWhy: the answer to 'C'est à quel sujet ?'.",
  "- decisionMakerOpening: identity, relevance, one concrete use case drawn from the offer, one hypothesis framed as such ('Given the complexity of an operation like yours…'), one discovery question.",
  "- objections: 4 to 6, including where relevant: already has software, send me an email, not interested, no budget, built something internally. Consultative responses, never aggressive.",
  "- negotiationLevers: only plausible levers such as phased rollout, pilot scope, integration rather than replacement, one workflow first, fixed discovery phase, ROI from removed manual work. Never invent discounts or terms.",
  "- ticketRationale: explain how much the campaign ticket range can be trusted for this prospect, or say there is not enough information. Never propose a price.",
  "- nextBestAction: exactly one concrete action. Use the pipeline status and interactions. If prospect.nextAction exists and is still relevant, keep it rather than replacing it.",
  "",
  "Brand voice: premium, direct, concrete, human. No agency buzzwords, no innovation claims. The campaign context takes priority over generic brand copy.",
].join("\n");

const REFS = { type: "array", items: { type: "string" } } as const;

/** Structured prospect fields a verdict may rest on, besides stored evidence. */
export const SCORING_FIELDS = [
  "country",
  "city",
  "industry",
  "description",
  "employeeCount",
  "fleetSize",
  "revenue",
  "activities",
  "locations",
  "tms",
  "erp",
  "crm",
  "telematics",
  "clientPortal",
  "driverApp",
  "detectedTools",
  "visibleAutomations",
] as const;

/** The fit-factor array every scoring call returns. */
export const FIT_FACTORS_SCHEMA = {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "rubricCriterion", "assessment", "points", "basis", "evidenceRefs", "supportingFields", "rationale"],
        properties: {
          label: { type: "string" },
          rubricCriterion: { type: "string" },
          assessment: { type: "string", enum: ["MET", "PARTLY", "NOT_MET", "UNKNOWN"] },
          points: { type: "integer" },
          basis: {
            type: "string",
            enum: ["PROSPECT_FIELD", "FACT", "INFERENCE", "CAMPAIGN_CRITERION"],
          },
          evidenceRefs: REFS,
          supportingFields: { type: "array", items: { type: "string", enum: [...SCORING_FIELDS] } },
          rationale: { type: "string" },
        },
      },
    } as const;

const CONFIDENCE = { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] } as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "whyThisProspect",
    "likelyPainPoints",
    "qualificationPriorities",
    "decisionMakers",
    "recommendedContactRef",
    "entryPointRationale",
    "commercialAngle",
    "discoveryQuestions",
    "gatekeeperScript",
    "decisionMakerOpening",
    "objections",
    "negotiationLevers",
    "ticketRationale",
    "nextBestAction",
    "nextBestActionRationale",
  ],
  properties: {
    whyThisProspect: { type: "string" },
    likelyPainPoints: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["pain", "basis", "rationale", "confidence", "evidenceRefs"],
        properties: {
          pain: { type: "string" },
          basis: { type: "string", enum: ["FACT", "INFERENCE"] },
          rationale: { type: "string" },
          confidence: CONFIDENCE,
          evidenceRefs: REFS,
        },
      },
    },
    qualificationPriorities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "whyItMatters", "impact"],
        properties: {
          question: { type: "string" },
          whyItMatters: { type: "string" },
          impact: CONFIDENCE,
        },
      },
    },
    decisionMakers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["contactRef", "relevance", "priority"],
        properties: {
          contactRef: { type: "string" },
          relevance: { type: "string" },
          priority: CONFIDENCE,
        },
      },
    },
    recommendedContactRef: { type: "string" },
    entryPointRationale: { type: "string" },
    commercialAngle: { type: "string" },
    discoveryQuestions: { type: "array", items: { type: "string" } },
    gatekeeperScript: {
      type: "object",
      additionalProperties: false,
      required: ["opening", "ifAskedWhy"],
      properties: { opening: { type: "string" }, ifAskedWhy: { type: "string" } },
    },
    decisionMakerOpening: { type: "string" },
    objections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["objection", "response"],
        properties: { objection: { type: "string" }, response: { type: "string" } },
      },
    },
    negotiationLevers: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["lever", "rationale"],
        properties: { lever: { type: "string" }, rationale: { type: "string" } },
      },
    },
    ticketRationale: { type: "string" },
    nextBestAction: { type: "string" },
    nextBestActionRationale: { type: "string" },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Output                                                                     */
/* -------------------------------------------------------------------------- */

export type FitFactor = {
  label: string;
  /** The rubric criterion this factor assesses, or null for an exclusion. */
  criterion: string | null;
  /** The criterion's weight in the rubric, when it is one. */
  weight: number | null;
  rationale: string;
  /** Structured fields this verdict rests on, besides evidence. */
  supportingFields: string[];
  /** Stored evidence ids this verdict rests on (filled by the scoring workflow). */
  supportingEvidenceIds?: string[];
  /** MET / PARTLY / NOT_MET count as assessed; UNKNOWN leaves the criterion out. */
  assessment: "MET" | "PARTLY" | "NOT_MET" | "UNKNOWN";
  points: number;
  basis: "PROSPECT_FIELD" | "FACT" | "INFERENCE" | "CAMPAIGN_CRITERION";
  evidenceRefs: string[];
  /** Points after validation and weighting; 0 when the factor was rejected. */
  applied: number;
  note: string | null;
};

export type PainPoint = {
  pain: string;
  basis: "FACT" | "INFERENCE";
  rationale: string;
  confidence: string;
  evidenceIds: string[];
};

export type QualificationPriority = { question: string; whyItMatters: string; impact: string };
export type DecisionMakerAssessment = { contactId: string; relevance: string; priority: string };

export type Intelligence = {
  whyThisProspect: string;
  likelyPainPoints: PainPoint[];
  qualificationPriorities: QualificationPriority[];
  decisionMakers: DecisionMakerAssessment[];
  recommendedContactId: string | null;
  entryPointRationale: string;
  commercialAngle: string;
  discoveryQuestions: string[];
  gatekeeperScript: { opening: string; ifAskedWhy: string };
  decisionMakerOpening: string;
  objections: { objection: string; response: string }[];
  negotiationLevers: { lever: string; rationale: string }[];
  estimatedTicketMin: number | null;
  estimatedTicketMax: number | null;
  estimatedTicketCurrency: string | null;
  estimatedTicketBasis: string;
  nextBestAction: string;
  nextBestActionRationale: string;
  fitScore: number;
  fitConfidence: "LOW" | "MEDIUM" | "HIGH";
  fitExplanation: { factors: FitFactor[]; confidenceNotes: string[]; coverage: number };
  model: string;
};

const text = (value: unknown) => String(value ?? "").trim();

/**
 * Last line of defence on prose: refs are replaced by real names or removed,
 * and basis labels the model was told not to write are stripped.
 */
function cleanProse(
  value: unknown,
  contactNames: Map<string, string>,
): string {
  return text(value)
    .replace(/^\s*(INFERENCE|FACT|UNKNOWN)\s*:\s*/i, "")
    .replace(/\s*\((?:\s*[EC]\d+\s*,?)+\)/g, "")
    .replace(/\b(C\d+)\b/g, (ref) => contactNames.get(ref) ?? "this contact")
    .replace(/\b(INFERENCE|FACT)\s*:\s*/g, "")
    .replace(/\bE\d+\b/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trim();
}
const list = (value: unknown) => (Array.isArray(value) ? value : []);
const confidence = (value: unknown) =>
  ["LOW", "MEDIUM", "HIGH"].includes(String(value)) ? String(value) : "LOW";

/**
 * The points table fit is scored against. Configured campaign criteria win;
 * otherwise a table is derived from the campaign itself, so a company that
 * clearly meets every criterion can reach a high score and weights are never
 * left to the model's taste.
 */
export function scoringRubric(campaign: {
  scoringCriteria: unknown;
  geography: string[];
  industries: string[];
  targetCompanySize: string | null;
  preferredProfile: string[];
}) {
  const configured = (Array.isArray(campaign.scoringCriteria) ? campaign.scoringCriteria : [])
    .map((entry) =>
      typeof entry === "string"
        ? { criterion: entry, maxPoints: null as number | null }
        : {
            criterion: String((entry as { label?: unknown })?.label ?? ""),
            maxPoints:
              typeof (entry as { weight?: unknown })?.weight === "number"
                ? ((entry as { weight: number }).weight)
                : null,
          },
    )
    .filter((entry) => entry.criterion);
  if (configured.length) {
    const even = Math.round(100 / configured.length);
    return configured.map((entry) => ({
      criterion: entry.criterion,
      maxPoints: Math.min(25, entry.maxPoints ?? even),
    }));
  }

  const rubric: { criterion: string; maxPoints: number }[] = [];
  if (campaign.geography.length) {
    rubric.push({ criterion: `Operates in the target geography (${campaign.geography.join(", ")})`, maxPoints: 15 });
  }
  if (campaign.industries.length) {
    rubric.push({ criterion: `Belongs to the target industries (${campaign.industries.join(", ")})`, maxPoints: 15 });
  }
  if (campaign.targetCompanySize) {
    rubric.push({ criterion: `Company size within ${campaign.targetCompanySize}`, maxPoints: 20 });
  }
  const profile = campaign.preferredProfile.slice(0, 6);
  const each = profile.length ? Math.max(5, Math.floor(50 / profile.length)) : 0;
  for (const item of profile) rubric.push({ criterion: item, maxPoints: each });
  return rubric;
}

/** Evidence as the scorer sees it: enough to check what a factor cites. */
export type ScoredEvidence = { type: string };

export type FitScore = {
  factors: FitFactor[];
  fitScore: number;
  /** Share of the rubric's points the evidence could speak to, 0–1. */
  coverage: number;
  assessedPoints: number;
  totalPoints: number;
};

const squashLabel = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * The one place fit arithmetic happens, shared by intelligence and research.
 *
 * Fit is how attractive the prospect is on the criteria the evidence speaks
 * to: earned points over the maximum of the criteria actually assessed. A
 * criterion nothing speaks to is left out of both — it lowers confidence
 * (through coverage), never fit. Each factor is validated first: a claimed
 * FACT without a stored fact counts as an inference (half weight), and no
 * unknown or inference can pull fit down. Exclusion factors outside the rubric
 * subtract directly.
 */
export function scoreFitFactors<E extends ScoredEvidence>(
  rawFactors: unknown,
  evidenceRef: Map<string, E>,
  rubric: { criterion: string; maxPoints: number }[],
  options: {
    label?: (value: unknown) => string;
    /** Structured values a verdict may cite; an empty one supports nothing. */
    fields?: Record<string, unknown>;
  } = {},
): FitScore {
  const label = options.label ?? ((value: unknown) => String(value ?? "").trim());
  const filled = (name: string) => {
    const value = options.fields?.[name];
    return Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined && String(value).trim() !== "";
  };
  const refsOf = (value: unknown) =>
    (Array.isArray(value) ? value : [])
      .map((ref) => String(ref ?? "").trim())
      .filter((ref) => evidenceRef.has(ref));
  const rubricByKey = new Map(rubric.map((entry) => [squashLabel(entry.criterion), entry]));

  const factors: FitFactor[] = (Array.isArray(rawFactors) ? rawFactors : []).map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    const rawBasis = String(item.basis ?? "");
    const basis = (
      ["PROSPECT_FIELD", "FACT", "INFERENCE", "CAMPAIGN_CRITERION"].includes(rawBasis)
        ? rawBasis
        : "INFERENCE"
    ) as FitFactor["basis"];
    const rubricEntry = rubricByKey.get(squashLabel(String(item.rubricCriterion ?? ""))) ?? null;
    const rawAssessment = String(item.assessment ?? "");
    let assessment = (
      ["MET", "PARTLY", "NOT_MET", "UNKNOWN"].includes(rawAssessment) ? rawAssessment : "UNKNOWN"
    ) as FitFactor["assessment"];
    const supportingFields = (Array.isArray(item.supportingFields) ? item.supportingFields : [])
      .map((field) => String(field))
      .filter(filled);
    let supportNote: string | null = null;
    const cap = rubricEntry ? rubricEntry.maxPoints : 25;
    const n = Math.round(Number(item.points));
    const points = Number.isFinite(n) ? Math.min(cap, Math.max(-20, n)) : 0;
    const refs = refsOf(item.evidenceRefs);
    const cited = refs.map((ref) => evidenceRef.get(ref)!);

    if (rubricEntry && assessment !== "UNKNOWN") {
      // A verdict rests on stored evidence or a filled field, or it is unknown.
      if (!refs.length && !supportingFields.length) {
        assessment = "UNKNOWN";
        supportNote = "No stored support: treated as unknown.";
      } else if (
        assessment === "NOT_MET" &&
        !supportingFields.length &&
        !cited.some((evidence) => evidence.type === "FACT")
      ) {
        // Failure needs proof: an inference or a gap never makes a criterion NOT_MET.
        assessment = "UNKNOWN";
        supportNote = "Non atteint sans fait ni champ à l’appui : traité comme inconnu.";
      }
    }

    let applied = points;
    let note: string | null = supportNote;

    // Not met or not known earns nothing, whatever points were proposed.
    if (rubricEntry && (assessment === "NOT_MET" || assessment === "UNKNOWN")) {
      applied = 0;
      note = supportNote ?? (assessment === "NOT_MET" ? "Non atteint : évalué, 0 point." : "Inconnu : non évalué.");
    } else if (basis === "FACT" && !cited.some((evidence) => evidence.type === "FACT")) {
      applied = Math.round(points / 2);
      note = "Aucun fait enregistré ne l’étaye ; compté comme une inférence.";
    } else if (basis === "INFERENCE") {
      applied = Math.round(points / 2);
      note = "Inférence : demi-poids.";
    }
    if (applied < 0 && cited.some((evidence) => evidence.type === "UNKNOWN")) {
      applied = 0;
      note = "Repose sur une inconnue : affecte la confiance, pas le fit.";
    }
    if (applied < 0 && basis === "INFERENCE") {
      applied = 0;
      note = "Une inférence négative ne baisse pas le fit sans fait.";
    }

    return {
      label: label(item.label),
      criterion: rubricEntry?.criterion ?? null,
      weight: rubricEntry?.maxPoints ?? null,
      assessment,
      rationale: label(item.rationale),
      supportingFields,
      points,
      basis,
      evidenceRefs: refs,
      applied,
      note,
    };
  });

  // Every criterion appears in the breakdown: one the model skipped is shown
  // as not assessed rather than silently vanishing from the arithmetic.
  for (const entry of rubric) {
    if (!factors.some((factor) => factor.criterion === entry.criterion)) {
      factors.push({
        label: entry.criterion,
        criterion: entry.criterion,
        weight: entry.maxPoints,
        assessment: "UNKNOWN",
        rationale: "",
        supportingFields: [],
        points: 0,
        basis: "CAMPAIGN_CRITERION",
        evidenceRefs: [],
        applied: 0,
        note: "Non évalué.",
      });
    }
  }

  const totalPoints = rubric.reduce((sum, entry) => sum + entry.maxPoints, 0);
  // Per criterion: what was earned, capped at its weight, and whether it was
  // assessed at all (MET, PARTLY or NOT_MET — never UNKNOWN).
  const earnedByCriterion = new Map<string, number>();
  for (const factor of factors) {
    if (!factor.criterion || factor.assessment === "UNKNOWN") continue;
    earnedByCriterion.set(
      factor.criterion,
      (earnedByCriterion.get(factor.criterion) ?? 0) + factor.applied,
    );
  }
  let earned = 0;
  let assessedPoints = 0;
  for (const entry of rubric) {
    if (!earnedByCriterion.has(entry.criterion)) continue;
    assessedPoints += entry.maxPoints;
    earned += Math.min(entry.maxPoints, Math.max(0, earnedByCriterion.get(entry.criterion)!));
  }
  // Exclusions and other factors outside the rubric move the score directly.
  const outside = factors
    .filter((factor) => !factor.criterion)
    .reduce((sum, factor) => sum + Math.min(0, factor.applied), 0);

  const relative = assessedPoints ? (earned / assessedPoints) * 100 : 0;
  const fitScore = Math.min(100, Math.max(0, Math.round(relative + outside)));
  const coverage = totalPoints ? assessedPoints / totalPoints : 0;

  return { factors, fitScore, coverage, assessedPoints, totalPoints };
}

/**
 * Confidence measures how much the assessment rests on, never how attractive
 * the prospect is. Sourced facts, a reachable decision role and real contact
 * raise it; stored unknowns and missing core profile data lower it.
 */
export function computeConfidence(input: IntelligenceInput, coverage?: number) {
  const notes: string[] = [];
  let points = 0;

  if (coverage !== undefined) {
    const percent = Math.round(coverage * 100);
    if (coverage < 0.4) {
      points -= 3;
      notes.push(`Seulement ${percent} % des critères de scoring ont pu être évalués.`);
    } else if (coverage >= 0.7) {
      points += 2;
      notes.push(`${percent} % des critères de scoring évalués.`);
    } else {
      notes.push(`${percent} % des critères de scoring évalués.`);
    }
  }

  const facts = input.evidence.filter((item) => item.type === "FACT");
  const sourcedFacts = facts.filter((item) => item.sourceUrl || item.sourceName);
  points += facts.length * 2 + sourcedFacts.length;
  notes.push(
    `${facts.length} fait${facts.length === 1 ? "" : "s"} enregistré${facts.length === 1 ? "" : "s"}, dont ${sourcedFacts.length} avec une source.`,
  );

  const unknowns = input.evidence.filter((item) => item.type === "UNKNOWN").length;
  points -= unknowns * 2;
  if (unknowns) notes.push(`${unknowns} inconnue${unknowns === 1 ? "" : "s"} encore à qualifier.`);

  const missing = [
    input.prospect.fleetSize === null && input.prospect.employeeCount === null
      ? "taille de l’entreprise"
      : null,
    input.prospect.industry ? null : "secteur",
    input.prospect.country ? null : "pays",
    input.prospect.tms ? null : "TMS actuel",
  ].filter((item): item is string => Boolean(item));
  points -= missing.length;
  if (missing.length) notes.push(`Non renseigné : ${missing.join(", ")}.`);

  const reachable = input.contacts.some((contact) =>
    ["DECISION_MAKER", "CHAMPION", "INFLUENCER"].includes(contact.decisionRole),
  );
  if (reachable) {
    points += 2;
  } else {
    notes.push("Aucun décideur, champion ou influenceur identifié.");
  }

  const conversations = input.interactions.filter((item) => item.type !== "NOTE");
  if (conversations.length) {
    points += Math.min(conversations.length, 2) * 2;
    notes.push(
      `${conversations.length} échange${conversations.length === 1 ? "" : "s"} enregistré${conversations.length === 1 ? "" : "s"} avec l’entreprise.`,
    );
  }

  let level: Intelligence["fitConfidence"] =
    points >= 10 ? "HIGH" : points >= 4 ? "MEDIUM" : "LOW";
  // Many facts about a few criteria is not a well-supported assessment.
  if (level === "HIGH" && coverage !== undefined && coverage < 0.7) {
    level = "MEDIUM";
    notes.push("Plafonnée à moyenne : une trop grande part des critères reste non évaluée.");
  }
  return { level, notes };
}

/** The stored scoring snapshot the brief explains, and never changes. */
export type FitSnapshot = {
  fitScore: number;
  fitConfidence: "LOW" | "MEDIUM" | "HIGH";
  fitExplanation: { factors: FitFactor[]; confidenceNotes: string[]; coverage: number };
};

export async function generateProspectIntelligence(
  input: IntelligenceInput,
  snapshot: FitSnapshot,
): Promise<Intelligence> {
  // Short refs keep ids out of the prose and make citations checkable.
  const evidenceRef = new Map(input.evidence.map((item, index) => [`E${index + 1}`, item]));
  const contactRef = new Map(input.contacts.map((item, index) => [`C${index + 1}`, item]));

  const context = {
    outputLanguage: SALES_LANGUAGE,
    brand: input.brand,
    campaign: input.campaign,
    fitAssessment: {
      fitScore: snapshot.fitScore,
      confidence: snapshot.fitConfidence,
      coverage: Math.round(snapshot.fitExplanation.coverage * 100) / 100,
      criteria: snapshot.fitExplanation.factors.map((factor) => ({
        criterion: factor.criterion ?? factor.label,
        verdict: factor.assessment,
        points: factor.applied,
        rationale: factor.rationale,
      })),
    },
    prospect: input.prospect,
    evidence: [...evidenceRef.entries()].map(([ref, item]) => ({
      ref,
      type: item.type,
      category: item.category,
      statement: item.statement,
      source: item.sourceName ?? item.sourceUrl ?? null,
      confidence: item.confidence,
    })),
    contacts: [...contactRef.entries()].map(([ref, item]) => ({
      ref,
      name: [item.firstName, item.lastName].filter(Boolean).join(" ") || null,
      jobTitle: item.jobTitle,
      seniority: item.seniority,
      decisionRole: item.decisionRole,
      isPrimary: item.isPrimary,
      reachableBy: [item.hasEmail ? "email" : null, item.hasPhone ? "phone" : null].filter(
        Boolean,
      ),
    })),
    interactions: input.interactions.map((item) => ({
      type: item.type,
      occurredAt: item.occurredAt.toISOString().slice(0, 10),
      note: item.rawNote,
      contactRef:
        [...contactRef.entries()].find(([, contact]) => contact.id === item.contactId)?.[0] ??
        null,
      statusChange: item.resultingStatus
        ? `${item.previousStatus ?? "?"} → ${item.resultingStatus}`
        : null,
      nextAction: item.nextAction,
    })),
  };

  const contactNames = new Map(
    [...contactRef.entries()].map(([ref, contact]) => [
      ref,
      [contact.firstName, contact.lastName].filter(Boolean).join(" ") ||
        contact.jobTitle ||
        "this contact",
    ]),
  );
  const prose = (value: unknown) => cleanProse(value, contactNames);

  const raw = (await callOpenAi(
    SYSTEM_PROMPT,
    context,
    "prospect_intelligence",
    SCHEMA,
  )) as Record<string, unknown>;

  const factIds = (refs: unknown) =>
    list(refs)
      .map((ref) => evidenceRef.get(text(ref)))
      .filter((item): item is IntelligenceInput["evidence"][number] => Boolean(item));

  /* ---- fit: the stored snapshot, carried through unchanged ------------------ */
  const { fitScore, fitConfidence: level } = snapshot;
  const { factors, confidenceNotes: notes, coverage } = snapshot.fitExplanation;

  /* ---- pain points: FACT only with a stored fact behind it ------------------ */
  const likelyPainPoints: PainPoint[] = list(raw.likelyPainPoints).map((entry) => {
    const item = entry as Record<string, unknown>;
    const cited = factIds(item.evidenceRefs);
    const supported = cited.some((evidence) => evidence.type === "FACT");
    return {
      pain: prose(item.pain),
      // A fact is stated, not hedged: "may be disconnected" is an inference
      // even when a fact sits nearby.
      basis:
        text(item.basis) === "FACT" &&
        supported &&
        !/\b(may|might|could|likely|possibly|probably|peut|peuvent|pourrait|pourraient|probablement|possiblement|vraisemblablement|sans doute|semble|semblent|peut-être|potentiellement|susceptible)\b/i.test(text(item.pain))
          ? "FACT"
          : "INFERENCE",
      rationale: prose(item.rationale),
      confidence: confidence(item.confidence),
      evidenceIds: cited.map((evidence) => evidence.id),
    };
  });

  /* ---- people: stored contacts only ---------------------------------------- */
  const decisionMakers: DecisionMakerAssessment[] = list(raw.decisionMakers)
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      const contact = contactRef.get(text(item.contactRef));
      return contact
        ? { contactId: contact.id, relevance: prose(item.relevance), priority: confidence(item.priority) }
        : null;
    })
    .filter((item): item is DecisionMakerAssessment => Boolean(item));
  const recommended = contactRef.get(text(raw.recommendedContactRef)) ?? null;

  /* ---- ticket: the campaign range, never a model guess --------------------- */
  const hasRange =
    input.campaign.targetTicketMin !== null || input.campaign.targetTicketMax !== null;
  const ticketRationale = prose(raw.ticketRationale);
  const gatekeeper = (raw.gatekeeperScript ?? {}) as Record<string, unknown>;

  return {
    whyThisProspect: prose(raw.whyThisProspect),
    likelyPainPoints: likelyPainPoints.filter((item) => item.pain),
    qualificationPriorities: list(raw.qualificationPriorities)
      .map((entry) => {
        const item = entry as Record<string, unknown>;
        return {
          question: prose(item.question),
          whyItMatters: prose(item.whyItMatters),
          impact: confidence(item.impact),
        };
      })
      .filter((item) => item.question),
    decisionMakers,
    recommendedContactId: recommended?.id ?? null,
    entryPointRationale: recommended
      ? prose(raw.entryPointRationale)
      : "No reliable entry point identified yet.",
    commercialAngle: prose(raw.commercialAngle),
    discoveryQuestions: list(raw.discoveryQuestions).map(prose).filter(Boolean).slice(0, 8),
    gatekeeperScript: { opening: prose(gatekeeper.opening), ifAskedWhy: prose(gatekeeper.ifAskedWhy) },
    decisionMakerOpening: prose(raw.decisionMakerOpening),
    objections: list(raw.objections)
      .map((entry) => {
        const item = entry as Record<string, unknown>;
        return { objection: prose(item.objection), response: prose(item.response) };
      })
      .filter((item) => item.objection)
      .slice(0, 6),
    negotiationLevers: list(raw.negotiationLevers)
      .map((entry) => {
        const item = entry as Record<string, unknown>;
        return { lever: prose(item.lever), rationale: prose(item.rationale) };
      })
      .filter((item) => item.lever),
    estimatedTicketMin: hasRange ? input.campaign.targetTicketMin : null,
    estimatedTicketMax: hasRange ? input.campaign.targetTicketMax : null,
    estimatedTicketCurrency: hasRange ? input.campaign.currency : null,
    estimatedTicketBasis: hasRange
      ? `Fourchette cible de la campagne. ${ticketRationale}`.trim()
      : "Informations insuffisantes",
    nextBestAction: prose(raw.nextBestAction),
    nextBestActionRationale: prose(raw.nextBestActionRationale),
    fitScore,
    fitConfidence: level,
    fitExplanation: { factors, confidenceNotes: notes, coverage },
    model: openAiModel(),
  };
}
