import { GenerateGrowthWeek } from "@/components/growth-week/generate-week";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Field } from "@/components/ui/field";
import { EmptyState, Page, PageHeader, Section } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { getPrisma } from "@/lib/prisma";
import { weekStart } from "@/lib/week";
import Link from "next/link";
import {
  scheduleContentAsset,
  unscheduleContentAsset,
} from "@/app/dashboard/content/actions";

export const metadata = { title: "Growth Week" };
export const dynamic = "force-dynamic";

const DAYS = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const;

const weekFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
});

const chip =
  "rounded-full px-3 py-1.5 text-[0.8125rem] transition-colors duration-200";
const chipActive = "bg-accent-soft font-medium text-accent-ink";
const chipIdle = "text-ink-3 hover:bg-sunken hover:text-ink";

function readParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function toLocalInput(date: Date | null) {
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default async function GrowthWeekPage({
  searchParams,
}: PageProps<"/dashboard/growth-week">) {
  const params = await searchParams;
  const prisma = getPrisma();

  const brands = await prisma.brand.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const brandParam = readParam(params.brand);
  const selected =
    brands.find((brand) => brand.id === brandParam) ?? brands[0] ?? null;

  const start = weekStart(new Date());
  const end = new Date(start);
  end.setDate(end.getDate() + 4);

  const plan = selected
    ? await prisma.growthWeekPlan.findUnique({
        where: { brandId_weekStart: { brandId: selected.id, weekStart: start } },
        include: {
          items: {
            orderBy: { priority: "asc" },
            include: {
              opportunity: { select: { id: true, title: true, source: true } },
              contentAsset: {
                select: {
                  id: true,
                  title: true,
                  status: true,
                  scheduledAt: true,
                },
              },
            },
          },
        },
      })
    : null;

  const items = plan?.items ?? [];

  return (
    <Page>
      <PageHeader
        eyebrow="Plan"
        title="Growth Week"
        description={`The week of ${weekFormat.format(start)} – ${weekFormat.format(end)}: at most five moves, chosen from what already exists.`}
      />

      {brands.length > 1 ? (
        <div className="mt-10 flex flex-wrap items-center gap-1.5">
          {brands.map((brand) => (
            <Link
              key={brand.id}
              href={`/dashboard/growth-week?brand=${brand.id}`}
              aria-current={selected?.id === brand.id ? "true" : undefined}
              className={cn(chip, selected?.id === brand.id ? chipActive : chipIdle)}
            >
              {brand.name}
            </Link>
          ))}
        </div>
      ) : null}

      {selected ? (
        <>
          <Section className="mt-10">
            <div className="border-y border-line py-6">
              <GenerateGrowthWeek
                brandId={selected.id}
                hasPlan={items.length > 0}
                hint={
                  items.length
                    ? `${items.length} action${items.length === 1 ? "" : "s"} planned`
                    : "Uses existing opportunities, drafts and schedule — nothing new is generated."
                }
              />
            </div>
          </Section>

          {items.length ? (
            <Section title="This week" hint="by priority" className="mt-10">
              <div className="grid gap-7">
                {DAYS.filter((day) =>
                  items.some((item) => item.day === day),
                ).map((day) => (
                  <div key={day} className="sm:flex sm:gap-8">
                    <p className="type-meta shrink-0 sm:w-32 sm:pt-1">
                      {day.charAt(0) + day.slice(1).toLowerCase()}
                    </p>

                    <ul className="mt-2 min-w-0 flex-1 space-y-3 sm:mt-0">
                      {items
                        .filter((item) => item.day === day)
                        .map((item) => (
                          <li
                            key={item.id}
                            className="rounded-lg bg-subtle px-4 py-3.5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <p className="text-[0.875rem] font-medium tracking-[-0.01em]">
                                {label(item.action)}
                              </p>
                              <div className="flex shrink-0 items-center gap-2">
                                <Badge
                                  tone={
                                    item.channel === "NONE" ? "muted" : "accent"
                                  }
                                >
                                  {label(item.channel)}
                                </Badge>
                                <span className="type-meta">P{item.priority}</span>
                              </div>
                            </div>

                            <p className="type-body mt-1.5 max-w-2xl text-ink-3">
                              {item.reason}
                            </p>

                            {item.opportunity || item.contentAsset ? (
                              <p className="type-meta mt-2">
                                {item.opportunity
                                  ? `${item.opportunity.title}`
                                  : item.contentAsset?.title ?? ""}
                                {item.contentAsset?.scheduledAt
                                  ? " · already scheduled"
                                  : ""}
                              </p>
                            ) : null}

                            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                              {item.contentAsset ? (
                                <Link
                                  href={`/dashboard/content/${item.contentAsset.id}`}
                                  className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                                >
                                  Open
                                </Link>
                              ) : item.opportunity ? (
                                <Link
                                  href="/dashboard/opportunities"
                                  className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
                                >
                                  Open
                                </Link>
                              ) : null}

                              {item.contentAsset ? (
                                <Disclosure
                                  summary={
                                    item.contentAsset.scheduledAt
                                      ? "Reschedule"
                                      : "Schedule"
                                  }
                                >
                                  <form
                                    action={scheduleContentAsset.bind(
                                      null,
                                      item.contentAsset.id,
                                    )}
                                    className="flex flex-wrap items-end gap-3"
                                  >
                                    <Field
                                      label="Date and time"
                                      name="scheduledAt"
                                      type="datetime-local"
                                      required
                                      defaultValue={toLocalInput(
                                        item.contentAsset.scheduledAt,
                                      )}
                                      className="sm:w-60"
                                    />
                                    <Button type="submit" size="sm">
                                      Save
                                    </Button>
                                    {item.contentAsset.scheduledAt ? (
                                      <Button
                                        type="submit"
                                        size="sm"
                                        variant="ghost"
                                        formNoValidate
                                        formAction={unscheduleContentAsset.bind(
                                          null,
                                          item.contentAsset.id,
                                        )}
                                      >
                                        Unschedule
                                      </Button>
                                    ) : null}
                                  </form>
                                </Disclosure>
                              ) : null}
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          ) : (
            <Section className="mt-10">
              <EmptyState
                title="No plan for this week"
                description="Generate one from the opportunities and drafts already in the workspace."
              />
            </Section>
          )}
        </>
      ) : (
        <Section className="mt-10">
          <EmptyState
            title="No brands yet"
            description="Create a brand first."
          />
        </Section>
      )}
    </Page>
  );
}
