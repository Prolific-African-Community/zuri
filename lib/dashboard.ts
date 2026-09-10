import { findIssues } from "@/lib/crawler";

/**
 * Everything the Growth Control Center shows is derived here, from rows Zuri
 * already stores. No model call, no invented metric: if a number cannot be
 * counted, it is not displayed.
 */

type Opportunity = {
  id: string;
  title: string;
  status: string;
  source: string;
  score: number | null;
  actionType: string | null;
  targetKeyword: string | null;
  createdAt: Date;
  seoBrief: { id: string } | null;
  contentAssets: { id: string; type: string }[];
};

type ContentAsset = {
  id: string;
  title: string | null;
  status: string;
  channel: string;
  type: string;
  scheduledAt: Date | null;
  createdAt: Date;
};

type Page = {
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  statusCode: number | null;
  lastCrawledAt: Date;
};

type Keyword = {
  keyword: string;
  searchVolume: number | null;
  difficulty: number | null;
  intent: string | null;
  priorityScore: number | null;
  createdAt: Date;
};

export type AttentionItem = {
  id: string;
  what: string;
  why: string;
  href: string;
  cta: string;
  weight: number;
};

export type ChangeEvent = {
  id: string;
  at: Date;
  label: string;
  detail: string;
};

/** An opportunity nobody has acted on yet. */
function untouched(opportunity: Opportunity) {
  return (
    opportunity.status === "NEW" &&
    !opportunity.seoBrief &&
    opportunity.contentAssets.length === 0
  );
}

export function buildAttention({
  opportunities,
  contentAssets,
  pages,
}: {
  opportunities: Opportunity[];
  contentAssets: ContentAsset[];
  pages: Page[];
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  // 1. The strongest opportunity nobody has started.
  const topUntouched = opportunities
    .filter(untouched)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  if (topUntouched && (topUntouched.score ?? 0) >= 60) {
    items.push({
      id: `opp-${topUntouched.id}`,
      what: topUntouched.title,
      why: `Scored ${topUntouched.score}, still untouched${
        topUntouched.targetKeyword ? ` · ${topUntouched.targetKeyword}` : ""
      }.`,
      href: "/dashboard/opportunities",
      cta: "Open opportunities",
      weight: 100 + (topUntouched.score ?? 0),
    });
  }

  // 2. Drafts waiting on a decision.
  const drafts = contentAssets.filter((asset) => asset.status === "DRAFT");
  if (drafts.length) {
    items.push({
      id: "drafts-pending",
      what: `${drafts.length} draft${drafts.length === 1 ? "" : "s"} waiting for approval`,
      why: `Written and saved, not yet approved. Oldest: ${drafts[drafts.length - 1].title ?? "untitled"}.`,
      href: "/dashboard/content?status=DRAFT",
      cta: "Review drafts",
      weight: 90,
    });
  }

  // 3. A brief that never became a page.
  const briefWithoutContent = opportunities.find(
    (opportunity) =>
      opportunity.seoBrief &&
      !opportunity.contentAssets.some((asset) => asset.type === "SEO_CONTENT"),
  );
  if (briefWithoutContent) {
    items.push({
      id: `brief-${briefWithoutContent.id}`,
      what: `Brief without content: ${briefWithoutContent.title}`,
      why: "The SEO brief is ready — the page it describes has not been written.",
      href: "/dashboard/opportunities",
      cta: "Finish it",
      weight: 85,
    });
  }

  // 4. Approved but going nowhere.
  const approvedUnscheduled = contentAssets.filter(
    (asset) => asset.status === "APPROVED" && !asset.scheduledAt,
  );
  if (approvedUnscheduled.length) {
    items.push({
      id: "approved-unscheduled",
      what: `${approvedUnscheduled.length} approved item${
        approvedUnscheduled.length === 1 ? "" : "s"
      } with no date`,
      why: "Approved content sits idle until it is scheduled.",
      href: "/dashboard/content?status=APPROVED",
      cta: "Schedule",
      weight: 80,
    });
  }

  // 5. What is already booked, so the week is not a surprise.
  const upcoming = contentAssets
    .filter((asset) => asset.scheduledAt && asset.scheduledAt > new Date())
    .sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0];
  if (upcoming) {
    items.push({
      id: `scheduled-${upcoming.id}`,
      what: `Next up: ${upcoming.title ?? "untitled"}`,
      why: `Scheduled for ${upcoming.scheduledAt!.toLocaleString("en", {
        weekday: "long",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}.`,
      href: "/dashboard/calendar",
      cta: "Open calendar",
      weight: 60,
    });
  }

  // 6. Technical debt found by the last crawl.
  const flagged = findIssues(pages).filter(({ issues }) =>
    Object.values(issues).some(Boolean),
  );
  if (flagged.length) {
    items.push({
      id: "seo-issues",
      what: `${flagged.length} page${flagged.length === 1 ? "" : "s"} with SEO issues`,
      why: "Missing titles, descriptions, H1s or non-200 responses found in the last crawl.",
      href: "/dashboard/search",
      cta: "See the audit",
      weight: 70,
    });
  }

  return items.sort((a, b) => b.weight - a.weight).slice(0, 5);
}

export function buildChanges({
  opportunities,
  contentAssets,
  keywords,
  lastCrawledAt,
  pageCount,
}: {
  opportunities: Opportunity[];
  contentAssets: ContentAsset[];
  keywords: Keyword[];
  lastCrawledAt: Date | null;
  pageCount: number;
}): ChangeEvent[] {
  const events: ChangeEvent[] = [];

  for (const opportunity of opportunities.slice(0, 5)) {
    events.push({
      id: `opp-${opportunity.id}`,
      at: opportunity.createdAt,
      label: "New opportunity",
      detail:
        opportunity.title +
        (opportunity.score === null ? "" : ` · scored ${opportunity.score}`),
    });
  }

  for (const asset of contentAssets.slice(0, 5)) {
    events.push({
      id: `asset-${asset.id}`,
      at: asset.createdAt,
      label:
        asset.type === "SEO_CONTENT" ? "SEO content written" : "Draft written",
      detail: asset.title ?? "Untitled",
    });
  }

  // Keywords arrive in one batch — report the batch, not each keyword.
  if (keywords.length) {
    const newest = keywords.reduce((latest, keyword) =>
      keyword.createdAt > latest.createdAt ? keyword : latest,
    );
    const sameBatch = keywords.filter(
      (keyword) =>
        Math.abs(keyword.createdAt.getTime() - newest.createdAt.getTime()) <
        60_000,
    );
    events.push({
      id: "keywords",
      at: newest.createdAt,
      label: `${sameBatch.length} keyword${sameBatch.length === 1 ? "" : "s"} researched`,
      detail: sameBatch
        .slice(0, 3)
        .map((keyword) => keyword.keyword)
        .join(", "),
    });
  }

  if (lastCrawledAt) {
    events.push({
      id: "crawl",
      at: lastCrawledAt,
      label: "Website crawled",
      detail: `${pageCount} page${pageCount === 1 ? "" : "s"} audited`,
    });
  }

  return events.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 5);
}
