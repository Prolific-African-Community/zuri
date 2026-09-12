/**
 * When a brand changes language, site, positioning, value proposition or
 * voice, everything Zuri collected before that is history. This says what is
 * now older than the brand itself — and recommends, never runs.
 */

/** The fields that make previously collected data stale. */
export const CONTEXT_FIELDS = [
  "language",
  "websiteUrl",
  "positioning",
  "valueProposition",
  "voiceDescription",
] as const;

type ContextSnapshot = Partial<Record<(typeof CONTEXT_FIELDS)[number], string | null>>;

/** True when a save actually changed one of the fields that matter. */
export function contextChanged(before: ContextSnapshot, after: ContextSnapshot) {
  return CONTEXT_FIELDS.some(
    (field) => (before[field] ?? "").trim() !== (after[field] ?? "").trim(),
  );
}

export type StaleItem = {
  label: string;
  /** What the reader should do about it. */
  action: string;
  href: string;
  lastAt: Date | null;
  stale: boolean;
};

export type Freshness = {
  contextUpdatedAt: Date | null;
  items: StaleItem[];
  staleCount: number;
};

/**
 * Anything last refreshed before the context changed is stale. Something that
 * never ran at all is stale too: the brand has no current picture of it.
 */
export function buildFreshness({
  brandId,
  contextUpdatedAt,
  lastCrawlAt,
  lastSearchConsoleAt,
  lastAdsAt,
  lastOpportunityAt,
}: {
  brandId: string;
  contextUpdatedAt: Date | null;
  lastCrawlAt: Date | null;
  lastSearchConsoleAt: Date | null;
  lastAdsAt: Date | null;
  lastOpportunityAt: Date | null;
}): Freshness {
  const isStale = (lastAt: Date | null) =>
    Boolean(contextUpdatedAt) && (!lastAt || lastAt < contextUpdatedAt!);

  const items: StaleItem[] = [
    {
      label: "Website crawl",
      action: "Crawl the site again so the pages Zuri reads are the current ones.",
      href: `/dashboard/brands/${brandId}`,
      lastAt: lastCrawlAt,
      stale: isStale(lastCrawlAt),
    },
    {
      label: "Search Console",
      action: "Sync Search Console for a snapshot that matches the current site.",
      href: `/dashboard/search?brand=${brandId}`,
      lastAt: lastSearchConsoleAt,
      stale: isStale(lastSearchConsoleAt),
    },
    {
      label: "Google Ads",
      action: "Sync Google Ads so recommendations read the current account.",
      href: `/dashboard/ads?brand=${brandId}`,
      lastAt: lastAdsAt,
      stale: isStale(lastAdsAt),
    },
    {
      label: "Opportunities",
      action: "Generate opportunities again — the old ones came from the old brand.",
      href: `/dashboard/opportunities?brand=${brandId}`,
      lastAt: lastOpportunityAt,
      stale: isStale(lastOpportunityAt),
    },
  ];

  return {
    contextUpdatedAt,
    items,
    staleCount: items.filter((item) => item.stale).length,
  };
}
