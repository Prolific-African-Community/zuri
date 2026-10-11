/**
 * Shared vocabulary for Sales Intelligence: labels, list parsing and the few
 * pipeline groupings the pages count on. No business logic lives here.
 */

export const PROSPECT_STATUSES = [
  "DISCOVERED",
  "QUALIFIED",
  "TO_CONTACT",
  "CONTACTED",
  "FOLLOW_UP",
  "MEETING_BOOKED",
  "DISCOVERY_COMPLETED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
  "LOST",
  "DISQUALIFIED",
] as const;

export const EVIDENCE_TYPES = ["FACT", "INFERENCE", "UNKNOWN"] as const;
export const CONFIDENCES = ["LOW", "MEDIUM", "HIGH"] as const;
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
export const DECISION_ROLES = [
  "DECISION_MAKER",
  "CHAMPION",
  "USER",
  "INFLUENCER",
  "GATEKEEPER",
  "UNKNOWN",
] as const;
export const INTERACTION_TYPES = [
  "CALL",
  "EMAIL",
  "MEETING",
  "LINKEDIN",
  "NOTE",
  "OTHER",
] as const;

/** Pipeline stages a prospect has reached qualification at or beyond. */
export const QUALIFIED_OR_LATER = new Set<string>([
  "QUALIFIED",
  "TO_CONTACT",
  "CONTACTED",
  "FOLLOW_UP",
  "MEETING_BOOKED",
  "DISCOVERY_COMPLETED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
]);

/** A meeting has happened or is booked. */
export const MEETING_OR_LATER = new Set<string>([
  "MEETING_BOOKED",
  "DISCOVERY_COMPLETED",
  "PROPOSAL",
  "NEGOTIATION",
  "WON",
]);

/** Closed either way: no longer an active prospect. */
export const CLOSED = new Set<string>(["WON", "LOST", "DISQUALIFIED"]);

/** "MEETING_BOOKED" → "Meeting booked". The enum never reaches the screen. */
export function humanize(value: string | null | undefined) {
  if (!value) return "";
  const text = value.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One entry per line (or comma) in a textarea, trimmed, empties dropped. */
export function parseList(raw: FormDataEntryValue | null) {
  return String(raw ?? "")
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Lists are edited one per line. */
export function formatList(values: string[]) {
  return values.join("\n");
}

export function readText(formData: FormData, name: string) {
  const value = String(formData.get(name) ?? "").trim();
  return value || null;
}

export function readInt(formData: FormData, name: string) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

export function readDate(formData: FormData, name: string) {
  const raw = String(formData.get(name) ?? "").trim();
  if (!raw) return null;
  const value = new Date(raw);
  return Number.isNaN(value.getTime()) ? null : value;
}

/** Only values the enum actually allows; anything else falls back. */
export function readEnum<T extends string>(
  formData: FormData,
  name: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = String(formData.get(name) ?? "");
  return (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function toDateInput(date: Date | null | undefined) {
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function formatTicket(
  min: number | null,
  max: number | null,
  currency: string | null,
) {
  if (min === null && max === null) return "";
  const unit = currency ? ` ${currency}` : "";
  const fmt = (value: number) => value.toLocaleString("fr-FR");
  if (min !== null && max !== null) return `${fmt(min)}–${fmt(max)}${unit}`;
  return `${min !== null ? `from ${fmt(min)}` : `up to ${fmt(max!)}`}${unit}`;
}

export type ScoringCriterion = { label: string; weight: number | null };

/** Stored as JSON; read defensively so a malformed row never breaks a page. */
export function readCriteria(value: unknown): ScoringCriterion[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") return { label: entry, weight: null };
      if (entry && typeof entry === "object" && "label" in entry) {
        const weight = (entry as { weight?: unknown }).weight;
        return {
          label: String((entry as { label: unknown }).label),
          weight: typeof weight === "number" ? weight : null,
        };
      }
      return null;
    })
    .filter((entry): entry is ScoringCriterion => Boolean(entry?.label));
}

/** "Label | 30" per line; the weight is optional. */
export function parseCriteria(raw: FormDataEntryValue | null): ScoringCriterion[] {
  return String(raw ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, weight] = line.split("|").map((part) => part.trim());
      const parsed = weight ? Number.parseInt(weight, 10) : Number.NaN;
      return { label, weight: Number.isFinite(parsed) ? parsed : null };
    })
    .filter((entry) => entry.label);
}

export function formatCriteria(criteria: ScoringCriterion[]) {
  return criteria
    .map((entry) => (entry.weight === null ? entry.label : `${entry.label} | ${entry.weight}`))
    .join("\n");
}

export function contactName(contact: {
  firstName: string | null;
  lastName: string | null;
  jobTitle?: string | null;
}) {
  const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
  return name || contact.jobTitle || "Unnamed contact";
}

export type Qualification = {
  passes: boolean;
  reason: string;
  group: "KEEP" | "REVIEW" | "REMOVE" | null;
  groupReason: string | null;
  /** What the rules now suggest, waiting for a person to confirm. */
  suggestedGroup: "KEEP" | "REVIEW" | "REMOVE" | null;
  suggestedGroupReason: string | null;
  flags: { flag: string; reason: string }[];
};

/** The recorded campaign-qualification verdict, when one exists. */
export function readQualification(fitExplanation: unknown): Qualification | null {
  const q = (fitExplanation as { qualification?: Record<string, unknown> } | null)?.qualification;
  if (!q || typeof q.passes !== "boolean") return null;
  const group = ["KEEP", "REVIEW", "REMOVE"].includes(String(q.group))
    ? (q.group as Qualification["group"])
    : null;
  return {
    passes: q.passes,
    reason: String(q.reason ?? ""),
    group,
    groupReason: typeof q.groupReason === "string" ? q.groupReason : null,
    suggestedGroup: ["KEEP", "REVIEW", "REMOVE"].includes(String(q.suggestedGroup))
      ? (q.suggestedGroup as Qualification["group"])
      : null,
    suggestedGroupReason: typeof q.suggestedGroupReason === "string" ? q.suggestedGroupReason : null,
    flags: (Array.isArray(q.flags) ? q.flags : [])
      .map((entry) => entry as { flag?: unknown; reason?: unknown })
      .filter((entry) => typeof entry.flag === "string")
      .map((entry) => ({ flag: String(entry.flag), reason: String(entry.reason ?? "") })),
  };
}
