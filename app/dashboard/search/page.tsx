import {
  GoogleAdsStatus,
  GoogleSearchConsole,
} from "@/components/search/google-connect";
import {
  CrawlButton,
  DiscoverKeywordsButton,
  GenerateSeoOpportunitiesButton,
} from "@/components/search/crawl-button";
import { Badge } from "@/components/ui/badge";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState, Page, PageHeader, Section, Stat } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { findIssues } from "@/lib/crawler";
import { getConnection, hasAdsScope } from "@/lib/google";
import { getPrisma } from "@/lib/prisma";
import {
  buildKeywordInsights,
  buildRecommendations,
  buildStrategySummary,
  type Coverage,
  type KeywordInsight,
  type Recommendation,
} from "@/lib/seo-strategy";
import Link from "next/link";

export const metadata = { title: "Search" };
export const dynamic = "force-dynamic";

const VISIBLE_RECOMMENDATIONS = 5;

const dateTime = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const chip =
  "rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200";
const chipActive = "bg-accent-soft font-medium text-accent-ink";
const chipIdle = "text-ink-3 hover:bg-sunken hover:text-ink";

const COVERAGE_LABEL: Record<Coverage, string> = {
  COVERED: "Covered",
  WEAK: "Weak coverage",
  NONE: "No coverage",
};

const COVERAGE_TONE: Record<Coverage, "accent" | "neutral" | "muted"> = {
  COVERED: "accent",
  WEAK: "neutral",
  NONE: "muted",
};

