import { archiveCampaign, createCampaign, restoreCampaign } from "@/app/dashboard/sales/actions";
import { CampaignFields } from "@/components/sales/campaign-fields";
import { SalesNav } from "@/components/sales/sales-ui";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Select } from "@/components/ui/field";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/ui/layout";
import { getPrisma } from "@/lib/prisma";
import { CLOSED, MEETING_OR_LATER, QUALIFIED_OR_LATER, humanize } from "@/lib/sales";
import Link from "next/link";

export const metadata = { title: "Sales campaigns" };
export const dynamic = "force-dynamic";

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-[4.5rem]">
      <p className="type-label">{label}</p>
      <p className="mt-1 text-[1.125rem] font-semibold tabular-nums tracking-[-0.02em]">
        {value}
      </p>
    </div>
  );
}

export default async function CampaignsPage({
  searchParams,
}: PageProps<"/dashboard/sales/campaigns">) {
  const params = await searchParams;
  const showArchived = params.archived === "1";
  const prisma = getPrisma();

  const [brands, campaigns] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.salesCampaign.findMany({
      where: showArchived ? { status: "ARCHIVED" } : { status: { not: "ARCHIVED" } },
      orderBy: { createdAt: "desc" },
      include: {
        brand: { select: { name: true } },
        prospects: { select: { status: true } },
      },
    }),
  ]);

  return (
    <Page>
      <PageHeader
        eyebrow="Sales"
        title="Campaigns"
        description="One offer aimed at one kind of company, for one brand. Prospects are found and qualified inside a campaign."
      />
      <div className="mt-10">
        <SalesNav active="campaigns" />
      </div>

      <Section
        title={showArchived ? "Archived campaigns" : "Campaigns"}
        hint={`${campaigns.length}`}
        actions={
          <Link
            href={showArchived ? "/dashboard/sales/campaigns" : "/dashboard/sales/campaigns?archived=1"}
            className="type-meta rounded-md transition-colors hover:text-ink"
          >
            {showArchived ? "Back to active" : "Archived"}
          </Link>
        }
      >
        {campaigns.length ? (
          <ul className="divide-y divide-line">
            {campaigns.map((campaign) => {
              const active = campaign.prospects.filter((p) => !CLOSED.has(p.status)).length;
              const qualified = campaign.prospects.filter((p) =>
                QUALIFIED_OR_LATER.has(p.status),
              ).length;
              const meetings = campaign.prospects.filter((p) =>
                MEETING_OR_LATER.has(p.status),
              ).length;
              const won = campaign.prospects.filter((p) => p.status === "WON").length;

              return (
                <li
                  key={campaign.id}
                  className="flex flex-col gap-4 py-5 first:pt-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Link
                        href={`/dashboard/sales/campaigns/${campaign.id}`}
                        className="text-[0.9375rem] font-medium tracking-[-0.01em] transition-colors hover:text-accent-ink"
                      >
                        {campaign.name}
                      </Link>
                      {campaign.status === "ACTIVE" ? null : (
                        <Badge tone="muted">{humanize(campaign.status)}</Badge>
                      )}
                    </div>
                    <p className="type-meta mt-1">
                      {campaign.brand.name} · {campaign.offer}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                    <Count label="Active" value={active} />
                    <Count label="Qualified" value={qualified} />
                    <Count label="Meetings" value={meetings} />
                    <Count label="Won" value={won} />
                    <div className="flex items-center gap-1">
                      <ButtonLink
                        href={`/dashboard/sales/campaigns/${campaign.id}`}
                        variant="secondary"
                        size="sm"
                      >
                        Open
                      </ButtonLink>
                      <form
                        action={
                          showArchived
                            ? restoreCampaign.bind(null, campaign.id)
                            : archiveCampaign.bind(null, campaign.id)
                        }
                      >
                        <Button type="submit" variant="ghost" size="sm">
                          {showArchived ? "Restore" : "Archive"}
                        </Button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title={showArchived ? "Nothing archived" : "No campaigns yet"}
            description={
              showArchived
                ? "Archived campaigns keep their prospects and history, and can be restored."
                : "Create a campaign to define who to sell to, and why."
            }
          />
        )}
      </Section>

      {showArchived ? null : (
        <Section title="Create a campaign">
          <Disclosure summary="New campaign">
            {brands.length ? (
              <Panel className="mt-4">
                <form action={createCampaign} className="grid gap-5">
                  <Select label="Brand" name="brandId" required defaultValue={brands[0].id}>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </Select>
                  <CampaignFields />
                  <div>
                    <Button type="submit">Create campaign</Button>
                  </div>
                </form>
              </Panel>
            ) : (
              <p className="type-meta mt-4">Create a brand first.</p>
            )}
          </Disclosure>
        </Section>
      )}
    </Page>
  );
}
