/**
 * Interaction learning: what one conversation changes about a prospect.
 *
 * The model proposes; nothing is applied here. The server keeps only proposals
 * the note itself supports:
 * - a new FACT must quote the note verbatim;
 * - resolving or superseding must point at stored evidence of the right kind
 *   and at a new fact that justifies it;
 * - a structured field update must be backed by a fact whose words carry the
 *   value, and only a fixed set of factual fields may change;
 * - a contact update must concern a stored contact named in the note;
 * - a date is kept only when the note names a day and the date matches it;
 * - a status the user selected, and a next step the user wrote, are kept.
 */

import { FRENCH_OUTPUT_RULE } from "@/lib/sales-intelligence";
import { callOpenAi, openAiModel } from "@/lib/openai";
import { EPISTEMIC_RULES } from "@/lib/sales-intelligence";
import { DECISION_ROLES, PROSPECT_STATUSES, contactName, humanize } from "@/lib/sales";

/* -------------------------------------------------------------------------- */
/* Proposal model                                                             */
/* -------------------------------------------------------------------------- */

export const FACT_FIELDS = [
  "fleetSize",
  "employeeCount",
  "revenue",
  "tms",
  "erp",
  "crm",
  "telematics",
  "clientPortal",
  "driverApp",
  "detectedTools",
] as const;
export type FactField = (typeof FACT_FIELDS)[number];
const NUMERIC_FIELDS = new Set<FactField>(["fleetSize", "employeeCount"]);

export type Proposal =
  | { id: string; kind: "NEW_FACT"; category: string; statement: string; quote: string; confidence: "LOW" | "MEDIUM" | "HIGH" }
  | { id: string; kind: "RESOLVE_UNKNOWN"; evidenceId: string; evidenceStatement: string; byFactId: string; reason: string }
  | { id: string; kind: "SUPERSEDE"; evidenceId: string; evidenceType: string; evidenceStatement: string; byFactId: string; reason: string }
  | { id: string; kind: "FIELD"; field: FactField; value: string; previous: string | null; byFactId: string | null; byEvidenceId: string | null }
  | { id: string; kind: "CONTACT"; contactId: string; contactName: string; decisionRole: string | null; previousRole: string; makePrimary: boolean; reason: string; quote: string }
  | { id: string; kind: "PIPELINE"; from: string; to: string; reason: string }
  | {
      id: string;
      kind: "NEXT_ACTION";
      text: string;
      at: string | null;
      preserved: boolean;
      reason: string;
      /** No concrete date could be stored, but the step points at a day. */
      dateNeedsConfirmation: boolean;
    };

export type Analysis = {
  proposals: Proposal[];
  /** What the server refused, and why — shown so nothing disappears silently. */
  refused: string[];
  /** The model's reading of how the fit is likely to move; informational only. */
  fitImpact: string;
  model: string;
};

/* -------------------------------------------------------------------------- */
/* Input                                                                      */
/* -------------------------------------------------------------------------- */

export type AnalysisInput = {
  campaign: { name: string; offer: string; geography: string[]; industries: string[]; targetCompanySize: string | null; preferredProfile: string[]; exclusions: string[] };
  prospect: Record<string, unknown> & { name: string; status: string };
  fit: { score: number | null; confidence: string; qualification: string | null };
  evidence: { id: string; type: string; category: string; statement: string }[];
  contacts: { id: string; firstName: string | null; lastName: string | null; jobTitle: string | null; decisionRole: string; isPrimary: boolean }[];
  intelligence: { whyThisProspect: string; nextBestAction: string } | null;
  interaction: {
    type: string;
    occurredAt: Date;
    rawNote: string;
    contactId: string | null;
    /** What the user chose in the form. Always wins over a suggestion. */
    userResultingStatus: string | null;
    userNextAction: string | null;
    userNextActionAt: Date | null;
  };
};

