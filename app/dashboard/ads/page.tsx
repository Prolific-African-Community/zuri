import { ProposeAdsActions } from "@/components/ads/ads-execution";
import { AdsRecommendations } from "@/components/ads/ads-recommendations";
import { SyncAds } from "@/components/ads/sync-ads";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Page, PageHeader, Section, Stat } from "@/components/ui/layout";
import { buildAdsRecommendations } from "@/lib/ads-recommendations";
import {
  buildAdsAttention,
  conversionRate,
  cpc,
  ctr,
  euros,
  isInactive,
  type AdsRowLike,
} from "@/lib/ads-insights";
import { cn } from "@/lib/cn";
import { getConnection, hasAdsScope } from "@/lib/google";
import { brandCustomerId } from "@/lib/google-ads";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";

export const metadata = { title: "Ads" };
export const dynamic = "force-dynamic";

const dateTime = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const money = new Intl.NumberFormat("en", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 2,
});

const percent = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 1,
});

const chip =
  "rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200";
const chipActive = "bg-accent-soft font-medium text-accent-ink";
const chipIdle = "text-ink-3 hover:bg-sunken hover:text-ink";

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function label(value: string | null) {
  return (value ?? "").toLowerCase().replace(/_/g, " ");
}

/** One line of metrics, written the same way everywhere. */
function MetricLine({ row }: { row: AdsRowLike }) {
  return (
    <p className="type-meta mt-1">
      {money.format(euros(row.costMicros))} ·{" "}
      {row.impressions.toLocaleString("en")} impressions · {row.clicks} clicks
      {row.impressions ? ` · ${percent.format(ctr(row))} CTR` : ""}
      {row.clicks ? ` · ${money.format(cpc(row))} CPC` : ""} ·{" "}
      {row.conversions} conversions
      {row.clicks && row.conversions
        ? ` (${percent.format(conversionRate(row))})`
        : ""}
    </p>
  );
}

