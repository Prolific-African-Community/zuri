import { unscheduleContentAsset } from "@/app/dashboard/content/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Page, PageHeader, Section } from "@/components/ui/layout";
import { getPrisma } from "@/lib/prisma";
import Link from "next/link";

export const metadata = { title: "Calendar" };
export const dynamic = "force-dynamic";

const dayFormat = new Intl.DateTimeFormat("en", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

const timeFormat = new Intl.DateTimeFormat("en", {
  hour: "2-digit",
  minute: "2-digit",
});

const weekFormat = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "short",
});

/** Monday of the week containing `date`, at local midnight. */
function weekStart(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const day = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - day);
  return start;
}

export default async function CalendarPage() {
  const assets = await getPrisma().contentAsset.findMany({
    where: { scheduledAt: { not: null }, status: { not: "ARCHIVED" } },
    orderBy: { scheduledAt: "asc" },
    include: {
      brand: { select: { name: true } },
      visualAsset: { select: { type: true, imageUrl: true } },
    },
  });

  // Group by week, then by day — plain grouping, no calendar library.
  const weeks = new Map<number, Map<number, typeof assets>>();
  for (const asset of assets) {
    const scheduled = asset.scheduledAt!;
    const week = weekStart(scheduled).getTime();
    const day = new Date(scheduled).setHours(0, 0, 0, 0);
    const days = weeks.get(week) ?? new Map();
    days.set(day, [...(days.get(day) ?? []), asset]);
    weeks.set(week, days);
  }

  const currentWeek = weekStart(new Date()).getTime();

  return (
    <Page>
      <PageHeader
        eyebrow="Plan"
        title="Calendar"
        description="Everything with a date, week by week. Scheduling here changes nothing else — nothing publishes on its own."
      />

      <Section
        title="Scheduled"
        hint={assets.length === 1 ? "1 asset" : `${assets.length} assets`}
        className="mt-12"
      >
        {weeks.size ? (
          <div className="grid gap-12">
            {[...weeks.entries()].map(([week, days]) => {
              const start = new Date(week);
              const end = new Date(week);
              end.setDate(end.getDate() + 6);

              return (
                <div key={week}>
                  <div className="flex items-baseline gap-3 border-b border-line pb-3">
                    <h3 className="type-section-title">
                      {weekFormat.format(start)} – {weekFormat.format(end)}
                    </h3>
                    {week === currentWeek ? (
                      <Badge tone="accent">This week</Badge>
                    ) : null}
                  </div>

                  <div className="mt-5 grid gap-7">
                    {[...days.entries()].map(([day, items]) => (
                      <div key={day} className="sm:flex sm:gap-8">
                        <p className="type-meta shrink-0 sm:w-48 sm:pt-1">
                          {dayFormat.format(new Date(day))}
                        </p>
                        <ul className="mt-2 min-w-0 flex-1 space-y-3 sm:mt-0">
                          {items.map((asset) => (
                            <li
                              key={asset.id}
                              className="rounded-lg bg-subtle px-4 py-3 transition-colors duration-200 hover:bg-sunken"
                            >
                              <div className="flex flex-wrap items-baseline justify-between gap-3">
                                <Link
                                  href={`/dashboard/content/${asset.id}`}
                                  className="text-[0.875rem] font-medium tracking-[-0.01em] transition-colors hover:text-accent-ink"
                                >
                                  {asset.title ?? "Untitled draft"}
                                </Link>
                                <span className="type-meta">
                                  {timeFormat.format(asset.scheduledAt!)}
                                </span>
                              </div>

                              <p className="type-meta mt-1">
                                {asset.brand.name} ·{" "}
                                {asset.channel.toLowerCase()} ·{" "}
                                {asset.status.toLowerCase()}
                                {asset.visualAsset?.imageUrl ? " · visual" : ""}
                              </p>

                              <form
                                action={unscheduleContentAsset.bind(null, asset.id)}
                                className="mt-1"
                              >
                                <Button type="submit" variant="ghost" size="sm">
                                  Unschedule
                                </Button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="Nothing scheduled"
            description="Give a piece of content a date from the library and it appears here."
          />
        )}
      </Section>
    </Page>
  );
}