/* -------------------------------------------------------------------------- */
/* Prompt + schema                                                            */
/* -------------------------------------------------------------------------- */

const PROMPT = [
  "You read ONE note a salesperson wrote after an interaction with a prospect, and propose how the prospect's record should change. You propose; a person approves. You do not research.",
  "",
  ...EPISTEMIC_RULES.slice(0, 5),
  "",
  "RULES FOR PROPOSALS:",
  "1. newFacts: only what the note states directly. Each carries quote: the exact words from the note, copied character for character. 'Utilise Dashdoc mais planning remorques sur Excel' supports 'Utilise Dashdoc' and 'La planification des remorques est gérée sur Excel'. It does NOT support 'Dispatch is inefficient' or 'Uses Microsoft 365'. Never turn an impression, a judgement or a guess into a fact. Statements in English.",
  "2. resolvedUnknowns: a stored UNKNOWN (ref E…) that a new fact now answers, with the new fact's ref (N…).",
  "3. supersededEvidence: a stored INFERENCE or FACT (ref E…) that a new fact replaces or contradicts, with the new fact's ref. Old evidence is never deleted, only superseded. If a new fact contradicts a stored fact (e.g. 72 vehicles vs 100), supersede the old one — never merge silently.",
  "4. fieldUpdates: structured fields that a fact now establishes: fleetSize, employeeCount (integers), revenue, tms, erp, crm, telematics, clientPortal, driverApp (names), detectedTools (a tool name to add). Each must cite a new fact ref (N…) or a stored FACT ref (E…). Never from an inference.",
  "5. contactUpdates: only for stored contacts (ref C…) the note mentions by name. decisionRole one of DECISION_MAKER, CHAMPION, USER, INFLUENCER, GATEKEEPER, UNKNOWN — or empty to leave it. 'Paul signs off the budget' supports Paul → DECISION_MAKER. makePrimary only when the note makes that person the obvious entry point. quote: the words from the note. Never invent a person.",
  "6. pipeline: the next pipeline status the interaction justifies (e.g. CONTACTED → MEETING_BOOKED when a meeting is agreed), or empty. Leave empty when nothing moved.",
  "7. nextAction: exactly one. If the note states a next step ('Rappeler mardi 15 septembre à 10h', 'demo next Thursday'), use its words, set fromNote true and quote it. Fill date (YYYY-MM-DD) and time (HH:MM) ONLY when the note writes the calendar day out ('15 septembre', '15/09') or says tomorrow. A relative weekday ('next Thursday', 'jeudi', 'later this week') has more than one reading: leave date and time empty. Never invent a date.",
  "8. fitImpact: one sentence on how the new facts are likely to affect fit and confidence. Informational only.",
  "",
  FRENCH_OUTPUT_RULE,
  "In French: fact statements, rationales, nextAction text and fitImpact. Quotes stay exactly as the note wrote them.",
].join("\n");

