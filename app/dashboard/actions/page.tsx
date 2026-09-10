import {
  approveAction,
  dismissAction,
  reopenAction,
} from "@/app/dashboard/actions/actions";
import {
  AdsExecution,
  type AdsActionPreview,
} from "@/components/ads/ads-execution";
import {
  ActionMeasurement,
  type MeasurementView,
} from "@/components/actions/action-measurement";
import { SeoRecommendation } from "@/components/actions/seo-recommendation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Page, PageHeader, Section } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { ActionStatus, ActionType, RiskLevel } from "@/lib/generated/prisma/enums";
import { TabNav, type TabItem } from "@/components/ui/tab-nav";
import { getPrisma } from "@/lib/prisma";
import {
  buildImplementationBrief,
  type SeoActionKind,
} from "@/lib/seo-implementation";
import Link from "next/link";

export const metadata = { title: "Actions" };
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

const RISK_TONE: Record<RiskLevel, "accent" | "neutral" | "muted"> = {
  LOW: "muted",
  MEDIUM: "neutral",
  HIGH: "accent",
};

const STATUS_TONE: Record<ActionStatus, "accent" | "neutral" | "muted"> = {
  PROPOSED: "neutral",
  APPROVED: "accent",
  EXECUTED: "accent",
  FAILED: "muted",
  MEASURED: "accent",
  DISMISSED: "muted",
};

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function readSeoActionType(payload: unknown): SeoActionKind | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as { actionType?: unknown }).actionType;
  return typeof value === "string" &&
    ["CREATE_PAGE", "REFRESH_PAGE", "TECHNICAL_FIX", "INTERNAL_LINK"].includes(value)
    ? (value as SeoActionKind)
    : null;
}

function readImplemented(payload: unknown) {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { implementedManually?: unknown }).implementedManually === true
  );
}

function readAdsPreview(payload: unknown): AdsActionPreview | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = payload as Partial<AdsActionPreview> & { channel?: string };
  if (value.channel !== "GOOGLE_ADS" || !value.adsActionType) return null;
  return {
    adsActionType: value.adsActionType,
    current: value.current ?? "",
    proposed: value.proposed ?? "",
    evidence: value.evidence ?? "",
    campaignName: value.campaignName ?? null,
    adGroupName: value.adGroupName ?? null,
    keywordText: value.keywordText ?? "",
    matchType: value.matchType ?? "",
    result: value.result,
  };
}

