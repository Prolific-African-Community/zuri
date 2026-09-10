/**
 * Turns the Ads snapshot Zuri already stores into concrete, justified change
 * proposals. Local rules only — a proposal exists because the data says so, or
 * it is not produced at all.
 */

export const ADS_ACTION_TYPES = [
  "ADD_KEYWORD",
  "PAUSE_KEYWORD",
  "ADD_NEGATIVE_KEYWORD",
  "CHANGE_MATCH_TYPE",
] as const;

export type AdsActionType = (typeof ADS_ACTION_TYPES)[number];

/** Risk is fixed per action type: how much damage a wrong call could do. */
export const ADS_RISK: Record<AdsActionType, "LOW" | "MEDIUM" | "HIGH"> = {
  ADD_KEYWORD: "LOW",
  ADD_NEGATIVE_KEYWORD: "MEDIUM",
  CHANGE_MATCH_TYPE: "MEDIUM",
  PAUSE_KEYWORD: "HIGH",
};

/** One shape for an Ads row across the whole feature. */
import type { AdsRowLike } from "@/lib/ads-insights";
export type { AdsRowLike };

export type ZuriKeyword = {
  keyword: string;
  priorityScore: number | null;
  intent: string | null;
  searchVolume: number | null;
};

export type AdsProposal = {
  key: string;
  actionType: AdsActionType;
  title: string;
  current: string;
  proposed: string;
  why: string;
  evidence: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  keywordText: string;
  matchType: string;
  criterionId: string | null;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/^[+"[\]]+|[+"[\]]+$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function euros(costMicros: bigint) {
  return Number(costMicros) / 1_000_000;
}

/**
 * `searchConsoleQueries` are real queries the site already receives from
 * organic search — the strongest evidence that a term is worth paying for.
 */
export function buildAdsProposals({
  keywords,
  searchTerms,
  zuriKeywords,
  searchConsoleQueries,
  defaultAdGroup,
}: {
  keywords: AdsRowLike[];
  searchTerms: AdsRowLike[];
  zuriKeywords: ZuriKeyword[];
  searchConsoleQueries: { value: string; clicks: number; impressions: number }[];
  defaultAdGroup: { adGroupId: string; adGroupName: string; campaignId: string; campaignName: string } | null;
}): AdsProposal[] {
  const proposals: AdsProposal[] = [];

  const adsKeywordTexts = new Set(keywords.map((row) => normalize(row.text ?? "")));
  const gscByQuery = new Map(
    searchConsoleQueries.map((row) => [normalize(row.value), row]),
  );

  // 1. Researched keywords that Paid never covers.
  if (defaultAdGroup) {
    const uncovered = zuriKeywords
      .filter((keyword) => !adsKeywordTexts.has(normalize(keyword.keyword)))
      .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
      .slice(0, 5);

    for (const keyword of uncovered) {
      const gsc = gscByQuery.get(normalize(keyword.keyword));
      proposals.push({
        key: `add:${normalize(keyword.keyword)}`,
        actionType: "ADD_KEYWORD",
        title: `Add "${keyword.keyword}" as a phrase keyword`,
        current: `No keyword in ${defaultAdGroup.adGroupName} targets this term.`,
        proposed: `Create the phrase keyword "${keyword.keyword}" in ${defaultAdGroup.adGroupName}, enabled.`,
        why: "Zuri researched this term for SEO but Paid never tests it, where results arrive in days rather than months.",
        evidence: [
          `priority ${keyword.priorityScore ?? "—"}`,
          keyword.intent ? `${keyword.intent} intent` : null,
          keyword.searchVolume === null
            ? null
            : `${keyword.searchVolume.toLocaleString("en")} searches a month`,
          gsc ? `${gsc.impressions} organic impressions already` : null,
        ]
          .filter(Boolean)
          .join(", ") + ".",
        risk: ADS_RISK.ADD_KEYWORD,
        campaignId: defaultAdGroup.campaignId,
        campaignName: defaultAdGroup.campaignName,
        adGroupId: defaultAdGroup.adGroupId,
        adGroupName: defaultAdGroup.adGroupName,
        keywordText: keyword.keyword,
        matchType: "PHRASE",
        criterionId: null,
      });
    }
  }

  // 2. Keywords burning budget with nothing to show.
  for (const keyword of keywords
    .filter(
      (row) =>
        euros(row.costMicros) >= 5 &&
        row.conversions === 0 &&
        row.clicks >= 10 &&
        row.status === "ENABLED",
    )
    .sort((a, b) => Number(b.costMicros) - Number(a.costMicros))
    .slice(0, 3)) {
    proposals.push({
      key: `pause:${normalize(keyword.text ?? "")}:${keyword.adGroupId}`,
      actionType: "PAUSE_KEYWORD",
      title: `Pause "${keyword.text}"`,
      current: `Enabled in ${keyword.adGroupName}, ${keyword.matchType?.toLowerCase()} match.`,
      proposed: "Set the keyword to paused. Nothing else changes.",
      why: "It has spent a meaningful amount over 30 days without producing a single conversion.",
      evidence: `${euros(keyword.costMicros).toFixed(2)} spent, ${keyword.clicks} clicks, 0 conversions.`,
      risk: ADS_RISK.PAUSE_KEYWORD,
      campaignId: keyword.campaignId,
      campaignName: keyword.campaignName,
      adGroupId: keyword.adGroupId,
      adGroupName: keyword.adGroupName,
      keywordText: keyword.text ?? "",
      matchType: keyword.matchType ?? "BROAD",
      criterionId: null,
    });
  }

  // 3. Paid-for queries that are clearly off-target.
  for (const term of searchTerms
    .filter(
      (row) =>
        euros(row.costMicros) >= 2 &&
        row.conversions === 0 &&
        !adsKeywordTexts.has(normalize(row.text ?? "")),
    )
    .sort((a, b) => Number(b.costMicros) - Number(a.costMicros))
    .slice(0, 3)) {
    proposals.push({
      key: `negative:${normalize(term.text ?? "")}`,
      actionType: "ADD_NEGATIVE_KEYWORD",
      title: `Exclude "${term.text}"`,
      current: `The query matched broadly and cost ${euros(term.costMicros).toFixed(2)} with no conversion.`,
      proposed: `Add "${term.text}" as a campaign-level phrase negative on ${term.campaignName}.`,
      why: "Spend is going to a query no keyword targets and that has never converted.",
      evidence: `${term.clicks} clicks, ${euros(term.costMicros).toFixed(2)} spent, 0 conversions.`,
      risk: ADS_RISK.ADD_NEGATIVE_KEYWORD,
      campaignId: term.campaignId,
      campaignName: term.campaignName,
      adGroupId: term.adGroupId,
      adGroupName: term.adGroupName,
      keywordText: term.text ?? "",
      matchType: "PHRASE",
      criterionId: null,
    });
  }

  // 4. Broad keywords that get shown a lot and clicked rarely.
  for (const keyword of keywords
    .filter(
      (row) =>
        row.matchType === "BROAD" &&
        row.impressions >= 500 &&
        row.clicks / row.impressions < 0.01 &&
        row.status === "ENABLED",
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3)) {
    proposals.push({
      key: `match:${normalize(keyword.text ?? "")}:${keyword.adGroupId}`,
      actionType: "CHANGE_MATCH_TYPE",
      title: `Tighten "${keyword.text}" to phrase match`,
      current: `Broad match in ${keyword.adGroupName}.`,
      proposed:
        "Create the same term as a phrase keyword and pause the broad one. The broad keyword is kept, not deleted.",
      why: "A broad keyword shown often but rarely clicked is usually matching queries that are not the intent.",
      evidence: `${keyword.impressions.toLocaleString("en")} impressions, ${keyword.clicks} clicks (${((keyword.clicks / keyword.impressions) * 100).toFixed(1)}% CTR).`,
      risk: ADS_RISK.CHANGE_MATCH_TYPE,
      campaignId: keyword.campaignId,
      campaignName: keyword.campaignName,
      adGroupId: keyword.adGroupId,
      adGroupName: keyword.adGroupName,
      keywordText: keyword.text ?? "",
      matchType: "PHRASE",
      criterionId: null,
    });
  }

  return proposals;
}
