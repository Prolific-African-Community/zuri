import { cn } from "@/lib/cn";
import Link from "next/link";

export type TabItem = {
  label: string;
  value: string;
  count?: number;
  href: string;
};

/**
 * The workflow structure of a list page. Links rather than state, so the tab
 * survives a refresh and can be shared. Filters stay underneath, as refinement.
 */
export function TabNav({ tabs, active }: { tabs: TabItem[]; active: string }) {
  return (
    <div
      role="tablist"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-line pb-px"
    >
      {tabs.map((tab) => {
        const current = tab.value === active;
        return (
          <Link
            key={tab.value}
            href={tab.href}
            role="tab"
            aria-selected={current}
            className={cn(
              "shrink-0 rounded-t-md px-3.5 py-2.5 text-[0.8125rem] transition-colors duration-200",
              current
                ? "border-b-2 border-accent font-medium text-ink"
                : "border-b-2 border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count === undefined ? null : <span
              className={cn(
                "ml-2 tabular-nums",
                current ? "text-accent-ink" : "text-ink-4",
              )}
            >
              {tab.count}
            </span>}
          </Link>
        );
      })}
    </div>
  );
}
