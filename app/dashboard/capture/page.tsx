import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Select, TextArea } from "@/components/ui/field";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { ObservationStatus } from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";
import {
  archiveObservation,
  createObservation,
  restoreObservation,
  updateObservation,
} from "./actions";

export const metadata = { title: "Capture" };
export const dynamic = "force-dynamic";

const statusFilters = [
  { label: "All", value: "all" },
  { label: "New", value: ObservationStatus.NEW },
  { label: "Reviewed", value: ObservationStatus.REVIEWED },
  { label: "Archived", value: ObservationStatus.ARCHIVED },
] as const;

const dateFormat = new Intl.DateTimeFormat("en", {
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

export default async function CapturePage({
  searchParams,
}: PageProps<"/dashboard/capture">) {
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

  const observations = brands.length
    ? await prisma.observation.findMany({
        where: {
          ...(brandFilter === "all" ? {} : { brandId: brandFilter }),
          ...(statusFilter === "all"
            ? {}
            : { status: statusFilter as ObservationStatus }),
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { brand: { select: { id: true, name: true } } },
      })
    : [];

  function filterHref(next: { brand?: string; status?: string }) {
    const query = new URLSearchParams();
    const brand = next.brand ?? brandFilter;
    const status = next.status ?? statusFilter;
    if (brand !== "all") query.set("brand", brand);
    if (status !== "all") query.set("status", status);
    const search = query.toString();
    return search ? `/dashboard/capture?${search}` : "/dashboard/capture";
  }

  const defaultBrandId = brandFilter === "all" ? brands[0]?.id : brandFilter;

  return (
    <Page>
      <PageHeader
        eyebrow="Signal"
        title="Capture"
        description="Anything the market tells you — a phrase, a frustration, an objection. Write it down before it evaporates."
      />

      <Section className="mt-12">
        {brands.length ? (
          <Panel className="max-w-2xl">
            <form action={createObservation} className="grid gap-5">
              <TextArea
                label="Observation"
                name="content"
                required
                rows={4}
                autoFocus
                placeholder="A CFO said they keep three versions of the same forecast, and trust none of them."
              />
              <div className="flex flex-wrap items-end gap-4">
                <Select
                  label="Brand"
                  name="brandId"
                  required
                  defaultValue={defaultBrandId}
                  className="sm:w-64"
                >
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </Select>
                <Button type="submit">Capture</Button>
              </div>
            </form>
          </Panel>
        ) : (
          <EmptyState
            title="No brands yet"
            description="Observations attach to a brand. Create one first."
          />
        )}
      </Section>

      <Section
        title="Recent observations"
        hint={
          observations.length === 1
            ? "1 observation"
            : `${observations.length} observations`
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
                className={cn(
                  chip,
                  brandFilter === "all" ? chipActive : chipIdle,
                )}
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

        {observations.length ? (
          <ul className="divide-y divide-line">
            {observations.map((observation) => {
              const archived = observation.status === ObservationStatus.ARCHIVED;
              return (
                <li key={observation.id} className="py-5 first:pt-0">
                  <div className="flex items-start justify-between gap-4">
                    <p
                      className={cn(
                        "type-body max-w-2xl whitespace-pre-line",
                        archived ? "text-ink-4" : "text-ink-2",
                      )}
                    >
                      {observation.content}
                    </p>
                    <Badge tone={archived ? "muted" : "neutral"}>
                      {observation.status.toLowerCase()}
                    </Badge>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4">
                    <span className="type-meta">
                      {observation.brand.name} ·{" "}
                      {dateFormat.format(observation.createdAt)}
                    </span>

                    <form
                      action={
                        archived
                          ? restoreObservation.bind(null, observation.id)
                          : archiveObservation.bind(null, observation.id)
                      }
                    >
                      <Button type="submit" variant="ghost" size="sm">
                        {archived ? "Restore" : "Archive"}
                      </Button>
                    </form>
                  </div>

                  <Disclosure summary="Edit" className="mt-2">
                    <form
                      action={updateObservation.bind(null, observation.id)}
                      className="grid max-w-2xl gap-5 rounded-xl border border-line bg-subtle p-6"
                    >
                      <TextArea
                        label="Observation"
                        name="content"
                        required
                        rows={4}
                        defaultValue={observation.content}
                      />
                      <div className="grid gap-5 sm:grid-cols-2">
                        <Select
                          label="Brand"
                          name="brandId"
                          required
                          defaultValue={observation.brandId}
                        >
                          {brands.map((brand) => (
                            <option key={brand.id} value={brand.id}>
                              {brand.name}
                            </option>
                          ))}
                        </Select>
                        <Select
                          label="Status"
                          name="status"
                          defaultValue={observation.status}
                        >
                          <option value={ObservationStatus.NEW}>New</option>
                          <option value={ObservationStatus.REVIEWED}>
                            Reviewed
                          </option>
                          <option value={ObservationStatus.ARCHIVED}>
                            Archived
                          </option>
                        </Select>
                      </div>
                      <div className="border-t border-line pt-5">
                        <Button type="submit">Save observation</Button>
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
                ? "Captured observations will appear here."
                : "No observation matches these filters."
            }
          />
        )}
      </Section>
    </Page>
  );
}
