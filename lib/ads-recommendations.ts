/**
 * Reads the stored Google Ads snapshot and says what to do about it. Local
 * rules only — every recommendation exists because a number says so, and it
 * carries that number as evidence. Nothing here changes an account.
 */

import { ctr, euros, isInactive } from "@/lib/ads-insights";
import { ADS_RISK, type AdsActionType, type AdsRowLike } from "@/lib/ads-proposals";

export type RecommendationGroup = "HIGH" | "OPPORTUNITY" | "WATCH";

export type AdsRecommendation = {
  key: string;
  group: RecommendationGroup;
  title: string;
  /** Set only when the recommendation maps to a change Zuri can execute. */
  actionType: AdsActionType | null;
  what: string;
  why: string;
  evidence: string;
  risk: "LOW" | "MEDIUM" | "HIGH";
  expectedImpact: string;
  next: string;
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  keywordText: string;
  matchType: string;
};

/* Thresholds. Below these, a number is noise rather than evidence. */
const MIN_TERM_IMPRESSIONS = 10;
const MIN_TERM_CLICKS = 3;
const MIN_TERM_SPEND = 2;
const MIN_KEYWORD_CLICKS = 10;
const MIN_KEYWORD_SPEND = 5;
const MIN_CTR_IMPRESSIONS = 500;
const LOW_CTR = 0.01;

/** Words that mark a query as someone else's problem, not a customer's. */
const IRRELEVANT = [
  "free",
  "gratuit",
  "gratuite",
  "salaire",
  "salary",
  "emploi",
  "job",
  "jobs",
  "stage",
  "internship",
  "formation",
  "cours",
  "tutorial",
  "tutoriel",
  "wikipedia",
  "definition",
  "définition",
  "pdf",
  "torrent",
  "crack",
  "open source",
];

