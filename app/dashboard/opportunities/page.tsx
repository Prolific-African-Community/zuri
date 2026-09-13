import { ProposeAction } from "@/components/actions/propose-action";
import { MetaIdeas } from "@/components/content/meta-ideas";
import { GenerateArticle } from "@/components/opportunities/generate-article";
import { DeleteOpportunity } from "@/components/opportunities/delete-opportunity";
import { GenerateOpportunities } from "@/components/opportunities/generate-button";
import { LinkedInDrafts } from "@/components/opportunities/linkedin-drafts";
import { SeoBrief } from "@/components/opportunities/seo-brief";
import { Button, ButtonLink } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Select, TextArea } from "@/components/ui/field";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { OpportunitySource, OpportunityStatus } from "@/lib/generated/prisma/enums";
import { ArchiveCross } from "@/components/ui/archive-cross";
import { TabNav, type TabItem } from "@/components/ui/tab-nav";
import { getPrisma } from "@/lib/prisma";
import { summarizeOutputs } from "@/lib/opportunity-outputs";
import { publishingConfig } from "@/lib/publishing";
import Link from "next/link";
import {
  archiveOpportunity,
  createOpportunity,
  restoreOpportunity,
  updateOpportunity,
} from "./actions";

export const metadata = { title: "Opportunities" };
export const dynamic = "force-dynamic";

const statusFilters = [
  { label: "All", value: "all" },
  { label: "To review", value: OpportunityStatus.NEW },
  { label: "In progress", value: OpportunityStatus.ACTIVE },
  { label: "Archived", value: OpportunityStatus.ARCHIVED },
] as const;

const sourceLabels: Record<OpportunitySource, string> = {
  MANUAL: "Added by user",
  OBSERVATION: "From an observation",
  SIGNAL: "Market signal",
  COMPETITOR: "Competitor insight",
  SEARCH: "Search opportunity",
};

const statusLabels: Record<OpportunityStatus, string> = {
  NEW: "To review",
  ACTIVE: "In progress",
  ARCHIVED: "Archived",
};

const chip =
  "rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200";
const chipActive = "bg-accent-soft font-medium text-accent-ink";
const chipIdle = "text-ink-3 hover:bg-sunken hover:text-ink";

const TABS = ["all", "search", "market"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  all: "All",
  search: "Search / SEO",
  market: "Market",
};

/** What to do next when a tab is empty, rather than a dead end. */
const TAB_NEXT: Record<Tab, string> = {
  all: "Generate opportunities from this brand's own knowledge, or add one by hand.",
  search: "Crawl the site and discover keywords, then generate SEO opportunities from Search.",
  market: "Capture an observation or a market signal, then generate opportunities.",
};

const TAB_EMPTY: Record<Tab, string> = {
  all: "No opportunities",
  search: "No SEO opportunities",
  market: "No market opportunities",
};

type Sortable = { source: string };

/**
 * The tabs partition the list on the opportunity's own source, so it belongs
 * to exactly one of them and nothing is counted twice. Archive is not a tab:
 * `Opportunity.status === ARCHIVED` is the single predicate, applied by the
 * status filter in the query, so counts and rows can never disagree.
 */
