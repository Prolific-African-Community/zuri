import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState, Page, PageHeader, Section, Stat } from "@/components/ui/layout";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function DashboardPage() {
  const prisma = getPrisma();
  const [workspace, brands] = await Promise.all([
    prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.brand.findMany({
      orderBy: { updatedAt: "desc" },
      include: { profile: { select: { mission: true } } },
    }),
  ]);

  const active = brands.filter((brand) => brand.status === "ACTIVE").length;
  const withMission = brands.filter((brand) =>
    Boolean(brand.profile?.mission?.trim()),
  ).length;

  return (
    <Page>
      <PageHeader
        eyebrow={workspace?.name ?? "Workspace"}
        title="Overview"
        description="Zuri keeps every brand's identity and market knowledge separate, structured, and ready for the engines that follow."
        actions={
          <ButtonLink href="/dashboard/brands" variant="secondary" size="sm">
            Manage brands
          </ButtonLink>
        }
      />

      <Section className="mt-12">
        <div className="grid grid-cols-2 gap-8 border-y border-line py-7 sm:grid-cols-3 sm:gap-12">
          <Stat label="Brands" value={brands.length} />
          <Stat label="Active" value={active} />
          <Stat label="Mission defined" value={`${withMission}/${brands.length}`} />
        </div>
      </Section>

      <Section
        title="Brands"
        hint={brands.length === 1 ? "1 brand" : `${brands.length} brands`}
        actions={
          <Link
            href="/dashboard/brands"
            className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
          >
            View all
          </Link>
        }
      >
        {brands.length ? (
          <ul className="-mx-2.5">
            {brands.slice(0, 6).map((brand) => (
              <li key={brand.id}>
                <Link
                  href={`/dashboard/brands/${brand.id}`}
                  className="group flex items-center gap-4 rounded-lg px-2.5 py-3.5 transition-colors duration-200 hover:bg-subtle"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2.5">
                      <span className="truncate text-[0.9375rem] font-medium tracking-[-0.01em]">
                        {brand.name}
                      </span>
                      {brand.status === "ACTIVE" ? null : (
                        <Badge tone="muted">{brand.status.toLowerCase()}</Badge>
                      )}
                    </span>
                    <span className="type-meta mt-1 block truncate">
                      /{brand.slug}
                      {brand.profile?.mission
                        ? ` · ${brand.profile.mission}`
                        : ""}
                    </span>
                  </span>
                  <span className="type-meta hidden shrink-0 text-ink-4 sm:block">
                    {dateFormat.format(brand.updatedAt)}
                  </span>
                  <span
                    aria-hidden
                    className="shrink-0 text-ink-4 transition-[transform,color] duration-200 group-hover:translate-x-0.5 group-hover:text-accent"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="No brands yet"
            description="Create the first brand to give Zuri something to reason about."
            action={
              <ButtonLink href="/dashboard/brands" size="sm">
                Create a brand
              </ButtonLink>
            }
          />
        )}
      </Section>
    </Page>
  );
}