const REFS = { type: "string" } as const;
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["newFacts", "resolvedUnknowns", "supersededEvidence", "fieldUpdates", "contactUpdates", "pipeline", "nextAction", "fitImpact"],
  properties: {
    newFacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "category", "statement", "quote", "confidence"],
        properties: {
          ref: REFS,
          category: { type: "string" },
          statement: { type: "string" },
          quote: { type: "string" },
          confidence: { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] },
        },
      },
    },
    resolvedUnknowns: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["evidenceRef", "byFactRef", "reason"],
        properties: { evidenceRef: REFS, byFactRef: REFS, reason: { type: "string" } },
      },
    },
    supersededEvidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["evidenceRef", "byFactRef", "reason"],
        properties: { evidenceRef: REFS, byFactRef: REFS, reason: { type: "string" } },
      },
    },
    fieldUpdates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "value", "factRef"],
        properties: {
          field: { type: "string", enum: [...FACT_FIELDS] },
          value: { type: "string" },
          factRef: REFS,
        },
      },
    },
    contactUpdates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["contactRef", "decisionRole", "makePrimary", "reason", "quote"],
        properties: {
          contactRef: REFS,
          decisionRole: { type: "string", enum: [...DECISION_ROLES, ""] },
          makePrimary: { type: "boolean" },
          reason: { type: "string" },
          quote: { type: "string" },
        },
      },
    },
    pipeline: {
      type: "object",
      additionalProperties: false,
      required: ["status", "reason"],
      properties: {
        status: { type: "string", enum: [...PROSPECT_STATUSES, ""] },
        reason: { type: "string" },
      },
    },
    nextAction: {
      type: "object",
      additionalProperties: false,
      required: ["text", "fromNote", "quote", "date", "time", "reason"],
      properties: {
        text: { type: "string" },
        fromNote: { type: "boolean" },
        quote: { type: "string" },
        date: { type: "string" },
        time: { type: "string" },
        reason: { type: "string" },
      },
    },
    fitImpact: { type: "string" },
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Verification helpers                                                       */
/* -------------------------------------------------------------------------- */