function inTab(opportunity: Sortable, tab: Tab) {
  if (tab === "all") return true;

  // The source is the only stable thing to group on: a draft that happens to
  // exist says nothing about what the opportunity is.
  return opportunity.source === "SEARCH" ? tab === "search" : tab === "market";
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function Fields({
  brands,
  opportunity,
  defaultBrandId,
}: {
  brands: { id: string; name: string }[];
  opportunity?: {
    brandId: string;
    title: string;
    description: string;
    source: OpportunitySource;
    status: OpportunityStatus;
    score: number | null;
  };
  defaultBrandId?: string;
}) {
  return (
    <>
      <Field
        label="Title"
        name="title"
        required
        defaultValue={opportunity?.title}
        placeholder="Finance teams do not trust their own forecasts."
        autoComplete="off"
      />
      <TextArea
        label="Description"
        name="description"
        rows={3}
        defaultValue={opportunity?.description ?? ""}
        placeholder="What the angle is, and why it is worth taking."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <Select
          label="Brand"
          name="brandId"
          required
          defaultValue={opportunity?.brandId ?? defaultBrandId}
        >
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </Select>
        <Select
          label="Source"
          name="source"
          defaultValue={opportunity?.source ?? OpportunitySource.MANUAL}
        >
          {Object.values(OpportunitySource).map((value) => (
            <option key={value} value={value}>
              {sourceLabels[value]}
            </option>
          ))}
        </Select>
        <Select
          label="Status"
          name="status"
          defaultValue={opportunity?.status ?? OpportunityStatus.NEW}
        >
          {Object.values(OpportunityStatus).map((value) => (
            <option key={value} value={value}>
              {statusLabels[value]}
            </option>
          ))}
        </Select>
        <Field
          label="Score"
          name="score"
          type="number"
          min={0}
          max={100}
          step={1}
          defaultValue={opportunity?.score ?? ""}
          placeholder="0–100"
          hint="optional"
          autoComplete="off"
        />
      </div>
    </>
  );
}

export default async function OpportunitiesPage({
  searchParams,
}: PageProps<"/dashboard/opportunities">) {
  const params = await searchParams;
  const prisma = getPrisma();

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const brandParam = readParam(params.brand) ?? "all";
  const brandFilter = brands.some((brand) => brand.id === brandParam)
    ? brandParam
    : "all";

  const statusParam = readParam(params.status) ?? "all";
  const statusFilter = statusFilters.some((item) => item.value === statusParam)
    ? statusParam
    : "all";

  const opportunities = brands.length
    ? await prisma.opportunity.findMany({
        where: {
          ...(brandFilter === "all" ? {} : { brandId: brandFilter }),
          // "All" means active: archived opportunities are reached only
          // through the Archived status filter, never through a tab.
          ...(statusFilter === "all"
            ? { status: { not: OpportunityStatus.ARCHIVED } }
            : { status: statusFilter as OpportunityStatus }),
        },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        include: {
          brand: {
            select: {
              name: true,
              githubOwner: true,
              githubRepo: true,
              githubBranch: true,
              contentFormat: true,
              contentDirectory: true,
              publicRoute: true,
              assetsDirectory: true,
              defaultBranch: true,
              publishingMode: true,
            },
          },
          _count: { select: { contentAssets: true } },
          seoBrief: true,
          proposedActions: {
            where: { status: { in: ["PROPOSED", "APPROVED"] } },
            select: { id: true },
          },
          contentAssets: {
            orderBy: { createdAt: "desc" },
            include: { visualAsset: true, articleDraft: { select: { id: true } } },
          },
        },
      })
    : [];

  const tabParam = readParam(params.tab) ?? "all";
  const tab = ((TABS as readonly string[]).includes(tabParam) ? tabParam : "all") as Tab;

  const counts = Object.fromEntries(
    TABS.map((value) => [
      value,
      opportunities.filter((opportunity) => inTab(opportunity, value)).length,
    ]),
  ) as Record<Tab, number>;

  const visible = opportunities.filter((opportunity) => inTab(opportunity, tab));

  function filterHref(next: { brand?: string; status?: string; tab?: string }) {
    const query = new URLSearchParams();
    const brand = next.brand ?? brandFilter;
    const status = next.status ?? statusFilter;
    const nextTab = next.tab ?? tab;
    if (brand !== "all") query.set("brand", brand);
    if (status !== "all") query.set("status", status);
    if (nextTab !== "all") query.set("tab", nextTab);
    const search = query.toString();
    return search ? `/dashboard/opportunities?${search}` : "/dashboard/opportunities";
  }

  const defaultBrandId = brandFilter === "all" ? brands[0]?.id : brandFilter;

  return (
    <Page>
      <PageHeader
        eyebrow="Signal"
        title="Opportunities"
        description="Angles worth acting on, scored and tracked per brand."
      />

      <Section className="mt-12">
        {brands.length ? (
          <>
            <div className="border-y border-line py-6">
              <GenerateOpportunities
                brands={brands}
                defaultBrandId={defaultBrandId}
              />
            </div>

            <Disclosure summary="Add an opportunity" tone="accent" className="mt-8">
              <Panel className="max-w-2xl">
                <form action={createOpportunity} className="grid gap-5">
                  <Fields brands={brands} defaultBrandId={defaultBrandId} />
                  <div className="border-t border-line pt-5">
                    <Button type="submit">Create opportunity</Button>
                  </div>
                </form>
              </Panel>
            </Disclosure>
          </>
        ) : (
          <EmptyState
            title="No brands yet"
            description="Opportunities attach to a brand. Create one first."
          />
        )}
      </Section>

      <Section
        title="All opportunities"
        hint={
          visible.length === 1 ? "1 opportunity" : `${visible.length} opportunities`
        }
      >
        <TabNav
          active={tab}
          tabs={TABS.map<TabItem>((value) => ({
            label: TAB_LABELS[value],
            value,
            count: counts[value],
            href: filterHref({ tab: value }),
          }))}
        />

        <div className="mt-6 mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {statusFilters.map((item) => (
              <Link
                key={item.value}
                href={filterHref({ status: item.value })}
                aria-current={statusFilter === item.value ? "true" : undefined}
                className={cn(
                  chip,
                  statusFilter === item.value ? chipActive : chipIdle,
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {brands.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <Link
                href={filterHref({ brand: "all" })}
                aria-current={brandFilter === "all" ? "true" : undefined}
                className={cn(chip, brandFilter === "all" ? chipActive : chipIdle)}
              >
                All brands
              </Link>
              {brands.map((brand) => (
                <Link
                  key={brand.id}
                  href={filterHref({ brand: brand.id })}
                  aria-current={brandFilter === brand.id ? "true" : undefined}
                  className={cn(
                    chip,
                    brandFilter === brand.id ? chipActive : chipIdle,
                  )}
                >
                  {brand.name}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        {visible.length ? (
          <ul className="space-y-3">
            {visible.map((opportunity) => {
              const archived = opportunity.status === OpportunityStatus.ARCHIVED;
              const outputs = summarizeOutputs(opportunity.contentAssets);
              const openActions = opportunity.proposedActions.length;
              // Work started is work in progress, whatever the stored status says.
              const inProgress =
                !archived &&
                (opportunity.status === OpportunityStatus.ACTIVE ||
                  outputs.activeCount > 0 ||
                  openActions > 0);
              const statusLabel = archived
                ? statusLabels.ARCHIVED
                : inProgress
                  ? statusLabels.ACTIVE
                  : statusLabels.NEW;

              const isSearch = opportunity.source === OpportunitySource.SEARCH;
              const canPublish = publishingConfig(opportunity.brand).ok;
              // One dominant next step. Everything else moves under More actions.
              const primary = archived
                ? "none"
                : outputs.primary
                  ? "open"
                  : isSearch && !opportunity.seoBrief
                    ? "brief"
                    : canPublish
                      ? "article"
                      : "meta";

              return (
                <li
                  key={opportunity.id}
                  className={cn(
                    "rounded-xl border border-line px-5 py-4 transition-colors duration-200 sm:px-6 sm:py-5",
                    archived ? "bg-subtle" : "bg-surface shadow-[var(--shadow-subtle)]",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3
                        className={cn(
                          "text-[1.0625rem] leading-snug font-medium tracking-[-0.015em]",
                          archived && "text-ink-3",
                        )}
                      >
                        {opportunity.title}
                      </h3>
                      {opportunity.description ? (
                        // Two lines keep every card the same shape; the whole
                        // description lives one click away, in Edit.
                        <p className="type-body mt-1.5 line-clamp-2 max-w-2xl text-ink-3">
                          {opportunity.description}
                        </p>
                      ) : null}
                    </div>
                    {archived ? null : (
                      <ArchiveCross
                        action={archiveOpportunity.bind(null, opportunity.id)}
                      />
                    )}
                  </div>

                  <p className="type-meta mt-2.5 text-ink-4">
                    {opportunity.score === null ? "" : `Priority ${opportunity.score} · `}
                    {opportunity.brand.name} · {sourceLabels[opportunity.source]} ·{" "}
                    <span className={cn(inProgress ? "text-accent-ink" : "text-ink-3")}>
                      {statusLabel}
                    </span>
                  </p>

                  {outputs.activeCount || outputs.archivedCount || openActions ? (
                    <div className="mt-3 space-y-1">
                      {outputs.activeCount ? (
                        <p className="type-meta text-ink-2">
                          {outputs.activeCount} active output
                          {outputs.activeCount === 1 ? "" : "s"}
                          {outputs.breakdown ? ` · ${outputs.breakdown}` : ""}
                          {outputs.primary ? (
                            <>
                              {" · "}
                              <Link
                                href={`/dashboard/content/${outputs.primary.id}`}
                                className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                              >
                                View in Content
                              </Link>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                      {outputs.archivedCount ? (
                        <p className="type-meta text-ink-4">
                          {outputs.archivedCount} archived output
                          {outputs.archivedCount === 1 ? "" : "s"}
                          {!outputs.activeCount && outputs.primary ? (
                            <>
                              {" · "}
                              <Link
                                href={`/dashboard/content/${outputs.primary.id}`}
                                className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                              >
                                View in Content
                              </Link>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                      {openActions ? (
                        <p className="type-meta text-ink-2">
                          {openActions} open action{openActions === 1 ? "" : "s"}
                          {" · "}
                          <Link
                            href={`/dashboard/actions?brand=${opportunity.brandId}`}
                            className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                          >
                            Open in Actions
                          </Link>
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {archived ? (
                    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-line pt-3">
                      <form action={restoreOpportunity.bind(null, opportunity.id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          Restore
                        </Button>
                      </form>
                      <DeleteOpportunity opportunityId={opportunity.id} />
                    </div>
                  ) : (
                    <div className="mt-4 border-t border-line pt-3.5">
                      <p className="type-label">Next step</p>
                      <div className="mt-2">
                        {primary === "open" && outputs.primary ? (
                          <ButtonLink
                            href={`/dashboard/content/${outputs.primary.id}`}
                            size="sm"
                          >
                            {outputs.hasActiveArticle
                              ? "Open the article"
                              : "Open the draft"}
                          </ButtonLink>
                        ) : primary === "brief" ? (
                          <SeoBrief opportunityId={opportunity.id} brief={null} contentAsset={null} />
                        ) : primary === "article" ? (
                          <GenerateArticle
                            opportunityId={opportunity.id}
                            articleAssetId={null}
                            emphasis="primary"
                          />
                        ) : (
                          <MetaIdeas
                            brandId={opportunity.brandId}
                            opportunityId={opportunity.id}
                            emphasis="primary"
                          />
                        )}
                      </div>

                      <Disclosure summary="More actions" className="mt-2">
                        <div className="grid gap-2 rounded-lg bg-subtle p-4">
                          {isSearch && opportunity.actionType ? (
                            <ProposeAction
                              opportunityId={opportunity.id}
                              hasOpenAction={openActions > 0}
                            />
                          ) : null}

                          {isSearch && primary !== "brief" ? (
                            <SeoBrief
                              opportunityId={opportunity.id}
                              contentAsset={null}
                              brief={
                                opportunity.seoBrief
                                  ? {
                                      objective: opportunity.seoBrief.objective,
                                      targetKeyword: opportunity.seoBrief.targetKeyword,
                                      searchIntent: opportunity.seoBrief.searchIntent,
                                      recommendedAction:
                                        opportunity.seoBrief.recommendedAction,
                                      actionJustification:
                                        opportunity.seoBrief.actionJustification,
                                      recommendedTitle:
                                        opportunity.seoBrief.recommendedTitle,
                                      recommendedMetaDescription:
                                        opportunity.seoBrief.recommendedMetaDescription,
                                      outline: opportunity.seoBrief.outline,
                                      keyQuestions: opportunity.seoBrief.keyQuestions,
                                      internalLinks: opportunity.seoBrief.internalLinks,
                                      competitorInsights:
                                        opportunity.seoBrief.competitorInsights,
                                      evidenceNeeded:
                                        opportunity.seoBrief.evidenceNeeded,
                                    }
                                  : null
                              }
                            />
                          ) : null}

                          {canPublish && primary !== "article" ? (
                            <GenerateArticle
                              opportunityId={opportunity.id}
                              articleAssetId={
                                outputs.hasActiveArticle
                                  ? (opportunity.contentAssets.find(
                                      (asset) =>
                                        asset.channel === "WEBSITE" &&
                                        asset.archivedAt === null,
                                    )?.id ?? null)
                                  : null
                              }
                            />
                          ) : null}

                          {primary === "meta" ? null : (
                            <MetaIdeas
                              brandId={opportunity.brandId}
                              opportunityId={opportunity.id}
                            />
                          )}

                          <LinkedInDrafts opportunityId={opportunity.id} />
                        </div>
                      </Disclosure>
                    </div>
                  )}

                  <Disclosure summary="Edit" className="mt-2">
                    <form
                      action={updateOpportunity.bind(null, opportunity.id)}
                      className="grid max-w-2xl gap-5 rounded-lg bg-subtle p-5"
                    >
                      <Fields brands={brands} opportunity={opportunity} />
                      <div className="border-t border-line pt-5">
                        <Button type="submit">Save opportunity</Button>
                      </div>
                    </form>
                  </Disclosure>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title={TAB_EMPTY[tab]}
            description={
              brandFilter === "all" && statusFilter === "all"
                ? TAB_NEXT[tab]
                : "Nothing matches these filters. Clear them to see the rest."
            }
          />
        )}
      </Section>
    </Page>
  );
}
