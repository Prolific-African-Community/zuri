"use client";

import {
  markAdsExecutedExternally,
  proposeAdsRecommendation,
  type AdsProposalState,
} from "@/app/dashboard/ads/proposal-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Section } from "@/components/ui/layout";
import { briefToText, buildExecutionBrief } from "@/lib/ads-brief";
import type { AdsRecommendation } from "@/lib/ads-recommendations";
import { cn } from "@/lib/cn";
import { useActionState, useState } from "react";

const initialState: AdsProposalState = { status: "idle", message: "" };

const GROUPS: { key: AdsRecommendation["group"]; title: string; hint: string }[] = [
  { key: "HIGH", title: "High priority", hint: "money or reach at stake now" },
  { key: "OPPORTUNITY", title: "Opportunities", hint: "worth testing" },
  { key: "WATCH", title: "Watch", hint: "diagnosis, no change proposed" },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="sm:flex sm:gap-6">
      <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">{label}</dt>
      <dd className="type-body mt-1 text-ink-2 sm:mt-0">{value}</dd>
    </div>
  );
}

function Recommendation({
  brandId,
  brandName,
  customerId,
  item,
}: {
  brandId: string;
  brandName: string;
  customerId: string;
  item: AdsRecommendation;
}) {
  const [state, formAction, pending] = useActionState(
    proposeAdsRecommendation,
    initialState,
  );
  const [externalState, externalAction, externalPending] = useActionState(
    markAdsExecutedExternally,
    initialState,
  );
  const [copied, setCopied] = useState(false);

  // Only the four supported changes are executed by Zuri; the rest is a brief.
  const direct = Boolean(item.actionType);
  const sections = buildExecutionBrief(item, {
    brandName,
    customerId,
    objective: item.expectedImpact,
  });

  async function copyBrief() {
    try {
      await navigator.clipboard.writeText(briefToText(item.title, sections));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <li className="py-5 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <p className="min-w-0 text-[0.9375rem] font-medium tracking-[-0.01em]">
          {item.title}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={direct ? "accent" : "muted"}>
            {direct ? "direct action available" : "external execution brief"}
          </Badge>
          {item.actionType ? (
            <Badge tone="neutral">
              {item.actionType.toLowerCase().replace(/_/g, " ")}
            </Badge>
          ) : null}
          <Badge tone={item.risk === "HIGH" ? "accent" : "muted"}>
            {item.risk.toLowerCase()} risk
          </Badge>
        </div>
      </div>

      <dl className="mt-3 grid max-w-3xl gap-2.5">
        <Row label="What" value={item.what} />
        <Row label="Why" value={item.why} />
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">Evidence</dt>
          <dd className="type-meta mt-1 sm:mt-0">{item.evidence}</dd>
        </div>
        <Row label="Expected impact" value={item.expectedImpact} />
        <Row label="Next step" value={item.next} />
      </dl>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {direct ? (
          <form action={formAction} className="flex flex-wrap items-center gap-3">
            <input type="hidden" name="brandId" value={brandId} />
            <input type="hidden" name="key" value={item.key} />
            <Button type="submit" variant="secondary" size="sm" disabled={pending}>
              {pending ? "Proposing…" : "Propose this action"}
            </Button>
          </form>
        ) : null}

        <Button type="button" variant="ghost" size="sm" onClick={copyBrief}>
          {copied ? "Copied" : "Copy execution brief"}
        </Button>

        <form action={externalAction}>
          <input type="hidden" name="brandId" value={brandId} />
          <input type="hidden" name="key" value={item.key} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={externalPending}
          >
            {externalPending ? "Recording…" : "Mark as executed externally"}
          </Button>
        </form>

        <p className="type-meta" aria-live="polite">
          {[state, externalState].find((entry) => entry.message)?.message ? (
            <span
              className={cn(
                [state, externalState].find((entry) => entry.message)?.status ===
                  "error"
                  ? "text-ink-2"
                  : "text-accent-ink",
              )}
            >
              {[state, externalState].find((entry) => entry.message)?.message}
            </span>
          ) : (
            <span className="text-ink-4">
              {direct
                ? "Zuri can apply this one after approval."
                : "Zuri writes the brief; the change is made in Google Ads."}
            </span>
          )}
        </p>
      </div>

      <details className="mt-3">
        <summary className="type-label cursor-pointer select-none">
          Execution brief
        </summary>
        <div className="mt-3 grid max-w-3xl gap-2.5">
          {sections.map((section) => (
            <div key={section.label} className="sm:flex sm:gap-6">
              <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">
                {section.label}
              </dt>
              <dd className="mt-1 sm:mt-0">
                {section.lines.map((line, index) => (
                  <p key={index} className="type-meta">
                    {line}
                  </p>
                ))}
              </dd>
            </div>
          ))}
        </div>
      </details>
    </li>
  );
}

export function AdsRecommendations({
  brandId,
  brandName,
  customerId,
  recommendations,
  hasData,
}: {
  brandId: string;
  brandName: string;
  customerId: string;
  recommendations: AdsRecommendation[];
  hasData: boolean;
}) {
  return (
    <Section
      title="Recommendations"
      hint={recommendations.length ? `${recommendations.length} items` : undefined}
      className="mt-10"
    >
      {recommendations.length ? (
        <div className="grid gap-8">
          {GROUPS.map((group) => {
            const items = recommendations.filter((item) => item.group === group.key);
            if (!items.length) return null;
            return (
              <div key={group.key}>
                <p className="type-label">
                  {group.title}
                  <span className="ml-2 text-ink-4">{group.hint}</span>
                </p>
                <ul className="mt-3 divide-y divide-line">
                  {items.map((item) => (
                    <Recommendation
                      key={item.key}
                      brandId={brandId}
                      brandName={brandName}
                      customerId={customerId}
                      item={item}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={hasData ? "Nothing to recommend" : "Not enough data"}
          description={
            hasData
              ? "No query, keyword or campaign in this window meets the evidence needed for a recommendation."
              : "Sync Google Ads for this brand first. Zuri recommends nothing without numbers."
          }
        />
      )}
    </Section>
  );
}
