/**
 * Turns an approved SEO recommendation into an implementation brief a person
 * (or their coding agent) can act on. Zuri describes the change; it does not
 * make it. Nothing here writes anywhere.
 */

export type SeoActionKind =
  | "CREATE_PAGE"
  | "REFRESH_PAGE"
  | "TECHNICAL_FIX"
  | "INTERNAL_LINK";

export type BriefSource = {
  objective: string;
  searchIntent: string | null;
  recommendedTitle: string | null;
  recommendedMetaDescription: string | null;
  outline: string[];
  keyQuestions: string[];
  internalLinks: string[];
  competitorInsights: string[];
  evidenceNeeded: string[];
};

export type ImplementationInput = {
  actionType: SeoActionKind | null;
  title: string;
  summary: string;
  rationale: string;
  targetUrl: string | null;
  targetKeyword: string | null;
  priority: number | null;
  brand: string;
  brief: BriefSource | null;
};

export type BriefSection = { label: string; lines: string[] };

/** What the change is, in the words the action type deserves. */
function whatToChange(input: ImplementationInput): string[] {
  const keyword = input.targetKeyword ?? "the target keyword";
  const page = input.targetUrl ?? "the page";

  switch (input.actionType) {
    case "CREATE_PAGE":
      return [
        `Create a new page answering "${keyword}".`,
        input.brief?.recommendedTitle
          ? `Recommended title: ${input.brief.recommendedTitle}`
          : "",
        input.brief?.recommendedMetaDescription
          ? `Recommended meta description: ${input.brief.recommendedMetaDescription}`
          : "",
      ].filter(Boolean);
    case "REFRESH_PAGE":
      return [
        `Rework ${page} so it answers "${keyword}" directly and early.`,
        input.brief?.recommendedTitle
          ? `Title to use: ${input.brief.recommendedTitle}`
          : "",
        input.brief?.recommendedMetaDescription
          ? `Meta description to use: ${input.brief.recommendedMetaDescription}`
          : "",
      ].filter(Boolean);
    case "TECHNICAL_FIX":
      return [`Fix the technical issue on ${page}.`, input.summary];
    case "INTERNAL_LINK":
      return [
        `Add an internal link pointing to ${page}.`,
        input.brief?.internalLinks.length
          ? `Suggested sources: ${input.brief.internalLinks.join(", ")}`
          : "Link from the most relevant existing page.",
        `Suggested anchor: ${keyword}`,
      ];
    default:
      return [input.summary];
  }
}

function implementation(input: ImplementationInput): string[] {
  const brief = input.brief;
  switch (input.actionType) {
    case "CREATE_PAGE":
    case "REFRESH_PAGE":
      return [
        ...(brief?.outline.length
          ? ["Sections, in order:", ...brief.outline.map((item) => `  - ${item}`)]
          : []),
        ...(brief?.keyQuestions.length
          ? [
              "Questions the page must answer:",
              ...brief.keyQuestions.map((item) => `  - ${item}`),
            ]
          : []),
        ...(brief?.evidenceNeeded.length
          ? [
              "Evidence still needed before publishing:",
              ...brief.evidenceNeeded.map((item) => `  - ${item}`),
            ]
          : []),
      ];
    case "TECHNICAL_FIX":
      return [
        "Apply the fix in the site's own codebase or CMS.",
        "Re-crawl afterwards so Zuri can confirm the issue is gone.",
      ];
    case "INTERNAL_LINK":
      return [
        "Place the link inside body copy where it genuinely helps the reader,",
        "not in a footer or a related-links block.",
      ];
    default:
      return [];
  }
}

/** The brief as sections, for display and for the clipboard. */
export function buildImplementationBrief(
  input: ImplementationInput,
): BriefSection[] {
  const sections: BriefSection[] = [
    { label: "What to change", lines: whatToChange(input) },
    { label: "Why", lines: [input.rationale] },
  ];

  const evidence = [
    ...(input.brief?.competitorInsights ?? []),
    ...(input.brief?.searchIntent ? [`Search intent: ${input.brief.searchIntent}`] : []),
    ...(input.brief?.objective ? [input.brief.objective] : []),
  ];
  if (evidence.length) sections.push({ label: "Evidence", lines: evidence });

  sections.push({
    label: "Target",
    lines: [
      `Brand: ${input.brand}`,
      `Page: ${input.targetUrl ?? "to be created"}`,
      `Keyword: ${input.targetKeyword ?? "—"}`,
      `Priority: ${input.priority === null ? "—" : String(input.priority)}`,
    ],
  });

  const steps = implementation(input);
  if (steps.length) {
    sections.push({ label: "Recommended implementation", lines: steps });
  }

  if (input.brief?.internalLinks.length && input.actionType !== "INTERNAL_LINK") {
    sections.push({ label: "Internal links", lines: input.brief.internalLinks });
  }

  return sections;
}

export function briefToText(title: string, sections: BriefSection[]) {
  return [
    title,
    "",
    ...sections.flatMap((section) => [
      `${section.label.toUpperCase()}`,
      ...section.lines,
      "",
    ]),
  ]
    .join("\n")
    .trim();
}
