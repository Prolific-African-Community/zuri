/**
 * Local derivation for the Ads view. CTR, CPC and conversion rate are computed
 * here from raw counters rather than stored, and every attention item carries
 * the evidence that produced it. No model call.
 */

export type AdsRowLike = {
  id: string;
  level: string;
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  text: string | null;
  matchType: string | null;
  status: string | null;
  impressions: number;
  clicks: number;
  costMicros: bigint;
  conversions: number;
  keywordId: string | null;
};

export function euros(costMicros: bigint | number) {
  return Number(costMicros) / 1_000_000;
}

export function ctr(row: { clicks: number; impressions: number }) {
  return row.impressions ? row.clicks / row.impressions : 0;
}

export function cpc(row: { clicks: number; costMicros: bigint | number }) {
  return row.clicks ? euros(row.costMicros) / row.clicks : 0;
}

export function conversionRate(row: { clicks: number; conversions: number }) {
  return row.clicks ? row.conversions / row.clicks : 0;
}

/** A campaign that could not have spent anything. */
export function isInactive(status: string | null) {
  return status === "PAUSED" || status === "REMOVED";
}

export type AttentionItem = {
  id: string;
  what: string;
  why: string;
  evidence: string;
  next: string;
};

export function buildAdsAttention({
  campaigns,
  keywords,
  searchTerms,
  zuriKeywords,
}: {
  campaigns: AdsRowLike[];
  keywords: AdsRowLike[];
  searchTerms: AdsRowLike[];
  /** Zuri's own researched keywords, to spot what Paid never covers. */
  zuriKeywords: { keyword: string; priorityScore: number | null; intent: string | null }[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  // 1. Nothing is running at all.
  const active = campaigns.filter((row) => !isInactive(row.status));
  if (campaigns.length && !active.length) {
    items.push({
      id: "no-active-campaign",
      what: "No campaign is running",
      why: "Paid search cannot contribute anything while every campaign is paused or removed.",
      evidence: `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} in the account, all ${[
        ...new Set(campaigns.map((row) => (row.status ?? "unknown").toLowerCase())),
      ].join(" or ")}.`,
      next: "Decide whether Paid is part of the plan; if it is, enable one campaign.",
    });
  } else {
    for (const campaign of campaigns.filter((row) => isInactive(row.status))) {
      items.push({
        id: `inactive-${campaign.id}`,
        what: `Campaign "${campaign.campaignName}" is ${(campaign.status ?? "").toLowerCase()}`,
        why: "It occupies the account without contributing traffic.",
        evidence: `0 impressions over the period, status ${campaign.status}.`,
        next: "Re-enable it or archive it so the account reflects the real plan.",
      });
    }
  }

  // 2. Money spent with nothing to show for it.
  for (const keyword of keywords
    .filter((row) => euros(row.costMicros) > 0 && row.conversions === 0)
    .sort((a, b) => Number(b.costMicros) - Number(a.costMicros))
    .slice(0, 3)) {
    items.push({
      id: `costly-${keyword.id}`,
      what: `"${keyword.text}" spends without converting`,
      why: "Budget is going to a term that has produced no conversion.",
      evidence: `${euros(keyword.costMicros).toFixed(2)} spent, ${keyword.clicks} clicks, 0 conversions.`,
      next: "Check the landing page match, or pause the keyword.",
    });
  }

  // 3. Seen a lot, clicked rarely.
  for (const keyword of keywords
    .filter((row) => row.impressions >= 100 && ctr(row) < 0.02)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 3)) {
    items.push({
      id: `low-ctr-${keyword.id}`,
      what: `"${keyword.text}" is shown but not clicked`,
      why: "A low click-through rate usually means the ad does not answer the query.",
      evidence: `${keyword.impressions.toLocaleString("en")} impressions, ${keyword.clicks} clicks (${(ctr(keyword) * 100).toFixed(1)}% CTR).`,
      next: "Rewrite the ad copy for this term, or narrow the match type.",
    });
  }

  // 4. Enabled keywords that never got shown.
  const silent = keywords.filter(
    (row) => row.impressions === 0 && row.status === "ENABLED",
  );
  if (silent.length) {
    items.push({
      id: "no-delivery",
      what: `${silent.length} enabled keyword${silent.length === 1 ? "" : "s"} never served`,
      why: "An enabled keyword with no impression is usually blocked by budget, bid or low search volume.",
      evidence: silent
        .slice(0, 3)
        .map((row) => `"${row.text}"`)
        .join(", "),
      next: "Check the campaign budget and the bid before adding more keywords.",
    });
  }

  // 5. A real query the account pays for but does not target explicitly.
  const keywordTexts = new Set(
    keywords.map((row) => (row.text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()),
  );
  for (const term of searchTerms
    .filter((row) => {
      const normalized = (row.text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return (
        (row.clicks > 0 || euros(row.costMicros) > 0) && !keywordTexts.has(normalized)
      );
    })
    .sort((a, b) => Number(b.costMicros) - Number(a.costMicros))
    .slice(0, 3)) {
    items.push({
      id: `uncovered-term-${term.id}`,
      what: `"${term.text}" gets traffic without being a keyword`,
      why: "A query is converting spend into clicks while no keyword targets it directly.",
      evidence: `${term.clicks} clicks, ${euros(term.costMicros).toFixed(2)} spent, ${term.conversions} conversions.`,
      next: "Add it as its own keyword, or exclude it if it is off-target.",
    });
  }

  // 6. Where SEO research and Paid do not meet.
  const covered = new Set([
    ...keywordTexts,
    ...searchTerms.map((row) =>
      (row.text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
    ),
  ]);
  const uncovered = zuriKeywords
    .filter((keyword) => {
      const normalized = keyword.keyword.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return !covered.has(normalized);
    })
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));

  if (uncovered.length) {
    const top = uncovered[0];
    items.push({
      id: "seo-not-in-ads",
      what: `${uncovered.length} researched keyword${uncovered.length === 1 ? "" : "s"} absent from Ads`,
      why: "Terms Zuri identified as valuable for SEO are not being tested in Paid, where results arrive faster.",
      evidence: `Highest is "${top.keyword}" (priority ${top.priorityScore ?? "—"}${
        top.intent ? `, ${top.intent} intent` : ""
      }).`,
      next: "Test the strongest of them in a small campaign before committing to the SEO work.",
    });
  }

  return items.slice(0, 8);
}
