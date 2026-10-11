/**
 * Contactability: how easy it is to reach the right person at a prospect.
 * Deliberately separate from fit — fit says whether a company is worth
 * selling to, contactability says whether a salesperson can act on it today.
 * Computed from stored channels only; nothing here infers a number or address.
 */

import { phoneKey } from "@/lib/phone";

export const CONTACTABILITY_LEVELS = ["HIGH", "MEDIUM", "LOW", "NONE"] as const;
export type ContactabilityLevel = (typeof CONTACTABILITY_LEVELS)[number];

export type ContactInput = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  jobTitle: string | null;
  decisionRole: string;
  phone: string | null;
  mobile: string | null;
  email: string | null;
  linkedinUrl: string | null;
  sourceUrl: string | null;
  isPrimary: boolean;
  confidence: string;
  /** Interactions already logged with this person. */
  interactionCount?: number;
};

export type CompanyChannels = {
  companyPhone: string | null;
  companyEmail: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
};

export type EntryPoint = {
  contactId: string;
  name: string;
  jobTitle: string | null;
  decisionRole: string;
  phone: string | null;
  email: string | null;
  linkedinUrl: string | null;
  reasons: string[];
  /** Zuri's pick differs from the stored primary contact. */
  differsFromPrimary: boolean;
};

export type Contactability = {
  level: ContactabilityLevel;
  /** 0–100, internal ordering only. */
  score: number;
  /** The best channel, in plain words: "Direct phone · Operations manager". */
  channel: string;
  entryPoint: EntryPoint | null;
  companyPhone: string | null;
  companyEmail: string | null;
};

const GENERIC_LOCAL =
  /^(info|contact|office|admin|administration|hello|bonjour|sales|vente|ventes|commercial|bureau|secretariat|accueil|reception|mail|general|service|support|transport|dispatch|exploitation|planning|logistique|logistics|compta|comptabilite|facturation|rh|jobs|emploi|recrutement)([.\-_]?\w{0,4})?@/i;

export const isGenericEmail = (email: string) => GENERIC_LOCAL.test(email.trim());

const digits = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");
const sameNumber = (a: string | null | undefined, b: string | null | undefined) => {
  const ka = phoneKey(a);
  return Boolean(ka && ka === phoneKey(b));
};

const OPERATIONS_TITLE =
  /(exploitation|op[eé]ration|dispatch|affr[eè]t|planning|transport manager|responsable transport|fleet|flotte|logisti|supply|directeur|director|g[eé]rant|ceo|coo|owner|fondateur|founder|administrateur|managing|pdg|it |informatique|digital)/i;

const ROLE_POINTS: Record<string, number> = {
  DECISION_MAKER: 30,
  CHAMPION: 25,
  INFLUENCER: 15,
  USER: 10,
  UNKNOWN: 5,
  GATEKEEPER: 0,
};

/** A person worth selling to: not a gatekeeper, with a stated relevant role. */
/** Titles taken from legal notices or site credits: named, but not a sales entry point. */
const NON_COMMERCIAL_TITLE = /(publication|r[eé]daction|webmaster|h[eé]bergeur|hosting|dpo|data protection|responsable du traitement)/i;

export function isRelevantContact(contact: ContactInput) {
  if (contact.decisionRole === "GATEKEEPER") return false;
  if (NON_COMMERCIAL_TITLE.test(contact.jobTitle ?? "")) return false;
  return (
    ["DECISION_MAKER", "CHAMPION", "INFLUENCER"].includes(contact.decisionRole) ||
    OPERATIONS_TITLE.test(contact.jobTitle ?? "")
  );
}

/** A personal line: the contact's phone or mobile, unless it is the switchboard. */
function directPhone(contact: ContactInput, company: CompanyChannels) {
  for (const value of [contact.mobile, contact.phone]) {
    if (digits(value).length >= 8 && !sameNumber(value, company.companyPhone)) return value;
  }
  return null;
}

function professionalEmail(contact: ContactInput) {
  return contact.email && !isGenericEmail(contact.email) ? contact.email : null;
}

const fullName = (contact: ContactInput) =>
  [contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.jobTitle || "Unnamed contact";

/**
 * Zuri's recommended commercial entry point: role relevance first, then public
 * reachability, evidence and history. The AI's preference is one input, never
 * the decision — and the stored primary contact is never changed by this.
 */
export function recommendEntryPoint(
  contacts: ContactInput[],
  company: CompanyChannels,
  aiRecommendedId?: string | null,
): EntryPoint | null {
  const ranked = contacts
    .map((contact) => {
      const reasons: string[] = [];
      let score = ROLE_POINTS[contact.decisionRole] ?? 5;
      if (NON_COMMERCIAL_TITLE.test(contact.jobTitle ?? "")) score -= 20;
      if (contact.decisionRole !== "UNKNOWN") reasons.push(contact.decisionRole.replace(/_/g, " ").toLowerCase());
      if (OPERATIONS_TITLE.test(contact.jobTitle ?? "")) score += 10;
      if (directPhone(contact, company)) {
        score += 20;
        reasons.push("direct phone");
      } else if (professionalEmail(contact)) {
        score += 8;
        reasons.push("direct email");
      } else if (contact.linkedinUrl) {
        score += 3;
      }
      if (contact.sourceUrl) score += 3;
      if (contact.confidence === "HIGH") score += 3;
      if (contact.interactionCount) {
        score += 5;
        reasons.push("already in conversation");
      }
      if (aiRecommendedId && contact.id === aiRecommendedId) {
        score += 10;
        reasons.push("recommended by the brief");
      }
      if (contact.isPrimary) score += 5;
      return { contact, score, reasons };
    })
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.contact.decisionRole === "GATEKEEPER") return null;
  const primary = contacts.find((contact) => contact.isPrimary);
  return {
    contactId: best.contact.id,
    name: fullName(best.contact),
    jobTitle: best.contact.jobTitle,
    decisionRole: best.contact.decisionRole,
    phone: directPhone(best.contact, company),
    email: best.contact.email,
    linkedinUrl: best.contact.linkedinUrl,
    reasons: best.reasons,
    differsFromPrimary: Boolean(primary && primary.id !== best.contact.id),
  };
}

