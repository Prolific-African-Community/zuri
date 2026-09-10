import { Badge } from "@/components/ui/badge";
import { EmptyState, Page, PageHeader, Section, Stat } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { buildAttention, buildChanges } from "@/lib/dashboard";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

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

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function DashboardPage({
  searchParams,
}: PageProps<"/dashboard">) {
  const params = await searchParams;
  const prisma = getPrisma();

  const [workspace, brands] = await Promise.all([
    prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const brandParam = readParam(params.brand);
  const brand = brands.find((item) => item.id === brandParam) ?? brands[0] ?? null;

  if (!brand) {
    return (
      <Page>
        <PageHeader
          eyebrow={workspace?.name ?? "Workspace"}
          title="Overview"
          description="Zuri keeps every brand's identity and market knowledge separate, structured, and ready for the engines that follow."
        />
        <Section className="mt-12">
          <EmptyState
            title="No brands yet"
            description="Create the first brand to give Zuri something to reason about."
            action={
              <Link
                href="/dashboard/brands"
                className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
              >
                Create a brand
              </Link>
            }
          />
        </Section>
      </Page>
    );
  }

  const [opportunities, contentAssets, keywords, pages] = await Promise.all([
    prisma.opportunity.findMany({
      where: { brandId: brand.id, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      include: {
        seoBrief: { select: { id: true } },
        contentAssets: { select: { id: true, type: true } },
      },
    }),
    prisma.contentAsset.findMany({
      where: { brandId: brand.id, status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.keyword.findMany({
      where: { brandId: brand.id },
      orderBy: [{ priorityScore: "desc" }, { keyword: "asc" }],
    }),
    prisma.websitePage.findMany({ where: { brandId: brand.id } }),
  ]);

  const lastCrawledAt = pages.reduce<Date | null>(
    (latest, page) =>
      !latest || page.lastCrawledAt > latest ? page.lastCrawledAt : latest,
    null,
  );

  // Recent impact: what the actions Zuri executed actually did.
  const measurements = await prisma.actionMeasurement.findMany({
    where: { action: { brandId: brand.id } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      outcome: true,
      headline: true,
      createdAt: true,
      action: { select: { title: true, type: true } },
    },
  });

  const attention = buildAttention({ opportunities, contentAssets, pages });
  const changes = buildChanges({
    opportunities,
    contentAssets,
    keywords,
    lastCrawledAt,
    pageCount: pages.length,
  });

  const scheduled = contentAssets.filter(
    (asset) => asset.scheduledAt && asset.scheduledAt > new Date(),
  );
  const untouchedOpportunities = opportunities.filter(
    (opportunity) =>
      opportunity.status === "NEW" &&
      !opportunity.seoBrief &&
      opportunity.contentAssets.length === 0,
  );
  const topKeywords = keywords.slice(0, 5);

  // The focus is read off the SEO opportunities themselves, not narrated.
  const actionCounts = new Map<string, number>();
  for (const opportunity of opportunities) {
    if (!opportunity.actionType) continue;
    actionCounts.set(
      opportunity.actionType,
      (actionCounts.get(opportunity.actionType) ?? 0) + 1,
    );
  }
  const focus = [...actionCounts.entries()].sort((a, b) => b[1] - a[1]);
  const commercialKeywords = keywords.filter(
    (keyword) =>
      keyword.intent === "commercial" || keyword.intent === "transactional",
  );

  return (
    <Page>
      <PageHeader
        eyebrow={workspace?.name ?? "Workspace"}
        title="Overview"
        description={`Where ${brand.name} stands, what needs a decision, and why.`}
      />

      {brands.length > 1 ? (
        <div className="mt-8 flex flex-wrap items-center gap-1.5">
          {brands.map((item) => (
            <Link
              key={item.id}
              href={`/dashboard?brand=${item.id}`}
              aria-current={brand.id === item.id ? "true" : undefined}
              className={cn(chip, brand.id === item.id ? chipActive : chipIdle)}
            >
              {item.name}
            </Link>
          ))}
        </div>
      ) : null}

      {/* 1 — Growth snapshot ------------------------------------------------ */}
      <Section className="mt-12">
        <div className="grid grid-cols-2 gap-8 border-y border-line py-7 sm:grid-cols-3 lg:grid-cols-5 sm:gap-10">
          <Stat
            label="Pages audited"
            value={pages.length || <span className="text-ink-4">—</span>}
          />
          <Stat
            label="Keywords"
            value={keywords.length || <span className="text-ink-4">—</span>}
          />
          <Stat label="Open opportunities" value={opportunities.length} />
          <Stat label="Content pieces" value={contentAssets.length} />
          <Stat label="Scheduled" value={scheduled.length} />
        </div>

        <p className="type-meta mt-4">
          {lastCrawledAt
            ? `Search last refreshed ${dateTime.format(lastCrawledAt)}.`
            : "The site has not been crawled yet."}{" "}
          <span className="text-ink-4">Ads · not connected.</span>
        </p>
      </Section>

      {/* 2 — Needs your attention ------------------------------------------ */}
      <Section
        title="Needs your attention"
        hint={attention.length ? `${attention.length} item${attention.length === 1 ? "" : "s"}` : undefined}
      >
        {attention.length ? (
          <ul className="divide-y divide-line">
            {attention.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 py-4 first:pt-0"
              >
                <div className="min-w-0 max-w-2xl">
                  <p className="text-[0.9375rem] font-medium tracking-[-0.01em]">
                    {item.what}
                  </p>
                  <p className="type-meta mt-1">{item.why}</p>
                </div>
                <Link
                  href={item.href}
                  className="type-meta group shrink-0 rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                >
                  {item.cta}{" "}
                  <span
                    aria-hidden
                    className="inline-block transition-transform duration-200 group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing is waiting on you"
            description="No untouched opportunity, no draft to approve, no unscheduled content."
          />
        )}
      </Section>

      {/* 3 — Current strategy ---------------------------------------------- */}
      <Section title="Current strategy" hint="from your own data">
        {topKeywords.length || focus.length ? (
          <div className="grid gap-10 sm:grid-cols-2">
            <div>
              <p className="type-label">Priority keywords</p>
              {topKeywords.length ? (
                <ul className="mt-3 space-y-2.5">
                  {topKeywords.map((keyword) => (
                    <li key={keyword.id} className="flex items-baseline gap-3">
                      <span className="w-8 shrink-0 text-[0.875rem] font-semibold tracking-[-0.02em] text-accent-ink">
                        {keyword.priorityScore ?? "—"}
                      </span>
                      <span className="min-w-0">
                        <span className="type-body text-ink-2">
                          {keyword.keyword}
                        </span>
                        <span className="type-meta block">
                          {keyword.searchVolume === null
                            ? "volume —"
                            : `${keyword.searchVolume.toLocaleString("en")} / mo`}
                          {keyword.intent ? ` · ${keyword.intent}` : ""}
                          {keyword.difficulty === null
                            ? ""
                            : ` · difficulty ${keyword.difficulty}`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="type-meta mt-3">
                  No keyword researched yet.{" "}
                  <Link
                    href="/dashboard/search"
                    className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                  >
                    Discover some
                  </Link>
                  .
                </p>
              )}
            </div>

            <div>
              <p className="type-label">Where the work is going</p>
              {focus.length ? (
                <ul className="mt-3 space-y-2.5">
                  {focus.map(([action, count]) => (
                    <li key={action} className="flex items-baseline gap-3">
                      <span className="w-8 shrink-0 text-[0.875rem] font-semibold tracking-[-0.02em] text-ink-2">
                        {count}
                      </span>
                      <span className="type-body text-ink-2">
                        {action.toLowerCase().replace(/_/g, " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="type-meta mt-3">
                  No SEO action type recorded yet.
                </p>
              )}

              <p className="type-meta mt-5 max-w-sm">
                {commercialKeywords.length
                  ? `${commercialKeywords.length} of ${keywords.length} tracked keywords carry commercial or transactional intent, which is why they rank highest in priority.`
                  : keywords.length
                    ? "None of the tracked keywords carry commercial intent yet — priority is driven by volume and difficulty alone."
                    : "Priority is computed from volume, difficulty and intent once keywords exist."}
              </p>
              {untouchedOpportunities.length ? (
                <p className="type-meta mt-2 max-w-sm">
                  {untouchedOpportunities.length} opportunit
                  {untouchedOpportunities.length === 1 ? "y is" : "ies are"} still
                  untouched.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyState
            title="No strategy signal yet"
            description="Crawl the site and discover keywords, and the picture builds itself."
          />
        )}
      </Section>

      {/* 4 — Recent impact ------------------------------------------------- */}
      {measurements.length ? (
        <Section title="Recent impact" hint="measured, not assumed">
          <ul className="space-y-3.5">
            {measurements.map((measurement) => (
              <li
                key={measurement.id}
                className="flex flex-wrap items-baseline gap-x-3"
              >
                <Badge
                  tone={measurement.outcome === "POSITIVE" ? "accent" : "muted"}
                >
                  {measurement.action.type.toLowerCase().replace(/_/g, " ")}
                </Badge>
                <Link
                  href="/dashboard/actions?status=MEASURED"
                  className="type-body min-w-0 flex-1 rounded-md text-ink-2 transition-colors hover:text-accent-ink"
                >
                  {measurement.action.title}
                </Link>
                <span className="type-meta shrink-0">{measurement.headline}</span>
                <span className="type-meta shrink-0 text-ink-4">
                  {dateTime.format(measurement.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* 5 — What changed --------------------------------------------------- */}
      <Section title="What changed" hint="most recent first">
        {changes.length ? (
          <ul className="space-y-3.5">
            {changes.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-x-3">
                <Badge tone="neutral">{event.label}</Badge>
                <span className="type-body min-w-0 flex-1 text-ink-2">
                  {event.detail}
                </span>
                <span className="type-meta shrink-0 text-ink-4">
                  {dateTime.format(event.at)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing yet"
            description="Activity from Capture, Search and Content shows up here."
          />
        )}
      </Section>
    </Page>
  );
}