function readMeasurement(
  row:
    | {
        periodBefore: string;
        periodAfter: string;
        metricsBefore: unknown;
        metricsAfter: unknown;
        outcome: string;
        headline: string;
        observation: string;
        createdAt: Date;
      }
    | undefined,
): MeasurementView | null {
  if (!row) return null;
  const numbers = (value: unknown): Record<string, number> =>
    typeof value === "object" && value !== null
      ? (value as Record<string, number>)
      : {};
  return {
    periodBefore: row.periodBefore,
    periodAfter: row.periodAfter,
    metricsBefore: numbers(row.metricsBefore),
    metricsAfter: numbers(row.metricsAfter),
    outcome: row.outcome,
    headline: row.headline,
    observation: row.observation,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The workflow, in order. FAILED is kept so a failed write is never hidden. */
const TABS = [
  "PROPOSED",
  "APPROVED",
  "EXECUTED",
  "MEASURED",
  "FAILED",
  "DISMISSED",
] as const;

const TAB_EMPTY: Record<(typeof TABS)[number], string> = {
  PROPOSED: "No proposed actions",
  APPROVED: "No approved actions",
  EXECUTED: "No executed actions",
  MEASURED: "No measured actions",
  FAILED: "No failed actions",
  DISMISSED: "No dismissed actions",
};

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function Chips({
  label: title,
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
      <span className="type-label mr-1">{title}</span>
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

export default async function ActionsPage({
  searchParams,
}: PageProps<"/dashboard/actions">) {
  const params = await searchParams;
  const prisma = getPrisma();

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const brandParam = readParam(params.brand) ?? "all";
  const brand = brands.some((item) => item.id === brandParam) ? brandParam : "all";

  const typeParam = readParam(params.type) ?? "all";
  const type = (Object.values(ActionType) as string[]).includes(typeParam)
    ? typeParam
    : "all";

  const statusParam = readParam(params.status) ?? ActionStatus.PROPOSED;
  const status = (TABS as readonly string[]).includes(statusParam)
    ? statusParam
    : ActionStatus.PROPOSED;

  const actions = await prisma.proposedAction.findMany({
    where: {
      ...(brand === "all" ? {} : { brandId: brand }),
      ...(type === "all" ? {} : { type: type as ActionType }),
      status: status as ActionStatus,
    },
    orderBy: { createdAt: "desc" },
    include: {
      brand: {
        select: {
          name: true,
          githubOwner: true,
          githubRepo: true,
          githubBranch: true,
        },
      },
      opportunity: {
        select: {
          id: true,
          title: true,
          score: true,
          targetUrl: true,
          targetKeyword: true,
          seoBrief: {
            select: {
              objective: true,
              searchIntent: true,
              recommendedTitle: true,
              recommendedMetaDescription: true,
              outline: true,
              keyQuestions: true,
              internalLinks: true,
              competitorInsights: true,
              evidenceNeeded: true,
            },
          },
        },
      },
      measurements: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  // Counts per phase, under the same brand and type refinement as the list.
  const grouped = await prisma.proposedAction.groupBy({
    by: ["status"],
    where: {
      ...(brand === "all" ? {} : { brandId: brand }),
      ...(type === "all" ? {} : { type: type as ActionType }),
    },
    _count: { _all: true },
  });
  const counts = new Map(grouped.map((row) => [row.status, row._count._all]));

  function hrefWith(next: Partial<Record<"brand" | "type" | "status", string>>) {
    const query = new URLSearchParams();
    const values = { brand, type, status, ...next };
    for (const [key, value] of Object.entries(values)) {
      if (value !== "all") query.set(key, value);
    }
    const search = query.toString();
    return search ? `/dashboard/actions?${search}` : "/dashboard/actions";
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Execution"
        title="Action Center"
        description="What Zuri proposes, what you approved, and what it would change. Nothing here runs on its own."
      />

      <Section
        title="Actions"
        hint={actions.length === 1 ? "1 action" : `${actions.length} actions`}
        className="mt-12"
      >
        <TabNav
          active={status}
          tabs={TABS.map<TabItem>((value) => ({
            label: label(value),
            value,
            count: counts.get(value) ?? 0,
            href: hrefWith({ status: value }),
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
            label="Type"
            active={type}
            hrefFor={(value) => hrefWith({ type: value })}
            options={[
              { label: "All", value: "all" },
              ...Object.values(ActionType).map((value) => ({
                label: label(value),
                value,
              })),
            ]}
          />
        </div>

        {actions.length ? (
          <ul className="divide-y divide-line">
            {actions.map((action) => {
              const dismissed = action.status === "DISMISSED";
              return (
                <li key={action.id} className="py-6 first:pt-0">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                    <p
                      className={cn(
                        "min-w-0 text-[0.9375rem] font-medium tracking-[-0.01em]",
                        dismissed && "text-ink-4",
                      )}
                    >
                      {action.title}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone="neutral">{label(action.type)}</Badge>
                      <Badge tone={STATUS_TONE[action.status]}>
                        {label(action.status)}
                      </Badge>
                    </div>
                  </div>

                  <dl className="mt-4 grid max-w-3xl gap-3">
                    <div className="sm:flex sm:gap-6">
                      <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">
                        What changes
                      </dt>
                      <dd className="type-body mt-1 text-ink-2 sm:mt-0">
                        {action.summary}
                      </dd>
                    </div>
                    <div className="sm:flex sm:gap-6">
                      <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">Why</dt>
                      <dd className="type-body mt-1 text-ink-2 sm:mt-0">
                        {action.rationale}
                      </dd>
                    </div>
                    <div className="sm:flex sm:gap-6">
                      <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">Target</dt>
                      <dd className="type-body mt-1 break-all text-ink-2 sm:mt-0">
                        {action.target ?? "—"}
                      </dd>
                    </div>
                    <div className="sm:flex sm:gap-6">
                      <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">Risk</dt>
                      <dd className="mt-1 sm:mt-0">
                        <Badge tone={RISK_TONE[action.riskLevel]}>
                          {label(action.riskLevel)}
                        </Badge>
                      </dd>
                    </div>
                  </dl>

                  <p className="type-meta mt-3">
                    {action.brand.name} · proposed {dateTime.format(action.createdAt)}
                    {action.approvedAt
                      ? ` · approved ${dateTime.format(action.approvedAt)}`
                      : ""}
                    {action.executedAt
                      ? ` · executed ${dateTime.format(action.executedAt)}`
                      : ""}
                    {action.measuredAt
                      ? ` · measured ${dateTime.format(action.measuredAt)}`
                      : ""}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                    {action.status === "PROPOSED" ? (
                      <>
                        <form action={approveAction.bind(null, action.id)}>
                          <Button type="submit" size="sm">
                            Approve
                          </Button>
                        </form>
                        <form action={dismissAction.bind(null, action.id)}>
                          <Button type="submit" variant="ghost" size="sm">
                            Dismiss
                          </Button>
                        </form>
                      </>
                    ) : null}

                    {action.status === "APPROVED" || dismissed ? (
                      <form action={reopenAction.bind(null, action.id)}>
                        <Button type="submit" variant="ghost" size="sm">
                          Back to proposed
                        </Button>
                      </form>
                    ) : null}

                    {action.opportunity ? (
                      <Link
                        href="/dashboard/opportunities"
                        className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                        title={action.opportunity.title}
                      >
                        Source opportunity
                        {action.opportunity.score === null
                          ? ""
                          : ` · scored ${action.opportunity.score}`}
                      </Link>
                    ) : null}
                  </div>

                  {action.executedAt ? (
                    <ActionMeasurement
                      actionId={action.id}
                      measurement={readMeasurement(action.measurements[0])}
                    />
                  ) : null}

                  {action.type === "GOOGLE_ADS" && readAdsPreview(action.payload) ? (
                    <AdsExecution
                      actionId={action.id}
                      status={action.status}
                      risk={action.riskLevel}
                      preview={readAdsPreview(action.payload)!}
                      verification={
                        action.verifiedAt
                          ? {
                              outcome: action.verificationOutcome,
                              actual: action.actualState,
                              note: action.verificationNote,
                              verifiedAt: action.verifiedAt.toISOString(),
                            }
                          : null
                      }
                    />
                  ) : null}

                  {action.type === "SEO" ? (
                    <SeoRecommendation
                      actionId={action.id}
                      title={action.title}
                      status={action.status}
                      implementedManually={readImplemented(action.payload)}
                      sections={buildImplementationBrief({
                        actionType: readSeoActionType(action.payload),
                        title: action.title,
                        summary: action.summary,
                        rationale: action.rationale,
                        targetUrl:
                          action.opportunity?.targetUrl ?? action.target ?? null,
                        targetKeyword: action.opportunity?.targetKeyword ?? null,
                        priority: action.opportunity?.score ?? null,
                        brand: action.brand.name,
                        brief: action.opportunity?.seoBrief ?? null,
                      })}
                      history={{
                        branch: action.branch,
                        prNumber: action.prNumber,
                        prUrl: action.prUrl,
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title={TAB_EMPTY[status as (typeof TABS)[number]]}
            description={
              brand === "all" && type === "all"
                ? "Propose one from a SEO opportunity and it appears here for approval."
                : "No action matches these filters."
            }
          />
        )}
      </Section>
    </Page>
  );
}