/**
 * The hierarchy, most actionable first. A switchboard beats a generic inbox:
 * a call reaches someone, an info@ address rarely does.
 */
export function computeContactability(
  contacts: ContactInput[],
  company: CompanyChannels,
  aiRecommendedId?: string | null,
): Contactability {
  const entryPoint = recommendEntryPoint(contacts, company, aiRecommendedId);
  const relevant = contacts.filter(isRelevantContact);
  const base = { entryPoint, companyPhone: company.companyPhone, companyEmail: company.companyEmail };
  const label = (contact: { jobTitle: string | null } | null) => (contact?.jobTitle ? ` · ${contact.jobTitle}` : "");

  if (entryPoint?.phone && relevant.some((contact) => contact.id === entryPoint.contactId)) {
    return { ...base, level: "HIGH", score: 100, channel: `Direct phone${label(entryPoint)}` };
  }
  const otherDirect = relevant.find((contact) => directPhone(contact, company));
  if (otherDirect) {
    return { ...base, level: "HIGH", score: 85, channel: `Direct phone${label(otherDirect)}` };
  }
  if (digits(company.companyPhone).length >= 8) {
    if (relevant.length) {
      return { ...base, level: "MEDIUM", score: 70, channel: `Switchboard · ask for ${fullName(relevant[0])}` };
    }
    return { ...base, level: "MEDIUM", score: 55, channel: "Switchboard only" };
  }
  const direct = relevant.find(professionalEmail);
  if (direct) return { ...base, level: "LOW", score: 40, channel: `Direct email${label(direct)}` };
  if (company.companyEmail || contacts.some((contact) => contact.email)) {
    return { ...base, level: "LOW", score: 25, channel: "Generic email only" };
  }
  if (company.linkedinUrl || contacts.some((contact) => contact.linkedinUrl)) {
    return { ...base, level: "LOW", score: 10, channel: "LinkedIn only" };
  }
  return { ...base, level: "NONE", score: 0, channel: "No reliable phone contact identified" };
}

/* -------------------------------------------------------------------------- */
/* Commercial priority                                                         */
/* -------------------------------------------------------------------------- */

export type CommercialPriority = {
  label: "HIGH" | "MEDIUM" | "LOW";
  /** Sort key: higher first. */
  rank: number;
  reasons: string[];
};

const CLOSED = ["WON", "LOST", "DISQUALIFIED"];

/**
 * Ordering for Sales views, in this order of precedence:
 * 1. hard gates (fails qualification, marked Remove, closed) sink;
 * 2. fit carries the weight;
 * 3. confidence and coverage adjust it a little;
 * 4. contactability adjusts it a little more — enough to put a reachable
 *    Fit 86 ahead of an unreachable Fit 94, never enough to lift a weak fit
 *    over a clearly stronger one;
 * 5. a due next action breaks near-ties.
 */
export function commercialPriority(input: {
  fitScore: number | null;
  fitConfidence: string;
  coverage: number | null;
  passes: boolean | null;
  group: string | null;
  status: string;
  nextActionAt: Date | null;
  contactability: Contactability;
}): CommercialPriority {
  const reasons: string[] = [];
  const fit = input.fitScore ?? 0;
  reasons.push(`Fit ${input.fitScore ?? "—"}`);
  reasons.push(`${input.fitConfidence.charAt(0)}${input.fitConfidence.slice(1).toLowerCase()} confidence`);

  let rank = fit;
  rank += input.fitConfidence === "HIGH" ? 3 : input.fitConfidence === "LOW" ? -5 : 0;
  if (input.coverage !== null && input.coverage < 0.5) rank -= 3;
  rank += { HIGH: 12, MEDIUM: 6, LOW: 2, NONE: 0 }[input.contactability.level];
  reasons.push(input.contactability.channel);
  if (input.nextActionAt && input.nextActionAt.getTime() <= Date.now() + 2 * 86_400_000) {
    rank += 1;
    reasons.push("Next action due");
  }

  let gated = false;
  if (input.passes === false || input.group === "REMOVE") {
    gated = true;
    reasons.unshift("Fails qualification");
  } else if (CLOSED.includes(input.status)) {
    gated = true;
    reasons.unshift(input.status.charAt(0) + input.status.slice(1).toLowerCase());
  }
  if (gated) rank -= 1000;

  const label = gated ? "LOW" : rank >= 90 ? "HIGH" : rank >= 72 ? "MEDIUM" : "LOW";
  return { label, rank, reasons };
}

/** Review flag labels, including the live contactability flag. */
export const FLAG_LABELS: Record<string, string> = {
  OVERSIZED: "Oversized operator",
  FREIGHT_FORWARDER: "Freight forwarder",
  LOW_COVERAGE_HIGH_SCORE: "High score on low coverage",
  DIGITAL_STACK: "Strong digital stack",
  HARD_TO_CONTACT: "Hard to contact",
};
