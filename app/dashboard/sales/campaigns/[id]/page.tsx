import {
  archiveCampaign,
  createProspect,
  restoreCampaign,
  updateCampaign,
} from "@/app/dashboard/sales/actions";
import { CampaignFields } from "@/components/sales/campaign-fields";
import { FindProspects, RunProgressRefresh } from "@/components/sales/find-prospects";
import { ProspectFields } from "@/components/sales/prospect-fields";
import {
  BulletList,
  ContactabilityBadge,
  Facts,
  QualificationBadge,
  ReachLine,
  SalesNav,
  Score,
} from "@/components/sales/sales-ui";
import { SALES_VIEW_INCLUDE, bySalesPriority, salesView } from "@/lib/sales-view";
import { ProspectTable } from "@/components/sales/prospect-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/ui/layout";
import { hostname } from "@/components/sales/evidence";
import { getPrisma } from "@/lib/prisma";
import { STRATEGY_LABELS, type Strategy } from "@/lib/prospect-research";
import { isRunStale } from "@/lib/prospect-research-run";
import {
  formatTicket,
  humanize,
  readCriteria,
} from "@/lib/sales";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";
/** Research continues after the response (`after()`); give it room where the platform allows. */
export const maxDuration = 300;


export default async function CampaignPage({
  params,
}: PageProps<"/dashboard/sales/campaigns/[id]">) {
  const { id } = await params;

  const campaign = await getPrisma().salesCampaign.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } },
      prospects: {
        orderBy: [{ fitScore: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
        include: SALES_VIEW_INCLUDE,
      },
    },
  });
  if (!campaign) notFound();
  const prospects = campaign.prospects
    .map((prospect) => ({ ...prospect, view: salesView(prospect) }))
    .sort(bySalesPriority);

  const lastRun = await getPrisma().salesResearchRun.findFirst({
    where: { campaignId: campaign.id },
    orderBy: { startedAt: "desc" },
    include: {
      prospects: {
        orderBy: [{ fitScore: { sort: "desc", nulls: "last" } }],
        include: SALES_VIEW_INCLUDE,
      },
    },
  });
  const runProspects = (lastRun?.prospects ?? [])
    .map((prospect) => ({ ...prospect, view: salesView(prospect) }))
    .sort(bySalesPriority);
  // A run that never finished is shown as failed rather than spinning forever.
  const runStale = lastRun ? isRunStale(lastRun) : false;
  const running = lastRun?.status === "RUNNING" && !runStale;
  const runSummary = (lastRun?.summary ?? {}) as {
    candidates?: {
      domain: string;
      name: string | null;
      outcome: string;
      strategies?: string[];
      fitScore: number | null;
      discoveryScore?: number | null;
      reason: string;
    }[];
    funnel?: { raw: number; unique: number; duplicates: number; shortlisted: number; researched: number; saved: number };
    byStrategy?: Record<string, { queries: number; raw: number; unique: number; shortlisted: number; researched: number; saved: number }>;
    coverage?: { areas: string[]; coverageQueries: number; plannerQueries: number; organicTasks: number; mapsTasks: number };
    queries?: { query: string; strategy: string; source?: string; channels?: string[]; mapsResults?: number; results: number; uniqueDomains: number; filtered: number; shortlisted: number; saved: number; error: string | null }[];
    directories?: { url: string; readable: boolean; listed: number; added: number }[];
    sourcesNote?: string;
    rejectedClaims?: number;
  };
  const outcomeCounts = Object.entries(
    (runSummary.candidates ?? []).reduce<Record<string, number>>((counts, line) => {
      counts[line.outcome] = (counts[line.outcome] ?? 0) + 1;
      return counts;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);

  const archived = campaign.status === "ARCHIVED";
  const criteria = readCriteria(campaign.scoringCriteria);

  return (
    <Page>
      <Link
        href="/dashboard/sales/campaigns"
        className="type-meta rounded-md transition-colors hover:text-ink"
      >
        ← Campaigns
      </Link>
      <div className="mt-6">
        <PageHeader
          eyebrow={`Sales · ${campaign.brand.name}`}
          title={campaign.name}
          description={campaign.description ?? campaign.offer}
          actions={
            <FindProspects
              campaignId={campaign.id}
              geography={campaign.geography}
              industries={campaign.industries}
              running={running}
              disabledReason={archived ? "Restore the campaign to research prospects." : null}
            />
          }
        />
      </div>
      <RunProgressRefresh running={running} />

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <SalesNav active="campaigns" />
        {campaign.status === "ACTIVE" ? null : (
          <Badge tone="muted" className="mb-8">
            {humanize(campaign.status)}
          </Badge>
        )}
      </div>

      {lastRun ? (
        <Section
          title="Last research"
          hint={new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }).format(lastRun.startedAt)}
        >
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone={running ? "accent" : lastRun.status === "COMPLETE" ? "neutral" : "muted"}>
              {runStale ? "Failed" : humanize(lastRun.status)}
            </Badge>
            <span className="type-body text-ink-2">
              {runStale ? "The run stopped before finishing." : lastRun.stage}
            </span>
          </div>
          {lastRun.error ? <p className="type-meta mt-2 text-ink-2">{lastRun.error}</p> : null}
          {lastRun.status === "DEGRADED" ? (
            <p className="type-body mt-3 max-w-3xl rounded-lg border border-line-strong bg-subtle px-4 py-3 text-ink">
              Some discovery searches failed. Saved prospects remain individually validated, but campaign
              coverage was incomplete.
            </p>
          ) : null}
          {lastRun.plannedSearches ? (
            <p className="type-meta mt-2">
              {lastRun.successfulSearches} of {lastRun.plannedSearches} searches succeeded
              {lastRun.failedSearches ? ` · ${lastRun.failedSearches} failed` : ""}
              {lastRun.coverageRatio !== null ? ` · coverage ${Math.round(lastRun.coverageRatio * 100)}%` : ""}
            </p>
          ) : null}

          <dl className="mt-5 grid grid-cols-3 gap-4 sm:grid-cols-7">
            {(runSummary.funnel
              ? [
                  ["Requested", lastRun.requestedCount],
                  ["Raw results", runSummary.funnel.raw],
                  ["Unique companies", runSummary.funnel.unique],
                  ["Shortlisted", runSummary.funnel.shortlisted],
                  ["Researched", runSummary.funnel.researched],
                  ["Saved", runSummary.funnel.saved],
                  ["Duplicates", runSummary.funnel.duplicates],
                ]
              : [
                  ["Requested", lastRun.requestedCount],
                  ["Discovered", lastRun.discoveredCount],
                  ["Researched", lastRun.researchedCount],
                  ["Qualified saved", lastRun.savedCount],
                  ["Duplicates skipped", lastRun.duplicateCount],
                ]
            ).map(([label, value]) => (
              <div key={label}>
                <dt className="type-label">{label}</dt>
                <dd className="mt-1 text-[1.125rem] font-semibold tabular-nums tracking-[-0.02em]">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {runProspects.length ? (
            <ul className="mt-6 divide-y divide-line">
              {runProspects.map((prospect) => {
                const reason = (prospect.fitExplanation as { strongestReason?: string } | null)
                  ?.strongestReason;
                return (
                  <li
                    key={prospect.id}
                    className="flex flex-col gap-2 py-4 first:pt-0 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <Link
                          href={`/dashboard/sales/prospects/${prospect.id}`}
                          className="text-[0.9375rem] font-medium tracking-[-0.01em] transition-colors hover:text-accent-ink"
                        >
                          {prospect.name}
                        </Link>
                        <span className="type-meta">
                          {[prospect.country, humanize(prospect.fitConfidence) + " confidence"]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                        <QualificationBadge
                          qualification={prospect.view.qualification}
                          flags={prospect.view.flags}
                        />
                        <ContactabilityBadge contactability={prospect.view.contactability} />
                      </div>
                      {reason ? (
                        <p className="type-body mt-1 max-w-2xl text-ink-2">{reason}</p>
                      ) : null}
                      <p className="type-meta mt-1">
                        <ReachLine contactability={prospect.view.contactability} />
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <span className="text-[1.125rem] font-semibold">
                        <Score value={prospect.fitScore} />
                      </span>
                      <Link
                        href={`/dashboard/sales/prospects/${prospect.id}`}
                        className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                      >
                        Open prospect
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : !running && lastRun.status !== "FAILED" && !runStale ? (
            <p className="type-meta mt-6 text-ink-4">
              No prospect from this run cleared the quality threshold.
            </p>
          ) : null}

          {runSummary.byStrategy ? (
            <div className="-mx-1 mt-6 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left">
                <thead>
                  <tr className="type-label border-b border-line">
                    <th className="px-1 pb-2 font-medium">By strategy</th>
                    <th className="px-1 pb-2 text-right font-medium">Queries</th>
                    <th className="px-1 pb-2 text-right font-medium">Raw</th>
                    <th className="px-1 pb-2 text-right font-medium">Unique</th>
                    <th className="px-1 pb-2 text-right font-medium">Shortlisted</th>
                    <th className="px-1 pb-2 text-right font-medium">Researched</th>
                    <th className="px-1 pb-2 text-right font-medium">Saved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {Object.entries(runSummary.byStrategy).map(([strategy, stats]) => (
                    <tr key={strategy} className="type-body tabular-nums text-ink-2">
                      <td className="px-1 py-1.5">{STRATEGY_LABELS[strategy as Strategy] ?? humanize(strategy)}</td>
                      <td className="px-1 py-1.5 text-right">{stats.queries}</td>
                      <td className="px-1 py-1.5 text-right">{stats.raw}</td>
                      <td className="px-1 py-1.5 text-right">{stats.unique}</td>
                      <td className="px-1 py-1.5 text-right">{stats.shortlisted}</td>
                      <td className="px-1 py-1.5 text-right">{stats.researched}</td>
                      <td className="px-1 py-1.5 text-right text-ink">{stats.saved}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {outcomeCounts.length ? (
            <p className="type-meta mt-4">
              {outcomeCounts.map(([outcome, count]) => `${humanize(outcome)} ${count}`).join(" · ")}
            </p>
          ) : null}

          {runSummary.coverage ? (
            <p className="type-meta mt-4 max-w-3xl">
              Coverage: {runSummary.coverage.areas.length} areas always searched ({runSummary.coverage.areas.join(", ")}) ·{" "}
              {runSummary.coverage.coverageQueries} coverage + {runSummary.coverage.plannerQueries} planner queries ·{" "}
              {runSummary.coverage.organicTasks} organic, {runSummary.coverage.mapsTasks} Maps searches
            </p>
          ) : null}

          {runSummary.queries?.length ? (
            <Disclosure summary={`Search diagnostics · ${runSummary.queries.length} queries`} className="mt-6">
              <ul className="mt-3 max-w-3xl divide-y divide-line">
                {runSummary.queries.map((query) => (
                  <li key={`${query.strategy}-${query.query}-${query.channels?.join()}`} className="flex gap-3 py-2">
                    <span className="type-meta w-28 shrink-0">
                      {query.source === "COVERAGE" ? "Coverage" : STRATEGY_LABELS[query.strategy as Strategy] ?? humanize(query.strategy)}
                      {query.channels ? ` · ${query.channels.map((channel) => (channel === "MAPS" ? "Maps" : "Web")).join("+")}` : ""}
                    </span>
                    <span className="min-w-0">
                      <span className="type-body text-ink-2">{query.query}</span>
                      <span className="type-meta block">
                        {query.error
                          ? `Failed: ${query.error}`
                          : `${query.results + (query.mapsResults ?? 0)} results · ${query.uniqueDomains} new companies · ${query.filtered} filtered · ${query.shortlisted} shortlisted · ${query.saved} saved`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {runSummary.directories?.length ? (
                <p className="type-meta mt-3 max-w-3xl">
                  Listing pages read:{" "}
                  {runSummary.directories
                    .map((page) => `${hostname(page.url)} (${page.readable ? `${page.listed} listed, ${page.added} new` : "not readable"})`)
                    .join(" · ")}
                </p>
              ) : null}
            </Disclosure>
          ) : null}

          {runSummary.candidates?.length ? (
            <Disclosure
              summary={`Every candidate considered · ${runSummary.candidates.length}`}
              className="mt-6"
            >
              <ul className="mt-3 max-w-3xl divide-y divide-line">
                {runSummary.candidates.map((line) => (
                  <li key={`${line.domain}-${line.outcome}`} className="flex gap-3 py-2">
                    <span className="type-meta w-32 shrink-0">{humanize(line.outcome)}</span>
                    <span className="min-w-0">
                      <span className="type-body text-ink-2">{line.name || line.domain}</span>
                      <span className="type-meta block break-words">
                        {line.domain}
                        {line.strategies?.length
                          ? ` · ${line.strategies.map((strategy) => STRATEGY_LABELS[strategy as Strategy] ?? strategy).join(", ")}`
                          : ""}
                        {line.fitScore !== null ? ` · fit ${line.fitScore}` : ""} · {line.reason}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {runSummary.sourcesNote ? (
                <p className="type-meta mt-3 max-w-3xl">{runSummary.sourcesNote}</p>
              ) : null}
            </Disclosure>
          ) : null}
        </Section>
      ) : null}

      <Section title="Overview">
        <Facts
          rows={[
            { label: "Brand", value: campaign.brand.name },
            { label: "Offer", value: campaign.offer },
            { label: "Geography", value: campaign.geography.join(" · ") },
            { label: "Industries", value: campaign.industries.join(" · ") },
            { label: "Target size", value: campaign.targetCompanySize },
            {
              label: "Target ticket",
              value: formatTicket(
                campaign.targetTicketMin,
                campaign.targetTicketMax,
                campaign.currency,
              ),
            },
          ]}
        />
      </Section>

      <Section title="Ideal customer">
        {campaign.idealCustomerProfile ? (
          <p className="type-body mb-6 max-w-2xl text-ink-2">
            {campaign.idealCustomerProfile}
          </p>
        ) : null}
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <p className="type-label mb-2">Preferred profile</p>
            <BulletList items={campaign.preferredProfile} empty="Not defined yet." />
          </div>
          <div>
            <p className="type-label mb-2">Exclusions</p>
            <BulletList items={campaign.exclusions} empty="Not defined yet." />
          </div>
          <div>
            <p className="type-label mb-2">Pain points</p>
            <BulletList items={campaign.painPoints} empty="Not defined yet." />
          </div>
          <div className="grid gap-5">
            <div>
              <p className="type-label">Value proposition</p>
              <p className="type-body mt-1 text-ink-2">
                {campaign.valueProposition || <span className="text-ink-4">—</span>}
              </p>
            </div>
            <div>
              <p className="type-label">Primary angle</p>
              <p className="type-body mt-1 text-ink-2">
                {campaign.primaryAngle || <span className="text-ink-4">—</span>}
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Scoring criteria">
        {criteria.length ? (
          <ul className="divide-y divide-line">
            {criteria.map((criterion) => (
              <li
                key={criterion.label}
                className="type-body flex items-baseline justify-between gap-4 py-2 text-ink-2"
              >
                <span>{criterion.label}</span>
                {criterion.weight === null ? null : (
                  <span className="type-meta tabular-nums">weight {criterion.weight}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="type-meta text-ink-4">
            No scoring criteria yet. Add them in Edit campaign.
          </p>
        )}
      </Section>

      <Section title="Prospects" hint={`${prospects.length} · strongest and most reachable first`}>
        {prospects.length ? (
          <ProspectTable rows={prospects} showCampaign={false} />
        ) : (
          <EmptyState
            title="No prospects yet"
            description="Add one manually below. Automated research comes in the next run."
          />
        )}

        {archived ? null : (
          <div className="mt-6">
            <Disclosure summary="Add a prospect manually">
              <Panel className="mt-4">
                <form action={createProspect} className="grid gap-5">
                  <input type="hidden" name="campaignId" value={campaign.id} />
                  <ProspectFields />
                  <div>
                    <Button type="submit">Add prospect</Button>
                  </div>
                </form>
              </Panel>
            </Disclosure>
          </div>
        )}
      </Section>

      <Section title="Campaign">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
          <Disclosure summary="Edit campaign" className="w-full">
            <Panel className="mt-4">
              <form action={updateCampaign.bind(null, campaign.id)} className="grid gap-5">
                <p className="type-meta">
                  Brand: {campaign.brand.name} — a campaign never changes brand.
                </p>
                <CampaignFields campaign={campaign} />
                <div>
                  <Button type="submit">Save campaign</Button>
                </div>
              </form>
            </Panel>
          </Disclosure>
          <form
            action={
              archived
                ? restoreCampaign.bind(null, campaign.id)
                : archiveCampaign.bind(null, campaign.id)
            }
          >
            <Button type="submit" variant="secondary" size="sm">
              {archived ? "Restore campaign" : "Archive campaign"}
            </Button>
          </form>
        </div>
      </Section>
    </Page>
  );
}
