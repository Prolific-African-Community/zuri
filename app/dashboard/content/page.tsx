import { ContentRow, type ContentRowData } from "@/components/content/content-row";
import { EmptyState, Page, PageHeader, Section } from "@/components/ui/layout";
import { TabNav, type TabItem } from "@/components/ui/tab-nav";
import { cn } from "@/lib/cn";
import { ContentChannel, ContentStatus } from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";

export const metadata = { title: "Content" };
export const dynamic = "force-dynamic";

const chip =
  "rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200";
const chipActive = "bg-accent-soft font-medium text-accent-ink";
const chipIdle = "text-ink-3 hover:bg-sunken hover:text-ink";

const TABS = [
  "all",
  "articles",
  "social",
  "drafts",
  "published",
  "archived",
] as const;

const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  all: "All",
  articles: "Articles",
  social: "Social",
  drafts: "Drafts",
  published: "Published",
  archived: "Archived",
};

const TAB_EMPTY: Record<(typeof TABS)[number], string> = {
  all: "No content yet",
  articles: "No articles",
  social: "No social content",
  drafts: "No drafts",
  published: "No published content",
  archived: "Nothing archived",
};

type Filterable = {
  channel: string;
  type: string;
  status: string;
  articleDraft?: { reviewStatus: string } | null;
};

/** One rule per tab, read from the data the models already carry. */
function inTab(asset: Filterable, tab: (typeof TABS)[number]) {
  switch (tab) {
    case "articles":
      return asset.type === "SEO_CONTENT" && asset.channel === "WEBSITE";
    case "social":
      return asset.channel !== "WEBSITE";
    case "drafts":
      return asset.status === "DRAFT";
    case "published":
      return (
        asset.status === "APPROVED" ||
        Boolean(
          asset.articleDraft &&
            ["PUBLISHED", "NEEDS_UPDATE"].includes(asset.articleDraft.reviewStatus),
        )
      );
    case "archived":
      return asset.status === "ARCHIVED";
    default:
      return true;
  }
}

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function Chips({
  label,
  options,
  active,
  hrefFor,
}: {
  label: string;
  options: { label: string; value: string }[];
  active: string;
  hrefFor: (value: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="type-label mr-1">{label}</span>
      {options.map((option) => (
        <Link
          key={option.value}
          href={hrefFor(option.value)}
          aria-current={active === option.value ? "true" : undefined}
          className={cn(chip, active === option.value ? chipActive : chipIdle)}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

export default async function ContentPage({
  searchParams,
}: PageProps<"/dashboard/content">) {
  const params = await searchParams;
  const prisma = getPrisma();

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const brandParam = readParam(params.brand) ?? "all";
  const brand = brands.some((item) => item.id === brandParam) ? brandParam : "all";

  const statusParam = readParam(params.status) ?? "all";
  const status = (Object.values(ContentStatus) as string[]).includes(statusParam)
    ? statusParam
    : "all";

  const channelParam = readParam(params.channel) ?? "all";
  const channel = (Object.values(ContentChannel) as string[]).includes(channelParam)
    ? channelParam
    : "all";

  const tabParam = readParam(params.tab) ?? "all";
  const tab = (TABS as readonly string[]).includes(tabParam) ? tabParam : "all";

  const assets = await prisma.contentAsset.findMany({
    where: {
      ...(brand === "all" ? {} : { brandId: brand }),
      ...(status === "all" ? {} : { status: status as ContentStatus }),
      ...(channel === "all" ? {} : { channel: channel as ContentChannel }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      brand: { select: { name: true } },
      articleDraft: { select: { reviewStatus: true } },
      opportunity: { select: { id: true, title: true } },
      visualAsset: { select: { type: true, imageUrl: true } },
    },
  });

  const counts = Object.fromEntries(
    TABS.map((value) => [value, assets.filter((asset) => inTab(asset, value)).length]),
  ) as Record<(typeof TABS)[number], number>;

  const visible = assets.filter((asset) => inTab(asset, tab as (typeof TABS)[number]));

  function hrefWith(
    next: Partial<Record<"brand" | "status" | "channel" | "tab", string>>,
  ) {
    const query = new URLSearchParams();
    const values = { brand, status, channel, tab, ...next };
    for (const [key, value] of Object.entries(values)) {
      if (value !== "all") query.set(key, value);
    }
    const search = query.toString();
    return search ? `/dashboard/content?${search}` : "/dashboard/content";
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Library"
        title="Content"
        description="Everything written for every brand, with its visual and the opportunity it came from."
      />

      {readParam(params.deleted) ? (
        <p className="type-meta mt-8 text-accent-ink">Article deleted.</p>
      ) : null}

      <Section
        title="All content"
        hint={visible.length === 1 ? "1 asset" : `${visible.length} assets`}
        className="mt-12"
      >
        <TabNav
          active={tab}
          tabs={TABS.map<TabItem>((value) => ({
            label: TAB_LABELS[value],
            value,
            count: counts[value],
            href: hrefWith({ tab: value }),
          }))}
        />

        <div className="mt-6 mb-6 flex flex-col gap-3">
          {brands.length > 1 ? (
            <Chips
              label="Brand"
              active={brand}
              hrefFor={(value) => hrefWith({ brand: value })}
              options={[
                { label: "All", value: "all" },
                ...brands.map((item) => ({ label: item.name, value: item.id })),
              ]}
            />
          ) : null}
          <Chips
            label="Status"
            active={status}
            hrefFor={(value) => hrefWith({ status: value })}
            options={[
              { label: "All", value: "all" },
              ...Object.values(ContentStatus).map((value) => ({
                label: value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " "),
                value,
              })),
            ]}
          />
          <Chips
            label="Channel"
            active={channel}
            hrefFor={(value) => hrefWith({ channel: value })}
            options={[
              { label: "All", value: "all" },
              ...Object.values(ContentChannel).map((value) => ({
                label: value.charAt(0) + value.slice(1).toLowerCase(),
                value,
              })),
            ]}
          />
        </div>

        {visible.length ? (
          <ul className="divide-y divide-line">
            {visible.map((asset) => (
              <ContentRow key={asset.id} asset={asset as ContentRowData} />
            ))}
          </ul>
        ) : (
          <EmptyState
            title={TAB_EMPTY[tab as (typeof TABS)[number]]}
            description={
              brand === "all" && status === "all" && channel === "all"
                ? "Drafts saved from an opportunity land here."
                : "No content matches these filters."
            }
          />
        )}
      </Section>
    </Page>
  );
}
