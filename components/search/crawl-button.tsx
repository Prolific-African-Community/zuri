"use client";

import {
  crawlBrandWebsite,
  discoverKeywords,
  generateSeoOpportunitiesAction,
  type CrawlState,
} from "@/app/dashboard/search/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState } from "react";

const initialState: CrawlState = { status: "idle", message: "" };

export function CrawlButton({
  brandId,
  websiteUrl,
  hint,
}: {
  brandId: string;
  websiteUrl: string | null;
  hint?: string;
}) {
  const [state, formAction, pending] = useActionState(
    crawlBrandWebsite,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="brandId" value={brandId} />
      <Button type="submit" size="sm" disabled={pending || !websiteUrl}>
        {pending ? "Crawling…" : "Crawl website"}
      </Button>

      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Following internal links, up to 50 pages…
          </span>
        ) : state.message ? (
          <span
            className={cn(
              state.status === "error" ? "text-ink-2" : "text-accent-ink",
            )}
          >
            {state.message}
          </span>
        ) : (
          <span className="text-ink-4">
            {websiteUrl ?? "No website URL on this brand yet."}
            {websiteUrl && hint ? ` · ${hint}` : ""}
          </span>
        )}
      </p>
    </form>
  );
}

export function DiscoverKeywordsButton({
  brandId,
  hint,
}: {
  brandId: string;
  hint?: string;
}) {
  const [state, formAction, pending] = useActionState(
    discoverKeywords,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="brandId" value={brandId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Researching…" : "Discover keywords"}
      </Button>

      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Proposing seeds, enriching them, then pulling live SERPs…
          </span>
        ) : state.message ? (
          <span
            className={cn(
              state.status === "error" ? "text-ink-2" : "text-accent-ink",
            )}
          >
            {state.message}
          </span>
        ) : hint ? (
          <span className="text-ink-4">{hint}</span>
        ) : null}
      </p>
    </form>
  );
}

export function GenerateSeoOpportunitiesButton({
  brandId,
  hint,
}: {
  brandId: string;
  hint?: string;
}) {
  const [state, formAction, pending] = useActionState(
    generateSeoOpportunitiesAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="brandId" value={brandId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Working…" : "Generate SEO opportunities"}
      </Button>

      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Reading the crawl, the keywords and their SERPs…
          </span>
        ) : state.message ? (
          <span
            className={cn(
              state.status === "error" ? "text-ink-2" : "text-accent-ink",
            )}
          >
            {state.message}
          </span>
        ) : hint ? (
          <span className="text-ink-4">{hint}</span>
        ) : null}
      </p>
    </form>
  );
}
