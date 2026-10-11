import { ProspectTable } from "@/components/sales/prospect-table";
import { SalesNav } from "@/components/sales/sales-ui";
import { CONTACTABILITY_LEVELS } from "@/lib/contactability";
import { SALES_VIEW_INCLUDE, bySalesPriority, salesView } from "@/lib/sales-view";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import type { ReactNode } from "react";
import { EmptyState, Page, PageHeader, Section } from "@/components/ui/layout";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { PROSPECT_STATUSES, humanize } from "@/lib/sales";
import Link from "next/link";

export const metadata = { title: "Prospects" };
export const dynamic = "force-dynamic";

/** One compact, equal-height filter. A chosen value is marked so active filters read at a glance. */
function FilterSelect({
  label,
  name,
  value,
  children,
}: {
  label: string;
  name: string;
  value: string | undefined;
  children: ReactNode;
}) {
  return (
    <Select
      label={label}
      name={name}
      defaultValue={value ?? "all"}
      className={
        value
          ? "h-9 border-accent-line bg-accent-soft py-0 text-[0.8125rem] font-medium text-accent-ink"
          : "h-9 py-0 text-[0.8125rem]"
      }
    >
      <option value="all">All</option>
      {children}
    </Select>
  );
}

/** Score bands shared by the fit and digital maturity filters. */
const BANDS = [
  { value: "high", label: "70 and above", min: 70, max: 100 },
  { value: "medium", label: "40–69", min: 40, max: 69 },
  { value: "low", label: "Below 40", min: 0, max: 39 },
  { value: "unscored", label: "Not scored", min: null, max: null },
] as const;

function band(value: string | undefined) {
  return BANDS.find((item) => item.value === value) ?? null;
}

function scoreWhere(value: string | undefined) {
  const selected = band(value);
  if (!selected) return undefined;
  if (selected.min === null) return null;
  return { gte: selected.min, lte: selected.max };
}

function read(value: string | string[] | undefined) {
  const single = Array.isArray(value) ? value[0] : value;
  return single && single !== "all" ? single : undefined;
}

export default async function ProspectsPage({
  searchParams,
}: PageProps<"/dashboard/sales/prospects">) {
  const params = await searchParams;
  const brandId = read(params.brand);
  const campaignId = read(params.campaign);
  const status = read(params.status);
  const country = read(params.country);
  const fit = read(params.fit);
  const maturity = read(params.maturity);
  const reach = read(params.reach);

  const prisma = getPrisma();

  const fitWhere = scoreWhere(fit);
  const maturityWhere = scoreWhere(maturity);

  const where: Prisma.ProspectWhereInput = {
    ...(brandId ? { brandId } : {}),
    ...(campaignId ? { campaignId } : {}),
    ...(status && (PROSPECT_STATUSES as readonly string[]).includes(status)
      ? { status: status as (typeof PROSPECT_STATUSES)[number] }
      : {}),
    ...(country ? { country } : {}),
    ...(fitWhere !== undefined ? { fitScore: fitWhere } : {}),
    ...(maturityWhere !== undefined ? { digitalMaturityScore: maturityWhere } : {}),
  };

  const [brands, campaigns, countries, rows] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.salesCampaign.findMany({
      // Only campaigns of the selected brand are offered, so the two filters
      // can never contradict each other.
      where: brandId ? { brandId } : {},
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.prospect.findMany({
      where: { country: { not: null }, ...(brandId ? { brandId } : {}) },
      distinct: ["country"],
      select: { country: true },
      orderBy: { country: "asc" },
    }),
    prisma.prospect.findMany({
      where,
      orderBy: [{ fitScore: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }],
      include: {
        campaign: { select: { id: true, name: true } },
        ...SALES_VIEW_INCLUDE,
      },
    }),
  ]);

  const activeFilters = [brandId, campaignId, status, country, fit, reach, maturity].filter(Boolean).length;

  // Ranked for outbound work: qualification gates, fit, confidence, then reach.
  const prospects = rows
    .map((prospect) => ({ ...prospect, view: salesView(prospect) }))
    .filter((prospect) => !reach || prospect.view.contactability.level === reach.toUpperCase())
    .sort(bySalesPriority);

  return (
    <Page>
      <PageHeader
        eyebrow="Sales"
        title="Prospects"
        description="Every company across campaigns, ranked by fit and how reachable it is."
      />
      <div className="mt-10">
        <SalesNav active="prospects" />
      </div>

      {/* A plain GET form: filters live in the URL, survive a refresh and can be shared. */}
      <form method="get" className="rounded-xl border border-line bg-subtle p-4 sm:p-5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-3.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          <FilterSelect label="Brand" name="brand" value={brandId}>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Campaign" name="campaign" value={campaignId}>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Status" name="status" value={status}>
            {PROSPECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {humanize(value)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Country" name="country" value={country}>
            {countries.map((entry) => (
              <option key={entry.country} value={entry.country ?? ""}>
                {entry.country}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Fit" name="fit" value={fit}>
            {BANDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Contactability" name="reach" value={reach}>
            {CONTACTABILITY_LEVELS.map((level) => (
              <option key={level} value={level.toLowerCase()}>
                {humanize(level)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Digital maturity" name="maturity" value={maturity}>
            {BANDS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </FilterSelect>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3.5">
          <p className="text-[0.8125rem] text-ink-3">
            {activeFilters ? `${activeFilters} filter${activeFilters === 1 ? "" : "s"} applied` : "No filters applied"}
          </p>
          <div className="flex items-center gap-2">
            {activeFilters ? (
              <Link
                href="/dashboard/sales/prospects"
                className="inline-flex h-8 items-center rounded-md px-3 text-[0.8125rem] text-ink-3 transition-colors hover:bg-sunken hover:text-ink"
              >
                Reset
              </Link>
            ) : null}
            <Button type="submit" size="sm">
              Apply filters
            </Button>
          </div>
        </div>
      </form>

      <Section
        title="Prospects"
        hint={`${prospects.length} · strongest and most reachable first`}
        className="mt-10"
      >
        {prospects.length ? (
          <ProspectTable rows={prospects} />
        ) : (
          <EmptyState
            title="No prospects match"
            description="Prospects are added inside a campaign. Adjust the filters, or open a campaign to add one."
          />
        )}
      </Section>
    </Page>
  );
}
