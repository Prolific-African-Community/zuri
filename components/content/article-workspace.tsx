"use client";

import { cn } from "@/lib/cn";
import { useState, type ReactNode } from "react";

const TABS = ["Write", "Media", "SEO", "Publish"] as const;
type Tab = (typeof TABS)[number];

/**
 * Four panels instead of one endless page. The panels are rendered on the
 * server and handed in as children; this component only decides which is shown.
 */
export function ArticleWorkspace({
  write,
  media,
  seo,
  publish,
}: {
  write: ReactNode;
  media: ReactNode;
  seo: ReactNode;
  publish: ReactNode;
}) {
  const [active, setActive] = useState<Tab>("Write");

  const panels: Record<Tab, ReactNode> = { Write: write, Media: media, SEO: seo, Publish: publish };

  return (
    <div className="mt-10">
      <div
        role="tablist"
        aria-label="Article"
        className="-mx-1 flex gap-1 overflow-x-auto border-b border-line pb-px"
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={active === tab}
            onClick={() => setActive(tab)}
            className={cn(
              "shrink-0 rounded-t-md px-3.5 py-2.5 text-[0.8125rem] transition-colors duration-200",
              active === tab
                ? "border-b-2 border-accent font-medium text-ink"
                : "border-b-2 border-transparent text-ink-3 hover:text-ink",
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="pt-8">
        {panels[active]}
      </div>
    </div>
  );
}