export default async function AdsPage({
  searchParams,
}: PageProps<"/dashboard/ads">) {
  const params = await searchParams;
  const prisma = getPrisma();

  const [brands, connection] = await Promise.all([
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, googleAdsCustomerId: true },
    }),
    getConnection(),
  ]);

  const brandParam = readParam(params.brand);
  const brand = brands.find((item) => item.id === brandParam) ?? brands[0] ?? null;

  const customerId = brand ? brandCustomerId(brand) || null : null;
  const connected = Boolean(connection && hasAdsScope(connection.scope));

  const [sync, zuriKeywords] = brand
    ? await Promise.all([
        prisma.adsSync.findFirst({
          where: { brandId: brand.id },
          orderBy: { startDate: "desc" },
          include: {
            rows: { orderBy: { costMicros: "desc" } },
            brand: { select: { name: true } },
          },
        }),
        prisma.keyword.findMany({
          where: { brandId: brand.id },
          orderBy: { priorityScore: "desc" },
          select: { keyword: true, priorityScore: true, intent: true },
        }),
      ])
    : [null, []];

  const rows = (sync?.rows ?? []) as unknown as AdsRowLike[];
  const campaigns = rows.filter((row) => row.level === "CAMPAIGN");
  const keywords = rows.filter((row) => row.level === "KEYWORD");
  // Only terms that actually drew something are worth a reader's time.
  const searchTerms = rows
    .filter((row) => row.level === "SEARCH_TERM")
    .filter((row) => row.impressions > 0 || row.clicks > 0 || Number(row.costMicros) > 0)
    .slice(0, 10);

  const attention = brand
    ? buildAdsAttention({ campaigns, keywords, searchTerms: rows.filter((row) => row.level === "SEARCH_TERM"), zuriKeywords })
    : [];

  // Strictly this brand's snapshot and this brand's researched keywords.
  const recommendations = brand
    ? buildAdsRecommendations({
        campaigns,
        adGroups: rows.filter((row) => row.level === "AD_GROUP"),
        keywords,
        searchTerms: rows.filter((row) => row.level === "SEARCH_TERM"),
        zuriKeywords,
      })
    : [];

  const matchedKeywords = keywords.filter((row) => row.keywordId).length;

  const openAdsActions = brand
    ? await prisma.proposedAction.count({
        where: {
          brandId: brand.id,
          type: "GOOGLE_ADS",
          status: { in: ["PROPOSED", "APPROVED"] },
        },
      })
    : 0;

  return (
    <Page>
      <PageHeader
        eyebrow="Paid"
        title="Ads"
        description="What Google Ads is actually doing, read-only. Zuri never changes a campaign."
      />

      {brands.length > 1 ? (
        <div className="mt-8 flex flex-wrap items-center gap-1.5">
          {brands.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard/ads?brand=${item.id}`}
              aria-current={brand?.id === item.id ? "true" : undefined}
              className={cn(chip, brand?.id === item.id ? chipActive : chipIdle)}
            >
              {item.name}
            </Link>
          ))}
        </div>
      ) : null}

      {!brand ? (
        <Section className="mt-12">
          <EmptyState title="No brands yet" description="Create a brand first." />
        </Section>
      ) : (
        <>
          <Section className="mt-12">
            <div className="border-y border-line py-6">
              <SyncAds
                brandId={brand.id}
                customerId={customerId}
                connected={connected}
                hint={sync ? `last synced ${dateTime.format(sync.syncedAt)}` : undefined}
              />
              {sync ? (
                <div className="mt-3">
                  <ProposeAdsActions
                    brandId={brand.id}
                    hint={
                      openAdsActions
                        ? `${openAdsActions} action${openAdsActions === 1 ? "" : "s"} already in the Action Center`
                        : "Only proposes what the data justifies."
                    }
                  />
                </div>
              ) : null}
            </div>
          </Section>

          {sync ? (
            <>
              {openAdsActions ? (
                <Section className="mt-8">
                  <p className="type-meta">
                    <Link
                      href="/dashboard/actions?type=GOOGLE_ADS"
                      className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                    >
                      Review {openAdsActions} proposed Ads action
                      {openAdsActions === 1 ? "" : "s"} in the Action Center
                    </Link>
                  </p>
                </Section>
              ) : null}

              {/* Ads snapshot ------------------------------------------------ */}
              <Section className="mt-10">
                <div className="grid grid-cols-2 gap-8 border-b border-line pb-7 sm:grid-cols-3 lg:grid-cols-6 sm:gap-10">
                  <Stat label="Spend" value={money.format(euros(sync.costMicros))} />
                  <Stat
                    label="Impressions"
                    value={sync.impressions.toLocaleString("en")}
                  />
                  <Stat label="Clicks" value={sync.clicks.toLocaleString("en")} />
                  <Stat label="CTR" value={percent.format(ctr(sync))} />
                  <Stat label="CPC" value={money.format(cpc(sync))} />
                  <Stat label="Conversions" value={sync.conversions} />
                </div>
                <p className="type-meta mt-4">
                  Account {sync.customerId} ({brand.name}) · {sync.startDate.toISOString().slice(0, 10)}{" "}
                  to {sync.endDate.toISOString().slice(0, 10)}
                  {matchedKeywords
                    ? ` · ${matchedKeywords} keyword${matchedKeywords === 1 ? "" : "s"} also tracked by Zuri`
                    : ""}
                </p>
              </Section>

              {/* What needs attention --------------------------------------- */}
              <Section
                title="What needs attention"
                hint={attention.length ? `${attention.length} items` : undefined}
              >
                {attention.length ? (
                  <ul className="divide-y divide-line">
                    {attention.map((item) => (
                      <li key={item.id} className="py-5 first:pt-0">
                        <p className="text-[0.9375rem] font-medium tracking-[-0.01em]">
                          {item.what}
                        </p>
                        <dl className="mt-3 grid max-w-3xl gap-2.5">
                          <div className="sm:flex sm:gap-6">
                            <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">Why</dt>
                            <dd className="type-body mt-1 text-ink-2 sm:mt-0">
                              {item.why}
                            </dd>
                          </div>
                          <div className="sm:flex sm:gap-6">
                            <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">
                              Evidence
                            </dt>
                            <dd className="type-meta mt-1 sm:mt-0">{item.evidence}</dd>
                          </div>
                          <div className="sm:flex sm:gap-6">
                            <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">
                              Next step
                            </dt>
                            <dd className="type-body mt-1 text-ink-2 sm:mt-0">
                              {item.next}
                            </dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="Nothing stands out"
                    description="No inactive campaign, no spend without conversion, no uncovered query."
                  />
                )}
              </Section>

              <AdsRecommendations
                brandId={brand.id}
                brandName={brand.name}
                customerId={customerId ?? "not configured"}
                recommendations={recommendations}
                hasData={Boolean(sync)}
              />

              {/* Campaigns --------------------------------------------------- */}
              <Section
                title="Campaigns"
                hint={`${campaigns.length} in the account`}
              >
                {campaigns.length ? (
                  <ul className="divide-y divide-line">
                    {campaigns.map((row) => (
                      <li key={row.id} className="py-4 first:pt-0">
                        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
                          <p
                            className={cn(
                              "min-w-0 text-[0.9375rem] font-medium tracking-[-0.01em]",
                              isInactive(row.status) && "text-ink-4",
                            )}
                          >
                            {row.campaignName}
                          </p>
                          <Badge tone={isInactive(row.status) ? "muted" : "accent"}>
                            {label(row.status)}
                          </Badge>
                        </div>
                        <MetricLine row={row} />
                        <p className="type-meta mt-1 text-ink-4">
                          {isInactive(row.status)
                            ? "Not delivering — nothing was spent or shown."
                            : row.impressions === 0
                              ? "Enabled but never shown over the period."
                              : row.conversions > 0
                                ? "Delivering and converting."
                                : "Delivering, no conversion yet."}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="No campaign in this account"
                    description="Nothing to report until a campaign exists."
                  />
                )}
              </Section>

              {/* Keywords ---------------------------------------------------- */}
              <Section title="Keywords" hint={`${keywords.length} tracked in Ads`}>
                {keywords.length ? (
                  <ul className="divide-y divide-line">
                    {keywords.slice(0, 15).map((row) => (
                      <li key={row.id} className="py-4 first:pt-0">
                        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
                          <p className="min-w-0 text-[0.875rem] font-medium tracking-[-0.01em]">
                            {row.text}
                          </p>
                          <div className="flex shrink-0 items-center gap-2">
                            {row.matchType ? (
                              <Badge tone="neutral">{label(row.matchType)}</Badge>
                            ) : null}
                            <Badge tone={isInactive(row.status) ? "muted" : "accent"}>
                              {label(row.status)}
                            </Badge>
                          </div>
                        </div>
                        <MetricLine row={row} />
                        {row.keywordId ? (
                          <p className="type-meta mt-1 text-accent-ink">
                            Also tracked by Zuri for SEO
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="No keyword in this account"
                    description="Keywords appear once a campaign has ad groups with terms."
                  />
                )}
              </Section>

              {/* Search terms ------------------------------------------------ */}
              <Section
                title="Search terms"
                hint="only terms that drew traffic or spend"
              >
                {searchTerms.length ? (
                  <ul className="divide-y divide-line">
                    {searchTerms.map((row) => (
                      <li key={row.id} className="py-4 first:pt-0">
                        <p className="text-[0.875rem] font-medium tracking-[-0.01em]">
                          {row.text}
                        </p>
                        <MetricLine row={row} />
                        {row.keywordId ? (
                          <p className="type-meta mt-1 text-accent-ink">
                            Matches a Zuri keyword
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="No search term with traffic"
                    description="Real queries appear here once the ads start serving."
                  />
                )}
              </Section>
            </>
          ) : (
            <Section className="mt-10">
              <EmptyState
                title={connected ? "Not synced yet" : "Google Ads is not connected"}
                description={
                  connected
                    ? "Sync to import the last 30 days of campaigns, keywords and search terms."
                    : "Connect a Google account with the Ads scope to read the account."
                }
              />
            </Section>
          )}
        </>
      )}
    </Page>
  );
}
