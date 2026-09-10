/**
 * Local derivation for the SEO Strategy view. Everything here is computed from
 * rows Zuri already stores — no model call, no external lookup. Each verdict
 * carries the reason that produced it, so nothing on screen is unexplained.
 */

const STOP_WORDS = new Set([
  "a", "an", "and", "the", "for", "of", "to", "in", "on", "with", "your", "you",
]);

export function tokens(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

export type Coverage = "COVERED" | "WEAK" | "NONE";

export type KeywordInsight = {
  id: string;
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  intent: string | null;
  priorityScore: number | null;
  competitors: { id: string; position: number; domain: string }[];
  coverage: Coverage;
  coverageReason: string;
  matchedUrl: string | null;
};

type Page = {
  url: string;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
};

type Keyword = {
  id: string;
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  intent: string | null;
  priorityScore: number | null;
  serpCompetitors: { id: string; position: number; domain: string }[];
};

/**
 * Coverage is word overlap between the keyword and a page's own title, H1 and
 * meta description — the only on-page signals Zuri actually crawled. It says
 * whether the site addresses the topic at all, not where it ranks.
 */
export function assessCoverage(keyword: string, pages: Page[]) {
  const words = tokens(keyword);
  if (!words.length) {
    return { coverage: "NONE" as Coverage, reason: "Keyword too short to match.", url: null };
  }

  let best = { ratio: 0, url: null as string | null };

  for (const page of pages) {
    const haystack = new Set(
      tokens([page.title, page.h1, page.metaDescription].filter(Boolean).join(" ")),
    );
    const hits = words.filter((word) => haystack.has(word)).length;
    const ratio = hits / words.length;
    if (ratio > best.ratio) best = { ratio, url: page.url };
  }

  const percent = Math.round(best.ratio * 100);

  if (best.ratio >= 0.8) {
    return {
      coverage: "COVERED" as Coverage,
      reason: `A page already targets this topic (${percent}% of the terms appear in its title, H1 or description).`,
      url: best.url,
    };
  }
  if (best.ratio >= 0.4) {
    return {
      coverage: "WEAK" as Coverage,
      reason: `Only partly addressed — ${percent}% of the terms appear on the closest page.`,
      url: best.url,
    };
  }
  return {
    coverage: "NONE" as Coverage,
    reason: pages.length
      ? "No crawled page addresses this topic."
      : "The site has not been crawled, so coverage is unknown.",
    url: null,
  };
}

export function buildKeywordInsights(
  keywords: Keyword[],
  pages: Page[],
): KeywordInsight[] {
  return keywords.map((keyword) => {
    const { coverage, reason, url } = assessCoverage(keyword.keyword, pages);
    return {
      id: keyword.id,
      keyword: keyword.keyword,
      searchVolume: keyword.searchVolume,
      difficulty: keyword.difficulty,
      intent: keyword.intent,
      priorityScore: keyword.priorityScore,
      competitors: keyword.serpCompetitors,
      coverage,
      coverageReason: reason,
      matchedUrl: url,
    };
  });
}

export type Recommendation = {
  id: string;
  title: string;
  weSee: string;
  whyItMatters: string;
  recommends: string;
  actionType: string | null;
  targetKeyword: string | null;
  targetUrl: string | null;
  score: number | null;
  rationale: string | null;
  hasBrief: boolean;
  hasContent: boolean;
};

type Opportunity = {
  id: string;
  title: string;
  description: string;
  actionType: string | null;
  targetKeyword: string | null;
  targetUrl: string | null;
  score: number | null;
  rationale: string | null;
  seoBrief: { id: string } | null;
  contentAssets: { type: string }[];
};

const ACTION_WORDING: Record<string, string> = {
  CREATE_PAGE: "Write a new page for this topic.",
  REFRESH_PAGE: "Rework the existing page rather than writing a new one.",
  TECHNICAL_FIX: "Fix the page's technical basics before anything else.",
  INTERNAL_LINK: "Point existing pages at this one to pass relevance.",
};

/** Turns a stored opportunity into a see / why / recommend reading. */
export function buildRecommendations(
  opportunities: Opportunity[],
  insights: KeywordInsight[],
): Recommendation[] {
  const byKeyword = new Map(insights.map((insight) => [insight.keyword, insight]));

  return opportunities.map((opportunity) => {
    const insight = opportunity.targetKeyword
      ? byKeyword.get(opportunity.targetKeyword)
      : undefined;

    const weSee = insight
      ? `"${insight.keyword}" — ${
          insight.searchVolume === null
            ? "volume unknown"
            : `${insight.searchVolume.toLocaleString("en")} searches a month`
        }, ${insight.intent ?? "intent unknown"} intent. ${insight.coverageReason}`
      : opportunity.targetUrl
        ? `On ${opportunity.targetUrl}: ${opportunity.description}`
        : opportunity.description;

    const reasons: string[] = [];
    if (insight?.intent === "commercial" || insight?.intent === "transactional") {
      reasons.push("the search carries buying intent");
    }
    if (insight && insight.difficulty !== null && insight.difficulty <= 30) {
      reasons.push(`difficulty is low (${insight.difficulty})`);
    }
    if (insight?.coverage === "NONE") reasons.push("nothing on the site answers it");
    if (insight?.coverage === "WEAK") reasons.push("the closest page only half answers it");
    if (opportunity.actionType === "TECHNICAL_FIX") {
      reasons.push("the page cannot compete while its basics are missing");
    }

    const whyItMatters = reasons.length
      ? `Scored ${opportunity.score ?? "—"} because ${reasons.join(", ")}.`
      : opportunity.rationale ??
        `Scored ${opportunity.score ?? "—"} on business value, effort and current position.`;

    return {
      id: opportunity.id,
      title: opportunity.title,
      weSee,
      whyItMatters,
      recommends:
        (opportunity.actionType && ACTION_WORDING[opportunity.actionType]) ??
        "Act on this opportunity.",
      actionType: opportunity.actionType,
      targetKeyword: opportunity.targetKeyword,
      targetUrl: opportunity.targetUrl,
      score: opportunity.score,
      rationale: opportunity.rationale,
      hasBrief: Boolean(opportunity.seoBrief),
      hasContent: opportunity.contentAssets.some(
        (asset) => asset.type === "SEO_CONTENT",
      ),
    };
  });
}

export type StrategySummary = {
  themes: { word: string; count: number }[];
  gaps: KeywordInsight[];
  balance: { action: string; count: number }[];
  startHere: Recommendation | null;
};

export function buildStrategySummary(
  insights: KeywordInsight[],
  recommendations: Recommendation[],
): StrategySummary {
  // Themes are the words that recur across the tracked keywords.
  const counts = new Map<string, number>();
  for (const insight of insights) {
    for (const word of new Set(tokens(insight.keyword))) {
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  const themes = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word, count]) => ({ word, count }));

  const gaps = insights
    .filter((insight) => insight.coverage === "NONE")
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
    .slice(0, 5);

  const balanceCounts = new Map<string, number>();
  for (const recommendation of recommendations) {
    if (!recommendation.actionType) continue;
    balanceCounts.set(
      recommendation.actionType,
      (balanceCounts.get(recommendation.actionType) ?? 0) + 1,
    );
  }
  const balance = [...balanceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([action, count]) => ({ action, count }));

  // Start with the highest-scoring recommendation that has not been started.
  const startHere =
    recommendations
      .filter((recommendation) => !recommendation.hasBrief && !recommendation.hasContent)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? null;

  return { themes, gaps, balance, startHere };
}
