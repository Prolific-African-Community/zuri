import { BrandForm } from "@/components/brand-form";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/ui/layout";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";
import { createBrand } from "./actions";

export const metadata = { title: "Brands" };
export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const brands = await getPrisma().brand.findMany({
    orderBy: { createdAt: "asc" },
    include: { workspace: { select: { name: true } } },
  });

  return (
    <Page>
      <PageHeader
        eyebrow="Registry"
        title="Brands"
        description="Brand context stays scoped to its workspace — identity, voice, and market knowledge never leak between brands."
      />

      <Section
        title="All brands"
        hint={brands.length === 1 ? "1 brand" : `${brands.length} brands`}
        className="mt-12"
      >
        {brands.length ? (
          <ul className="-mx-2.5 divide-y divide-line">
            {brands.map((brand) => (
              <li key={brand.id}>
                <Link
                  href={`/dashboard/brands/${brand.id}`}
                  className="group flex items-center gap-4 rounded-lg px-2.5 py-4 transition-colors duration-200 hover:bg-subtle"
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
                      {brand.workspace.name} · /{brand.slug}
                    </span>
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
            description="The form below creates the first one."
          />
        )}
      </Section>

      <Section title="Create a brand">
        <Panel className="max-w-2xl">
          <BrandForm action={createBrand} submitLabel="Create brand" />
        </Panel>
      </Section>
    </Page>
  );
}
