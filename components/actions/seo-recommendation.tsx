"use client";

import { markActionImplemented } from "@/app/dashboard/actions/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { briefToText, type BriefSection } from "@/lib/seo-implementation";
import { useState } from "react";

export type SeoHistory = {
  branch: string | null;
  prNumber: number | null;
  prUrl: string | null;
};

/**
 * A SEO recommendation is advice, not an operation. Zuri writes the brief; the
 * change is made outside Zuri and confirmed here afterwards.
 */
export function SeoRecommendation({
  actionId,
  title,
  sections,
  status,
  implementedManually,
  history,
}: {
  actionId: string;
  title: string;
  sections: BriefSection[];
  status: string;
  implementedManually: boolean;
  history: SeoHistory;
}) {
  const [copied, setCopied] = useState(false);
  const done = status === "EXECUTED" || status === "MEASURED";

  async function copy() {
    try {
      await navigator.clipboard.writeText(briefToText(title, sections));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <dl className="grid max-w-3xl gap-3">
        {sections.map((section) => (
          <div key={section.label} className="sm:flex sm:gap-6">
            <dt className="type-label shrink-0 sm:w-40 sm:pt-0.5">{section.label}</dt>
            <dd className="mt-1 sm:mt-0">
              {section.lines.map((line, index) => (
                <p
                  key={`${section.label}-${index}`}
                  className="type-body whitespace-pre-wrap text-ink-2"
                >
                  {line}
                </p>
              ))}
            </dd>
          </div>
        ))}
      </dl>

      {done ? (
        <p className="type-meta mt-4">
          <Badge tone="accent">
            {implementedManually ? "implemented manually" : "done"}
          </Badge>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={copy}>
          {copied ? "Copied" : "Copy implementation brief"}
        </Button>

        {done ? null : (
          <form action={markActionImplemented.bind(null, actionId)}>
            <Button type="submit" variant="secondary" size="sm">
              Mark as implemented
            </Button>
          </form>
        )}

        <span className="type-meta text-ink-4">
          Zuri does not change the site. Make the change, then confirm it here — the
          next crawl will show it.
        </span>
      </div>

      {history.prNumber || history.branch ? (
        <p className="type-meta mt-4 text-ink-4">
          History:{" "}
          {history.prUrl ? (
            <a
              href={history.prUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md text-accent-ink transition-colors hover:text-accent-strong"
            >
              pull request #{history.prNumber}
            </a>
          ) : (
            `pull request #${history.prNumber}`
          )}
          {history.branch ? ` · branch ${history.branch}` : ""} — created by an earlier
          version of Zuri and left untouched.
        </p>
      ) : null}
    </div>
  );
}