const percent = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Formats a period-over-period move, or nothing when there is no baseline. */
function delta(current: number, previous: number | null, lowerIsBetter = false) {
  if (previous === null || previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  if (Math.abs(change) < 0.5) return { text: "flat", better: null as boolean | null };
  return {
    text: `${change > 0 ? "+" : ""}${change.toFixed(0)}%`,
    better: lowerIsBetter ? change < 0 : change > 0,
  };
}

function Move({ move }: { move: { text: string; better: boolean | null } | null }) {
  if (!move) return null;
  return (
    <span
      className={cn(
        "type-meta ml-2",
        move.better === null
          ? "text-ink-4"
          : move.better
            ? "text-accent-ink"
            : "text-ink-2",
      )}
    >
      {move.text}
    </span>
  );
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function KeywordRow({ insight }: { insight: KeywordInsight }) {
  return (
    <li className="py-5 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-medium tracking-[-0.01em]">
            {insight.keyword}
          </p>
          <p className="type-meta mt-1">
            {insight.searchVolume === null
              ? "volume —"
              : `${insight.searchVolume.toLocaleString("en")} searches / month`}
            {" · "}
            {insight.difficulty === null
              ? "difficulty —"
              : `difficulty ${insight.difficulty}/100`}
            {" · "}
            {insight.intent ?? "intent —"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2.5">
          <Badge tone={COVERAGE_TONE[insight.coverage]}>
            {COVERAGE_LABEL[insight.coverage]}
          </Badge>
          <span className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-accent-ink">
            {insight.priorityScore ?? "—"}
          </span>
        </div>
      </div>

      <p className="type-meta mt-2 max-w-2xl">{insight.coverageReason}</p>

      {insight.competitors.length ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="type-label mr-1">Ranking now</span>
          {insight.competitors.slice(0, 5).map((entry) => (
            <span
              key={entry.id}
              className="rounded-full bg-sunken px-2.5 py-1 text-[0.75rem] text-ink-2"
            >
              {entry.position}. {entry.domain}
            </span>
          ))}
        </div>
      ) : (
        <p className="type-meta mt-2.5 text-ink-4">No SERP snapshot yet.</p>
      )}
    </li>
  );
}

function RecommendationRow({ item }: { item: Recommendation }) {
  return (
    <li className="py-6 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <p className="min-w-0 text-[0.9375rem] font-medium tracking-[-0.01em]">
          {item.title}
        </p>
        <div className="flex shrink-0 items-center gap-2.5">
          {item.actionType ? (
            <Badge tone="accent">{label(item.actionType)}</Badge>
          ) : null}
          <span className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-accent-ink">
            {item.score ?? "—"}
          </span>
        </div>
      </div>

      <dl className="mt-4 grid max-w-3xl gap-3">
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-40 sm:pt-0.5">What we see</dt>
          <dd className="type-body mt-1 text-ink-2 sm:mt-0">{item.weSee}</dd>
        </div>
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-40 sm:pt-0.5">Why it matters</dt>
          <dd className="type-body mt-1 text-ink-2 sm:mt-0">{item.whyItMatters}</dd>
        </div>
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-40 sm:pt-0.5">Zuri recommends</dt>
          <dd className="type-body mt-1 text-ink-2 sm:mt-0">
            {item.recommends}
            {item.rationale ? (
              <span className="type-meta mt-1 block text-ink-4">
                {item.rationale}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          href="/dashboard/opportunities"
          className="type-meta group rounded-md text-accent-ink transition-colors hover:text-accent-strong"
        >
          {item.hasContent
            ? "Open the content"
            : item.hasBrief
              ? "Open the brief"
              : "Start this"}{" "}
          <span
            aria-hidden
            className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
        {item.targetKeyword ? (
          <span className="type-meta">keyword: {item.targetKeyword}</span>
        ) : null}
        {item.targetUrl ? (
          <a
            href={item.targetUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="type-meta rounded-md break-all transition-colors hover:text-ink"
          >
            {item.targetUrl}
          </a>
        ) : null}
        {item.hasBrief ? <Badge tone="muted">brief ready</Badge> : null}
        {item.hasContent ? <Badge tone="muted">content written</Badge> : null}
      </div>
    </li>
  );
}

export default async function SearchPage({
  searchParams,
}: PageProps<"/dashboard/search">) {
  const params = await searchParams;
  const prisma = getPrisma();

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      websiteUrl: true,
      searchConsoleProperty: true,
    },
  });

  const brandParam = readParam(params.brand);
  const selected =
    brands.find((brand) => brand.id === brandParam) ?? brands[0] ?? null;

  const connection = await getConnection();

  const [pages, keywords, opportunities, syncs] = selected
    ? await Promise.all([
        prisma.websitePage.findMany({
          where: { brandId: selected.id },
          orderBy: { url: "asc" },
        }),
        prisma.keyword.findMany({
          where: { brandId: selected.id },
          orderBy: [{ priorityScore: "desc" }, { keyword: "asc" }],
          include: {
            serpCompetitors: { orderBy: { position: "asc" }, take: 10 },
          },
        }),
        prisma.opportunity.findMany({
          where: {
            brandId: selected.id,
            source: "SEARCH",
            status: { not: "ARCHIVED" },
          },
          orderBy: [{ score: "desc" }, { createdAt: "desc" }],
          include: {
            seoBrief: { select: { id: true } },
            contentAssets: { select: { type: true } },
          },
        }),
        prisma.searchConsoleSync.findMany({
          where: { brandId: selected.id },
          orderBy: { startDate: "desc" },
          take: 2,
          include: { rows: { orderBy: { clicks: "desc" } } },
        }),
      ])
    : [[], [], [], []];

  const audited = findIssues(pages);
  const issueCount = audited.filter(({ issues }) =>
    Object.values(issues).some(Boolean),
  ).length;

  const lastCrawledAt = pages.reduce<Date | null>(
    (latest, page) =>
      !latest || page.lastCrawledAt > latest ? page.lastCrawledAt : latest,
    null,
  );

  const [current, previous] = syncs;
  const topQueries = (current?.rows ?? [])
    .filter((row) => row.dimension === "QUERY")
    .slice(0, 8);
  const topPages = (current?.rows ?? [])
    .filter((row) => row.dimension === "PAGE")
    .slice(0, 5);
  const keywordById = new Map(keywords.map((k) => [k.id, k.keyword]));

  const insights = buildKeywordInsights(keywords, pages);
  const recommendations = buildRecommendations(opportunities, insights);
  const summary = buildStrategySummary(insights, recommendations);

  const visible = recommendations.slice(0, VISIBLE_RECOMMENDATIONS);
  const hidden = recommendations.slice(VISIBLE_RECOMMENDATIONS);

  return (
    <Page>
      <PageHeader
        eyebrow="Search"
        title="SEO strategy"
        description={
          selected
            ? `Where ${selected.name} is weak, where the opening is, and what to do first.`
            : "Where each brand is weak, where the opening is, and what to do first."
        }
      />

      {brands.length > 1 ? (
        <div className="mt-8 flex flex-wrap items-center gap-1.5">
          {brands.map((brand) => (
            <Link
              key={brand.id}
              href={`/dashboard/search?brand=${brand.id}`}
              aria-current={selected?.id === brand.id ? "true" : undefined}
              className={cn(chip, selected?.id === brand.id ? chipActive : chipIdle)}
            >
              {brand.name}
            </Link>
          ))}
        </div>
      ) : null}

      {!selected ? (
        <Section className="mt-12">
          <EmptyState
            title="No brands yet"
            description="Create a brand with a website URL first."
          />
        </Section>
      ) : (
        <>
          {/* 1 — Search health --------------------------------------------- */}
          <Section className="mt-12">
            <div className="grid grid-cols-2 gap-8 border-y border-line py-7 sm:grid-cols-3 lg:grid-cols-5 sm:gap-10">
              <Stat
                label="Pages crawled"
                value={pages.length || <span className="text-ink-4">—</span>}
              />
              <Stat label="Technical issues" value={issueCount} />
              <Stat
                label="Keywords tracked"
                value={keywords.length || <span className="text-ink-4">—</span>}
              />
              <Stat label="Opportunities" value={recommendations.length} />
              <Stat
                label="Last analysis"
                value={
                  lastCrawledAt ? (
                    <span className="text-[1rem] tracking-[-0.02em]">
                      {dateTime.format(lastCrawledAt)}
                    </span>
                  ) : (
                    <span className="text-ink-4">—</span>
                  )
                }
              />
            </div>

            <div className="mt-6 grid gap-4">
              <CrawlButton
                brandId={selected.id}
                websiteUrl={selected.websiteUrl}
                hint={
                  issueCount
                    ? `${issueCount} page${issueCount === 1 ? "" : "s"} flagged`
                    : undefined
                }
              />
              <DiscoverKeywordsButton
                brandId={selected.id}
                hint={
                  keywords.length
                    ? `${keywords.length} keyword${keywords.length === 1 ? "" : "s"} tracked`
                    : "Seeds from the brand profile, pages and competitors."
                }
              />
              <GenerateSeoOpportunitiesButton
                brandId={selected.id}
                hint={
                  recommendations.length
                    ? `${recommendations.length} recommendation${recommendations.length === 1 ? "" : "s"} open`
                    : "Needs a crawl or some keywords first."
                }
              />
            </div>
          </Section>

          {/* 1b - Actual search performance -------------------------------- */}
          <Section title="Actual search performance" hint="Google Search Console">
            <div className="mb-6">
              <GoogleSearchConsole
                brandId={selected.id}
                connectedEmail={connection?.email ?? (connection ? "connected" : null)}
                property={selected.searchConsoleProperty}
                hint={
                  current ? `last synced ${dateTime.format(current.syncedAt)}` : undefined
                }
              />
              {connection ? (
                <div className="mt-3">
                  <GoogleAdsStatus adsScope={hasAdsScope(connection.scope)} />
                </div>
              ) : null}
            </div>

            {current ? (
              <>
                <div className="grid grid-cols-2 gap-8 border-y border-line py-7 sm:grid-cols-4 sm:gap-10">
                  <Stat
                    label="Clicks"
                    value={
                      <span>
                        {current.clicks.toLocaleString("en")}
                        <Move move={delta(current.clicks, previous?.clicks ?? null)} />
                      </span>
                    }
                  />
                  <Stat
                    label="Impressions"
                    value={
                      <span>
                        {current.impressions.toLocaleString("en")}
                        <Move
                          move={delta(current.impressions, previous?.impressions ?? null)}
                        />
                      </span>
                    }
                  />
                  <Stat
                    label="CTR"
                    value={
                      <span>
                        {percent.format(current.ctr)}
                        <Move move={delta(current.ctr, previous?.ctr ?? null)} />
                      </span>
                    }
                  />
                  <Stat
                    label="Avg position"
                    value={
                      <span>
                        {current.position.toFixed(1)}
                        <Move
                          move={delta(current.position, previous?.position ?? null, true)}
                        />
                      </span>
                    }
                  />
                </div>

                <p className="type-meta mt-4">
                  {current.startDate.toISOString().slice(0, 10)} to{" "}
                  {current.endDate.toISOString().slice(0, 10)}
                  {previous
                    ? `, compared with the 28 days before (${previous.startDate
                        .toISOString()
                        .slice(0, 10)} to ${previous.endDate.toISOString().slice(0, 10)})`
                    : ", with no earlier period to compare with yet"}
                </p>

                <div className="mt-10 grid gap-10 sm:grid-cols-2">
                  <div>
                    <p className="type-label">Top queries</p>
                    {topQueries.length ? (
                      <ul className="mt-3 space-y-3">
                        {topQueries.map((row) => (
                          <li key={row.id}>
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="type-body min-w-0 text-ink-2">
                                {row.value}
                              </span>
                              <span className="type-meta shrink-0">
                                {row.clicks} clicks
                              </span>
                            </div>
                            <p className="type-meta">
                              {row.impressions.toLocaleString("en")} impressions,{" "}
                              {percent.format(row.ctr)} CTR, position{" "}
                              {row.position.toFixed(1)}
                              {row.keywordId
                                ? ` - tracked as ${keywordById.get(row.keywordId) ?? ""}`
                                : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="type-meta mt-3">
                        No query brought an impression in this period.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="type-label">Top pages</p>
                    {topPages.length ? (
                      <ul className="mt-3 space-y-3">
                        {topPages.map((row) => (
                          <li key={row.id}>
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="type-body min-w-0 break-all text-ink-2">
                                {row.value}
                              </span>
                              <span className="type-meta shrink-0">
                                {row.clicks} clicks
                              </span>
                            </div>
                            <p className="type-meta">
                              {row.impressions.toLocaleString("en")} impressions,{" "}
                              {percent.format(row.ctr)} CTR, position{" "}
                              {row.position.toFixed(1)}
                              {row.websitePageId ? " - crawled by Zuri" : ""}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="type-meta mt-3">
                        No page received an impression in this period.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <EmptyState
                title={connection ? "Not synced yet" : "Search Console is not connected"}
                description={
                  connection
                    ? "Sync to import the last 28 days of clicks, impressions, CTR and position."
                    : "Connect a Google account to see what the site actually receives from search."
                }
              />
            )}
          </Section>

          {/* 2 - Priority keywords ----------------------------------------- */}
          <Section
            title="Priority keywords"
            hint="sorted by priority score"
          >
            {insights.length ? (
              <ul className="divide-y divide-line">
                {insights.map((insight) => (
                  <KeywordRow key={insight.id} insight={insight} />
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No keywords yet"
                description="Discover keywords above and each one gets a coverage verdict against your crawled pages."
              />
            )}
          </Section>

          {/* 3 — Recommended actions --------------------------------------- */}
          <Section
            title="Recommended actions"
            hint={
              recommendations.length
                ? `${recommendations.length} open`
                : undefined
            }
            actions={
              <Link
                href="/dashboard/opportunities"
                className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
              >
                All opportunities
              </Link>
            }
          >
            {visible.length ? (
              <>
                <ul className="divide-y divide-line">
                  {visible.map((item) => (
                    <RecommendationRow key={item.id} item={item} />
                  ))}
                </ul>

                {hidden.length ? (
                  <Disclosure
                    summary={`Show ${hidden.length} more`}
                    className="mt-6"
                  >
                    <ul className="divide-y divide-line border-t border-line pt-6">
                      {hidden.map((item) => (
                        <RecommendationRow key={item.id} item={item} />
                      ))}
                    </ul>
                  </Disclosure>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="No recommendations yet"
                description="Generate SEO opportunities above once the site is crawled and keywords are tracked."
              />
            )}
          </Section>

          {/* 4 — Strategy summary ------------------------------------------ */}
          <Section title="Strategy summary" hint="computed from the data above">
            {insights.length || recommendations.length ? (
              <div className="grid gap-10 sm:grid-cols-2">
                <div>
                  <p className="type-label">Recurring themes</p>
                  {summary.themes.length ? (
                    <ul className="mt-3 space-y-2">
                      {summary.themes.map((theme) => (
                        <li key={theme.word} className="flex items-baseline gap-3">
                          <span className="w-6 shrink-0 text-[0.875rem] font-semibold tracking-[-0.02em] text-ink-2">
                            {theme.count}
                          </span>
                          <span className="type-body text-ink-2">{theme.word}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="type-meta mt-3">
                      No word recurs across the tracked keywords yet.
                    </p>
                  )}

                  <p className="type-label mt-8">Biggest gaps</p>
                  {summary.gaps.length ? (
                    <ul className="mt-3 space-y-2">
                      {summary.gaps.map((gap) => (
                        <li key={gap.id} className="flex items-baseline gap-3">
                          <span className="w-6 shrink-0 text-[0.875rem] font-semibold tracking-[-0.02em] text-accent-ink">
                            {gap.priorityScore ?? "—"}
                          </span>
                          <span className="type-body text-ink-2">{gap.keyword}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="type-meta mt-3">
                      Every tracked keyword is at least partly covered.
                    </p>
                  )}
                </div>

                <div>
                  <p className="type-label">Balance of the work</p>
                  {summary.balance.length ? (
                    <ul className="mt-3 space-y-2">
                      {summary.balance.map((entry) => (
                        <li key={entry.action} className="flex items-baseline gap-3">
                          <span className="w-6 shrink-0 text-[0.875rem] font-semibold tracking-[-0.02em] text-ink-2">
                            {entry.count}
                          </span>
                          <span className="type-body text-ink-2">
                            {label(entry.action)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="type-meta mt-3">No action type recorded yet.</p>
                  )}

                  <p className="type-label mt-8">Start here</p>
                  {summary.startHere ? (
                    <div className="mt-3">
                      <p className="type-body text-ink-2">
                        {summary.startHere.title}
                      </p>
                      <p className="type-meta mt-1.5 max-w-sm">
                        {summary.startHere.whyItMatters} Nothing has been started
                        on it yet.
                      </p>
                    </div>
                  ) : (
                    <p className="type-meta mt-3">
                      {recommendations.length
                        ? "Every recommendation already has a brief or its content."
                        : "Generate recommendations to get a starting point."}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                title="Nothing to summarise yet"
                description="Crawl the site and discover keywords, and the picture builds itself."
              />
            )}
          </Section>
        </>
      )}
    </Page>
  );
}