const COMMERCIAL = [
  "agence",
  "agency",
  "prix",
  "price",
  "pricing",
  "tarif",
  "devis",
  "quote",
  "company",
  "entreprise",
  "société",
  "prestataire",
  "consultant",
  "service",
  "sur mesure",
  "custom",
  "développeur",
  "developer",
  "près de",
  "near me",
  "luxembourg",
];

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/^[+"[\]]+|[+"[\]]+$/g, "")
    .replace(/[^a-z0-9àâäéèêëïîôöùûüç ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contains(text: string, words: string[]) {
  const value = ` ${normalize(text)} `;
  return words.filter((word) => value.includes(` ${word} `) || value.includes(word));
}

function money(value: number) {
  return `${value.toFixed(2)}`;
}

export type RecommendationInput = {
  campaigns: AdsRowLike[];
  adGroups: AdsRowLike[];
  keywords: AdsRowLike[];
  searchTerms: AdsRowLike[];
  /** Zuri's researched keywords for this brand, and nothing from any other. */
  zuriKeywords: { keyword: string; priorityScore: number | null; intent: string | null }[];
};

export function buildAdsRecommendations(
  input: RecommendationInput,
): AdsRecommendation[] {
  const out: AdsRecommendation[] = [];
  const keywordTexts = new Set(input.keywords.map((row) => normalize(row.text ?? "")));
  const activeCampaigns = input.campaigns.filter((row) => !isInactive(row.status));

  const target = (row: AdsRowLike) => ({
    campaignId: row.campaignId ?? null,
    campaignName: row.campaignName ?? null,
    adGroupId: row.adGroupId ?? null,
    adGroupName: row.adGroupName ?? null,
  });

  /* A. Search terms that are clearly not customers ------------------------- */
  for (const term of input.searchTerms) {
    const text = term.text ?? "";
    if (!text) continue;
    const spend = euros(term.costMicros);
    const strongEnough =
      term.impressions >= MIN_TERM_IMPRESSIONS ||
      term.clicks >= MIN_TERM_CLICKS ||
      spend >= MIN_TERM_SPEND;
    if (!strongEnough) continue;

    const hits = contains(text, IRRELEVANT);
    // Ambiguity is not evidence: only an explicit off-target word qualifies.
    if (!hits.length) continue;

    out.push({
      key: `negative:${normalize(text)}`,
      group: spend >= MIN_TERM_SPEND ? "HIGH" : "OPPORTUNITY",
      title: `Exclude "${text}"`,
      actionType: "ADD_NEGATIVE_KEYWORD",
      what: `Add "${text}" as a campaign-level phrase negative on ${term.campaignName ?? "the campaign"}.`,
      why: `The query contains ${hits.map((word) => `"${word}"`).join(", ")}, which signals someone who will not buy.`,
      evidence: `${term.impressions} impressions, ${term.clicks} clicks, ${money(spend)} spent, ${term.conversions} conversions.`,
      risk: ADS_RISK.ADD_NEGATIVE_KEYWORD,
      expectedImpact: spend > 0 ? `Stops the spend this query attracts.` : "Removes wasted impressions.",
      next: "Approve the action, then execute it from the Action Center.",
      ...target(term),
      keywordText: text,
      matchType: "PHRASE",
    });
  }

  /* B. Real queries worth targeting, not yet keywords ---------------------- */
  for (const term of input.searchTerms) {
    const text = term.text ?? "";
    if (!text || keywordTexts.has(normalize(text))) continue;
    if (contains(text, IRRELEVANT).length) continue;
    if (term.impressions < MIN_TERM_IMPRESSIONS && term.clicks < MIN_TERM_CLICKS) continue;

    const signals = contains(text, COMMERCIAL);
    if (!signals.length) continue;

    out.push({
      key: `add:${normalize(text)}`,
      group: "OPPORTUNITY",
      title: `Add "${text}" as a keyword`,
      actionType: "ADD_KEYWORD",
      what: `Create the phrase keyword "${text}" in ${term.adGroupName ?? "the ad group"}.`,
      why: "The query already reaches the ads through a looser match and reads as commercial intent, so it deserves its own keyword and its own bid.",
      evidence: `${term.impressions} impressions, ${term.clicks} clicks, ${term.conversions} conversions · commercial signal: ${signals.join(", ")}.`,
      risk: ADS_RISK.ADD_KEYWORD,
      expectedImpact: "Tighter control over a query the account already serves.",
      next: "Approve the action, then execute it from the Action Center.",
      ...target(term),
      keywordText: text,
      matchType: "PHRASE",
    });
  }

  /* C. Enabled keywords that never get shown ------------------------------- */
  const silent = input.keywords.filter(
    (row) => row.status === "ENABLED" && row.impressions === 0,
  );
  if (silent.length) {
    const noActiveCampaign = input.campaigns.length > 0 && activeCampaigns.length === 0;
    const restrictive = silent.filter((row) => row.matchType === "EXACT").length;

    out.push({
      key: "silent-keywords",
      group: "WATCH",
      // A diagnosis, not a change: nothing here is safe to execute blind.
      actionType: null,
      title: `${silent.length} enabled keyword${silent.length === 1 ? "" : "s"} with no impressions`,
      what: "Inspect why these keywords never enter an auction.",
      why: noActiveCampaign
        ? "Every campaign in the account is paused or removed, so no keyword can be shown whatever its quality."
        : "An enabled keyword with zero impressions is usually a parent that is off, a match type too tight, or a term with no real demand.",
      evidence:
        `${silent.length} of ${input.keywords.length} keywords at 0 impressions` +
        (restrictive ? `, ${restrictive} on exact match` : "") +
        `. Examples: ${silent
          .slice(0, 3)
          .map((row) => `"${row.text}"`)
          .join(", ")}.`,
      risk: "LOW",
      expectedImpact: "None on its own — this is a diagnosis.",
      next: noActiveCampaign
        ? "Enable a campaign, or accept that Paid is off for now."
        : "Check the parent campaign and ad group status, then the match type, then the search volume.",
      campaignId: null,
      campaignName: null,
      adGroupId: null,
      adGroupName: null,
      keywordText: "",
      matchType: "",
    });
  }

  /* D. Keywords spending without result ------------------------------------ */
  for (const keyword of input.keywords) {
    if (keyword.status !== "ENABLED") continue;
    const spend = euros(keyword.costMicros);
    if (keyword.clicks < MIN_KEYWORD_CLICKS || spend < MIN_KEYWORD_SPEND) continue;
    if (keyword.conversions > 0) continue;

    out.push({
      key: `pause:${normalize(keyword.text ?? "")}:${keyword.adGroupId}`,
      group: "HIGH",
      title: `Review "${keyword.text}"`,
      actionType: "PAUSE_KEYWORD",
      what: `Pause "${keyword.text}" in ${keyword.adGroupName ?? "its ad group"}, or fix what it points at.`,
      why: "It has had enough clicks and enough spend to convert at least once and has not.",
      evidence: `${keyword.clicks} clicks, ${money(spend)} spent, 0 conversions, ${(ctr(keyword) * 100).toFixed(1)}% CTR.`,
      risk: ADS_RISK.PAUSE_KEYWORD,
      expectedImpact: `Frees the ${money(spend)} this keyword currently absorbs.`,
      next: "Check the landing page first; pause only if the page is right and the query still does not convert.",
      ...target(keyword),
      keywordText: keyword.text ?? "",
      matchType: keyword.matchType ?? "BROAD",
    });
  }

  /* E. Broad keywords shown a lot and clicked rarely ----------------------- */
  for (const keyword of input.keywords) {
    if (keyword.status !== "ENABLED" || keyword.matchType !== "BROAD") continue;
    if (keyword.impressions < MIN_CTR_IMPRESSIONS) continue;
    if (ctr(keyword) >= LOW_CTR) continue;

    out.push({
      key: `match:${normalize(keyword.text ?? "")}:${keyword.adGroupId}`,
      group: "OPPORTUNITY",
      title: `Tighten "${keyword.text}" to phrase match`,
      actionType: "CHANGE_MATCH_TYPE",
      what: "Create the same term as a phrase keyword and pause the broad one. The broad keyword is kept, not deleted.",
      why: "A broad keyword shown often and clicked rarely is matching queries that are not the intent.",
      evidence: `${keyword.impressions.toLocaleString("en")} impressions, ${keyword.clicks} clicks (${(ctr(keyword) * 100).toFixed(1)}% CTR).`,
      risk: ADS_RISK.CHANGE_MATCH_TYPE,
      expectedImpact: "Fewer irrelevant impressions; the same budget on closer queries.",
      next: "Approve the action, then execute it from the Action Center.",
      ...target(keyword),
      keywordText: keyword.text ?? "",
      matchType: "PHRASE",
    });
  }

  /* F. Researched keywords Paid never tests -------------------------------- */
  const uncovered = input.zuriKeywords
    .filter((keyword) => !keywordTexts.has(normalize(keyword.keyword)))
    .filter(
      (keyword) => keyword.intent === "commercial" || keyword.intent === "transactional",
    )
    .slice(0, 3);

  // The ad group that already holds keywords: a Smart Campaign group accepts
  // none, so proposing into it would guarantee a rejected write.
  const keywordsPerGroup = new Map<string, number>();
  for (const keyword of input.keywords) {
    if (keyword.adGroupId) {
      keywordsPerGroup.set(
        keyword.adGroupId,
        (keywordsPerGroup.get(keyword.adGroupId) ?? 0) + 1,
      );
    }
  }
  const busiest = [...keywordsPerGroup.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const defaultGroup =
    input.adGroups.find((row) => row.adGroupId === busiest) ??
    input.keywords.find((row) => row.adGroupId === busiest) ??
    input.adGroups.find((row) => row.adGroupId);

  for (const keyword of uncovered) {
    if (!defaultGroup) break;
    out.push({
      key: `add:${normalize(keyword.keyword)}`,
      group: "OPPORTUNITY",
      title: `Test "${keyword.keyword}" in Paid`,
      actionType: "ADD_KEYWORD",
      what: `Create the phrase keyword "${keyword.keyword}" in ${defaultGroup.adGroupName ?? "the busiest ad group"}.`,
      why: "Zuri researched this term for SEO but Paid never tests it, and Paid answers in days rather than months.",
      evidence: `Priority ${keyword.priorityScore ?? "—"}, ${keyword.intent} intent, not present in the account.`,
      risk: ADS_RISK.ADD_KEYWORD,
      expectedImpact: "A real answer on whether the term converts.",
      next: "Approve the action, then execute it from the Action Center.",
      ...target(defaultGroup),
      keywordText: keyword.keyword,
      matchType: "PHRASE",
    });
  }

  // Deduplicate: the same change proposed twice is one recommendation.
  const seen = new Set<string>();
  return out.filter((item) => {
    if (seen.has(item.key)) return false;
    seen.add(item.key);
    return true;
  });
}
