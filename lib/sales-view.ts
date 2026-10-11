import {
  commercialPriority,
  computeContactability,
  type CommercialPriority,
  type Contactability,
} from "@/lib/contactability";
import { readQualification, type Qualification } from "@/lib/sales";

/** What a Sales list needs to load per prospect to rank it commercially. */
export const SALES_VIEW_INCLUDE = {
  contacts: {
    orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
    include: { _count: { select: { interactions: true } } },
  },
  intelligence: { select: { recommendedContactId: true } },
};

type ViewProspect = {
  fitScore: number | null;
  fitConfidence: string;
  fitExplanation: unknown;
  status: string;
  nextActionAt: Date | null;
  companyPhone: string | null;
  companyEmail: string | null;
  website: string | null;
  linkedinUrl: string | null;
  contacts: {
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
    _count?: { interactions: number };
  }[];
  intelligence?: { recommendedContactId: string | null } | null;
};

export type SalesView = {
  contactability: Contactability;
  priority: CommercialPriority;
  qualification: Qualification | null;
  /** Stored review flags, plus the live "hard to contact" flag. */
  flags: { flag: string; reason: string }[];
  /** Flags or a rule suggest a review and no one has decided yet. */
  reviewSuggested: boolean;
};

export function salesView(prospect: ViewProspect): SalesView {
  const contactability = computeContactability(
    prospect.contacts.map((contact) => ({ ...contact, interactionCount: contact._count?.interactions ?? 0 })),
    {
      companyPhone: prospect.companyPhone,
      companyEmail: prospect.companyEmail,
      website: prospect.website,
      linkedinUrl: prospect.linkedinUrl,
    },
    prospect.intelligence?.recommendedContactId,
  );
  const qualification = readQualification(prospect.fitExplanation);
  const coverage = (prospect.fitExplanation as { coverage?: unknown } | null)?.coverage;
  const priority = commercialPriority({
    fitScore: prospect.fitScore,
    fitConfidence: prospect.fitConfidence,
    coverage: typeof coverage === "number" ? coverage : null,
    passes: qualification?.passes ?? null,
    group: qualification?.group ?? null,
    status: prospect.status,
    nextActionAt: prospect.nextActionAt,
    contactability,
  });
  const flags = [...(qualification?.flags ?? [])];
  // Contact data changes without a re-score, so this flag is read live.
  if (contactability.score <= 10) {
    flags.push({ flag: "HARD_TO_CONTACT", reason: contactability.channel });
  }
  return {
    contactability,
    priority,
    qualification,
    flags,
    reviewSuggested: Boolean(flags.length && !qualification?.group && qualification?.passes !== false),
  };
}

/** Sales ordering: commercial priority, then fit. Never phone presence alone. */
export function bySalesPriority<T extends { view: SalesView; fitScore: number | null }>(a: T, b: T) {
  return b.view.priority.rank - a.view.priority.rank || (b.fitScore ?? 0) - (a.fitScore ?? 0);
}