function squash(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function inNote(quote: string, note: string) {
  const needle = squash(quote).replace(/^["'.…\s]+|["'.…\s]+$/g, "");
  return needle.length >= 3 && squash(note).includes(needle);
}

const WEEKDAYS: [RegExp, number][] = [
  [/\b(sunday|dimanche|zondag|sonntag)\b/, 0],
  [/\b(monday|lundi|maandag|montag)\b/, 1],
  [/\b(tuesday|mardi|dinsdag|dienstag)\b/, 2],
  [/\b(wednesday|mercredi|woensdag|mittwoch)\b/, 3],
  [/\b(thursday|jeudi|donderdag|donnerstag)\b/, 4],
  [/\b(friday|vendredi|vrijdag|freitag)\b/, 5],
  [/\b(saturday|samedi|zaterdag|samstag)\b/, 6],
];

const MONTHS: [RegExp, number][] = [
  [/^(janv|janvier|jan|january|januari|januar)/, 1],
  [/^(fevr|fevrier|feb|february|februari|februar)/, 2],
  [/^(mars|mar|march|maart|marz)/, 3],
  [/^(avr|avril|apr|april)/, 4],
  [/^(mai|may|mei)/, 5],
  [/^(juin|jun|june|juni)/, 6],
  [/^(juil|juillet|jul|july|juli)/, 7],
  [/^(aout|aug|august|augustus)/, 8],
  [/^(sept|septembre|sep|september)/, 9],
  [/^(oct|octobre|october|oktober)/, 10],
  [/^(nov|novembre|november)/, 11],
  [/^(dec|decembre|december|dezember)/, 12],
];

/** Every explicit calendar day the note writes out: "16 septembre", "16/09", "September 16". */
function explicitDays(text: string) {
  const days: { day: number; month: number }[] = [];
  for (const match of text.matchAll(/\b(\d{1,2})[/.](\d{1,2})\b/g)) {
    days.push({ day: Number(match[1]), month: Number(match[2]) });
  }
  for (const match of text.matchAll(/\b(\d{1,2})(?:er)? ([a-z]+)/g)) {
    const month = MONTHS.find(([pattern]) => pattern.test(match[2]))?.[1];
    if (month) days.push({ day: Number(match[1]), month });
  }
  for (const match of text.matchAll(/\b([a-z]+) (\d{1,2})\b/g)) {
    const month = MONTHS.find(([pattern]) => pattern.test(match[1]))?.[1];
    if (month) days.push({ day: Number(match[2]), month });
  }
  return days.filter((entry) => entry.day >= 1 && entry.day <= 31 && entry.month >= 1 && entry.month <= 12);
}

/** Relative day words that more than one calendar date could mean. */
const RELATIVE_DAY =
  /\b(next|this|coming|later|early|end of|prochain|prochaine|cette|debut|fin|volgende|deze|nachste|diese)\b|\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|maandag|dinsdag|woensdag|donderdag|vrijdag|montag|dienstag|mittwoch|donnerstag|freitag)\b|\b(week|semaine|week-end|weekend)\b/;

/**
 * Date policy. A concrete date is stored only when it cannot mean anything
 * else:
 * - the note writes the day out ("mardi 16 septembre", "16/09") and the
 *   proposed date is that day (and, if a weekday is named too, falls on it);
 * - or the note says tomorrow.
 * A relative weekday ("next Thursday", "jeudi", "later this week") has more
 * than one plausible reading, so the text is kept and the date is left for
 * the user to confirm.
 */
export function verifiedDate(note: string, occurredAt: Date, date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const clock = /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  const at = new Date(`${date}T${clock}:00`);
  if (Number.isNaN(at.getTime())) return null;
  const days = (at.getTime() - occurredAt.getTime()) / 86_400_000;
  if (days < -1 || days > 366) return null;

  const text = squash(note);
  const written = explicitDays(text);
  if (written.length) {
    const matches = written.some((entry) => entry.day === at.getDate() && entry.month === at.getMonth() + 1);
    if (!matches) return null;
    const named = WEEKDAYS.filter(([pattern]) => pattern.test(text)).map(([, day]) => day);
    return !named.length || named.includes(at.getDay()) ? at : null;
  }
  if (/\b(tomorrow|demain|morgen)\b/.test(text)) {
    const tomorrow = new Date(occurredAt);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return at.toDateString() === tomorrow.toDateString() ? at : null;
  }
  return null;
}

/** True when the words point at a day that still needs a concrete date. */
export function dateNeedsConfirmation(text: string | null | undefined) {
  if (!text) return false;
  const words = squash(text);
  return RELATIVE_DAY.test(words) && !explicitDays(words).length;
}

/* -------------------------------------------------------------------------- */
/* Analyze                                                                    */
/* -------------------------------------------------------------------------- */

export async function analyzeInteraction(input: AnalysisInput): Promise<Analysis> {
  const evidenceRef = new Map(input.evidence.map((item, index) => [`E${index + 1}`, item]));
  const contactRef = new Map(input.contacts.map((item, index) => [`C${index + 1}`, item]));
  const note = input.interaction.rawNote;
  const linked = input.contacts.find((contact) => contact.id === input.interaction.contactId);

  const raw = (await callOpenAi(
    PROMPT,
    {
      campaign: input.campaign,
      prospect: input.prospect,
      currentFit: input.fit,
      evidence: [...evidenceRef.entries()].map(([ref, item]) => ({ ref, type: item.type, category: item.category, statement: item.statement })),
      contacts: [...contactRef.entries()].map(([ref, item]) => ({
        ref,
        name: contactName(item),
        jobTitle: item.jobTitle,
        decisionRole: item.decisionRole,
        isPrimary: item.isPrimary,
      })),
      intelligence: input.intelligence,
      interaction: {
        type: input.interaction.type,
        occurredAt: input.interaction.occurredAt.toISOString().slice(0, 10),
        weekday: input.interaction.occurredAt.toLocaleDateString("en-GB", { weekday: "long" }),
        contact: linked ? contactName(linked) : null,
        note,
      },
    },
    "interaction_analysis",
    SCHEMA,
  )) as Record<string, unknown>;

  const text = (value: unknown) => String(value ?? "").trim();
  const list = (value: unknown) => (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const proposals: Proposal[] = [];
  const refused: string[] = [];
  let seq = 0;
  const nextId = () => `p${++seq}`;

  /* ---- new facts: quoted from the note, or refused ----------------------- */
  const factIdByRef = new Map<string, { id: string; quote: string; statement: string }>();
  for (const item of list(raw.newFacts)) {
    const statement = text(item.statement);
    const quote = text(item.quote);
    if (!statement) continue;
    if (!inNote(quote, note)) {
      refused.push(`Fact “${statement}”: the quoted words are not in the note.`);
      continue;
    }
    const id = nextId();
    factIdByRef.set(text(item.ref), { id, quote, statement });
    proposals.push({
      id,
      kind: "NEW_FACT",
      category: text(item.category) || "general",
      statement,
      quote,
      confidence: (["LOW", "MEDIUM", "HIGH"].includes(text(item.confidence)) ? text(item.confidence) : "MEDIUM") as "MEDIUM",
    });
  }

  /* ---- lifecycle: only stored evidence of the right kind, only with a fact  */
  for (const [key, kind] of [["resolvedUnknowns", "RESOLVE_UNKNOWN"], ["supersededEvidence", "SUPERSEDE"]] as const) {
    for (const item of list(raw[key])) {
      const evidence = evidenceRef.get(text(item.evidenceRef));
      const fact = factIdByRef.get(text(item.byFactRef));
      if (!evidence || !fact) {
        refused.push(`${kind === "RESOLVE_UNKNOWN" ? "Resolution" : "Supersession"} refused: it must name stored evidence and a new fact.`);
        continue;
      }
      if (kind === "RESOLVE_UNKNOWN" && evidence.type !== "UNKNOWN") {
        refused.push(`“${evidence.statement}” is not an unknown, so it cannot be resolved.`);
        continue;
      }
      if (kind === "SUPERSEDE" && evidence.type === "UNKNOWN") {
        refused.push(`“${evidence.statement}” is an unknown: it is resolved, not superseded.`);
        continue;
      }
      if (proposals.some((p) => (p.kind === "RESOLVE_UNKNOWN" || p.kind === "SUPERSEDE") && p.evidenceId === evidence.id)) continue;
      proposals.push(
        kind === "RESOLVE_UNKNOWN"
          ? { id: nextId(), kind, evidenceId: evidence.id, evidenceStatement: evidence.statement, byFactId: fact.id, reason: text(item.reason) }
          : { id: nextId(), kind, evidenceId: evidence.id, evidenceType: evidence.type, evidenceStatement: evidence.statement, byFactId: fact.id, reason: text(item.reason) },
      );
    }
  }

  /* ---- structured fields: a fact whose words carry the value ------------- */
  for (const item of list(raw.fieldUpdates)) {
    const field = text(item.field) as FactField;
    const value = text(item.value);
    if (!(FACT_FIELDS as readonly string[]).includes(field) || !value) continue;
    const ref = text(item.factRef);
    const newFact = factIdByRef.get(ref);
    const stored = evidenceRef.get(ref);
    const backing = newFact
      ? `${newFact.quote} ${newFact.statement}`
      : stored && stored.type === "FACT"
        ? stored.statement
        : null;
    if (!backing) {
      refused.push(`${field} = ${value}: not backed by a fact.`);
      continue;
    }
    if (NUMERIC_FIELDS.has(field)) {
      const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
      if (!Number.isFinite(n) || !backing.replace(/[\s.  ]/g, "").includes(String(n))) {
        refused.push(`${field} = ${value}: the number is not in the supporting fact.`);
        continue;
      }
    } else if (!squash(backing).includes(squash(value))) {
      refused.push(`${field} = ${value}: the value is not in the supporting fact.`);
      continue;
    }
    const previous = input.prospect[field];
    proposals.push({
      id: nextId(),
      kind: "FIELD",
      field,
      value: NUMERIC_FIELDS.has(field) ? String(Number.parseInt(value.replace(/[^\d]/g, ""), 10)) : value,
      previous: Array.isArray(previous) ? previous.join(", ") || null : previous === null || previous === undefined ? null : String(previous),
      byFactId: newFact?.id ?? null,
      byEvidenceId: newFact ? null : stored!.id,
    });
  }

  /* ---- contacts: stored, and named in the note --------------------------- */
  for (const item of list(raw.contactUpdates)) {
    const contact = contactRef.get(text(item.contactRef));
    if (!contact) {
      refused.push("A contact update named someone who is not a stored contact.");
      continue;
    }
    const names = [contact.firstName, contact.lastName].filter((part): part is string => Boolean(part && part.length >= 3));
    const noteText = squash(note);
    const mentioned = names.some((part) => new RegExp(`\\b${squash(part).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(noteText));
    if (!mentioned || !inNote(text(item.quote), note)) {
      refused.push(`${contactName(contact)}: the note does not mention this person.`);
      continue;
    }
    const role = (DECISION_ROLES as readonly string[]).includes(text(item.decisionRole)) ? text(item.decisionRole) : null;
    const makePrimary = item.makePrimary === true && !contact.isPrimary;
    if ((!role || role === contact.decisionRole) && !makePrimary) continue;
    proposals.push({
      id: nextId(),
      kind: "CONTACT",
      contactId: contact.id,
      contactName: contactName(contact),
      decisionRole: role && role !== contact.decisionRole ? role : null,
      previousRole: contact.decisionRole,
      makePrimary,
      reason: text(item.reason),
      quote: text(item.quote),
    });
  }

  /* ---- pipeline: a suggestion, never over the user's own choice ---------- */
  const pipeline = (raw.pipeline ?? {}) as Record<string, unknown>;
  const suggested = text(pipeline.status);
  if (input.interaction.userResultingStatus) {
    if (suggested && suggested !== input.interaction.userResultingStatus) {
      refused.push(`Pipeline suggestion ${humanize(suggested)} ignored: you selected ${humanize(input.interaction.userResultingStatus)}.`);
    }
  } else if (suggested && suggested !== input.prospect.status && (PROSPECT_STATUSES as readonly string[]).includes(suggested)) {
    proposals.push({ id: nextId(), kind: "PIPELINE", from: input.prospect.status, to: suggested, reason: text(pipeline.reason) });
  }

  /* ---- next action: the user's own words first --------------------------- */
  const next = (raw.nextAction ?? {}) as Record<string, unknown>;
  if (input.interaction.userNextAction) {
    proposals.push({
      id: nextId(),
      kind: "NEXT_ACTION",
      text: input.interaction.userNextAction,
      at: input.interaction.userNextActionAt?.toISOString() ?? null,
      preserved: true,
      reason: "The next step you entered with the interaction.",
      dateNeedsConfirmation:
        !input.interaction.userNextActionAt && dateNeedsConfirmation(input.interaction.userNextAction),
    });
  } else if (text(next.text)) {
    const fromNote = next.fromNote === true && inNote(text(next.quote), note);
    const at = verifiedDate(note, input.interaction.occurredAt, text(next.date), text(next.time));
    if (text(next.date) && !at) refused.push(`Date ${text(next.date)} dropped: the note does not pin it down.`);
    proposals.push({
      id: nextId(),
      kind: "NEXT_ACTION",
      text: text(next.text),
      at: at?.toISOString() ?? null,
      preserved: fromNote,
      reason: fromNote ? `From the note: “${text(next.quote)}”` : text(next.reason),
      dateNeedsConfirmation: !at && (Boolean(text(next.date)) || dateNeedsConfirmation(`${text(next.text)} ${text(next.quote)}`)),
    });
  }

  return { proposals, refused, fitImpact: text(raw.fitImpact), model: openAiModel() };
}

/** "Call with Pierre Staelens · 16 Sep 2026" */
export function interactionSourceName(
  type: string,
  occurredAt: Date,
  contact: { firstName: string | null; lastName: string | null; jobTitle: string | null } | null,
) {
  const date = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(occurredAt);
  const kind = type === "LINKEDIN" ? "LinkedIn message" : humanize(type);
  return contact ? `${kind} with ${contactName(contact)} · ${date}` : `${kind} · ${date}`;
}
