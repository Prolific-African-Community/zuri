import { GenerateOpportunities } from "@/components/opportunities/generate-button";
import { LinkedInDrafts } from "@/components/opportunities/linkedin-drafts";
import { SavedDrafts } from "@/components/opportunities/saved-drafts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Select, TextArea } from "@/components/ui/field";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { OpportunitySource, OpportunityStatus } from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
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
  { label: "New", value: OpportunityStatus.NEW },
  { label: "Active", value: OpportunityStatus.ACTIVE },
  { label: "Archived", value: OpportunityStatus.ARCHIVED },
] as const;

const sourceLabels: Record<OpportunitySource, string> = {
  MANUAL: "Manual",
  OBSERVATION: "Observation",
  SIGNAL: "Market signal",
  COMPETITOR: "Competitor",
};

const statusLabels: Record<OpportunityStatus, string> = {
  NEW: "New",
  ACTIVE: "Active",
  ARCHIVED: "Archived",
};

const chip =
  "rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200";
const chipActive = "bg-accent-soft font-medium text-accent-ink";
const chipIdle = "text-ink-3 hover:bg-sunken hover:text-ink";

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
          ...(statusFilter === "all"
            ? {}
            : { status: statusFilter as OpportunityStatus }),
        },
        orderBy: [{ score: "desc" }, { createdAt: "desc" }],
        include: {
          brand: { select: { name: true } },
          _count: { select: { contentAssets: true } },
          contentAssets: {
            orderBy: { createdAt: "desc" },
            include: { visualAsset: true },
          },
        },
      })
    : [];

  function filterHref(next: { brand?: string; status?: string }) {
    const query = new URLSearchParams();
    const brand = next.brand ?? brandFilter;
    const status = next.status ?? statusFilter;
    if (brand !== "all") query.set("brand", brand);
    if (status !== "all") query.set("status", status);
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
          opportunities.length === 1
            ? "1 opportunity"
            : `${opportunities.length} opportunities`
        }
      >
        <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
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

        {opportunities.length ? (
          <ul className="divide-y divide-line">
            {opportunities.map((opportunity) => {
              const archived = opportunity.status === OpportunityStatus.ARCHIVED;
              return (
                <li key={opportunity.id} className="py-5 first:pt-0">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h3
                        className={cn(
                          "text-[0.9375rem] font-medium tracking-[-0.01em]",
                          archived && "text-ink-4",
                        )}
                      >
                        {opportunity.title}
                      </h3>
                      {opportunity.description ? (
                        <p className="type-body mt-1.5 max-w-2xl text-ink-3">
                          {opportunity.description}
                        </p>
                      ) : null}
                      {opportunity.rationale ? (
                        <p className="type-meta mt-2 max-w-2xl text-ink-4">
                          {opportunity.rationale}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {opportunity.score === null ? null : (
                        <span className="text-[0.9375rem] font-semibold tracking-[-0.02em] text-accent-ink">
                          {opportunity.score}
                        </span>
                      )}
                      <Badge tone={archived ? "muted" : "neutral"}>
                        {statusLabels[opportunity.status]}
                      </Badge>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4">
                    <span className="type-meta">
                      {opportunity.brand.name} · {sourceLabels[opportunity.source]}
                      {opportunity._count.contentAssets
                        ? ` · ${opportunity._count.contentAssets} saved draft${opportunity._count.contentAssets === 1 ? "" : "s"}`
                        : ""}
                    </span>
                    <form
                      action={
                        archived
                          ? restoreOpportunity.bind(null, opportunity.id)
                          : archiveOpportunity.bind(null, opportunity.id)
                      }
                    >
                      <Button type="submit" variant="ghost" size="sm">
                        {archived ? "Restore" : "Archive"}
                      </Button>
                    </form>
                  </div>

                  <SavedDrafts
                    drafts={opportunity.contentAssets.map((asset) => ({
                      id: asset.id,
                      title: asset.title,
                      content: asset.content,
                      status: asset.status,
                      visual: asset.visualAsset
                        ? {
                            id: asset.visualAsset.id,
                            type: asset.visualAsset.type,
                            reason: asset.visualAsset.reason,
                            concept: asset.visualAsset.concept,
                            imageUrl: asset.visualAsset.imageUrl,
                          }
                        : null,
                    }))}
                  />

                  <LinkedInDrafts opportunityId={opportunity.id} />

                  <Disclosure summary="Edit" className="mt-4">
                    <form
                      action={updateOpportunity.bind(null, opportunity.id)}
                      className="grid max-w-2xl gap-5 rounded-xl border border-line bg-subtle p-6"
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
            title="Nothing here"
            description={
              brandFilter === "all" && statusFilter === "all"
                ? "Created opportunities will appear here."
                : "No opportunity matches these filters."
            }
          />
        )}
      </Section>
    </Page>
  );
}
