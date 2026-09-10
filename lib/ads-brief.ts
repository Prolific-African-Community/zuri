/**
 * The execution brief: what Zuri would ask someone else to change in Google
 * Ads, and everything they must not touch while doing it. Built from the
 * stored snapshot — no model call, no invented numbers.
 */

import type { AdsRecommendation } from "@/lib/ads-recommendations";

export type BriefSection = { label: string; lines: string[] };

export type BriefContext = {
  brandName: string;
  customerId: string;
  objective: string;
};

/** Never negotiable, whoever executes the change. */
const GUARDRAILS = [
  "Do not change any budget.",
  "Do not change bidding strategy, bids or target CPA/ROAS.",
  "Do not change conversion actions or tracking.",
  "Do not change geographic, language or audience targeting.",
  "Do not change landing pages or final URLs.",
  "Do not create, pause or remove campaigns.",
  "Touch only the campaign and ad group named above.",
];

export function buildExecutionBrief(
  recommendation: AdsRecommendation,
  context: BriefContext,
): BriefSection[] {
  return [
    {
      label: "Context",
      lines: [
        `Brand: ${context.brandName}`,
        `Google Ads customer: ${context.customerId}`,
        `Campaign: ${recommendation.campaignName ?? "—"}`,
        `Ad group: ${recommendation.adGroupName ?? "—"}`,
        `Objective: ${context.objective}`,
      ],
    },
    {
      label: "Changes requested",
      lines: [
        recommendation.what,
        recommendation.keywordText
          ? `Term concerned: "${recommendation.keywordText}"${
              recommendation.matchType
                ? ` (${recommendation.matchType.toLowerCase()} match)`
                : ""
            }`
          : "",
        recommendation.next,
      ].filter(Boolean),
    },
    {
      label: "Why",
      lines: [
        recommendation.why,
        `Evidence: ${recommendation.evidence}`,
        `Expected impact: ${recommendation.expectedImpact}`,
        `Risk: ${recommendation.risk.toLowerCase()}`,
      ],
    },
    { label: "Guardrails", lines: GUARDRAILS },
  ];
}

export function briefToText(title: string, sections: BriefSection[]) {
  return [
    title,
    "",
    ...sections.flatMap((section) => [
      section.label.toUpperCase(),
      ...section.lines.map((line) => (section.label === "Context" ? line : `- ${line}`)),
      "",
    ]),
  ]
    .join("\n")
    .trim();
}
