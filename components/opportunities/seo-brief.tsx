"use client";

import {
  generateSeoBriefAction,
  generateSeoContentAction,
  type BriefState,
} from "@/app/dashboard/opportunities/brief-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useActionState } from "react";

const initialState: BriefState = { status: "idle", message: "" };

export type BriefData = {
  objective: string;
  targetKeyword: string | null;
  searchIntent: string | null;
  recommendedAction: string;
  actionJustification: string | null;
  recommendedTitle: string | null;
  recommendedMetaDescription: string | null;
  outline: string[];
  keyQuestions: string[];
  internalLinks: string[];
  competitorInsights: string[];
  evidenceNeeded: string[];
};

function List({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="type-label">{label}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, index) => (
          <li key={`${item}-${index}`} className="type-body text-ink-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type SeoContentAsset = {
  id: string;
  title: string | null;
  content: string;
};

function SeoContent({
  opportunityId,
  asset,
}: {
  opportunityId: string;
  asset: SeoContentAsset | null;
}) {
  const [state, formAction, pending] = useActionState(
    generateSeoContentAction,
    initialState,
  );

  return (
    <div className="border-t border-line pt-5">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Writing…" : asset ? "Regenerate content" : "Generate content"}
        </Button>
        {asset ? (
          <Link
            href={`/dashboard/content/${asset.id}`}
            className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
          >
            Open in Content Library
          </Link>
        ) : null}
        <p className="type-meta" aria-live="polite">
          {pending ? (
            <span className="text-ink-3">Writing the page from the brief…</span>
          ) : state.message ? (
            <span
              className={cn(
                state.status === "error" ? "text-ink-2" : "text-accent-ink",
              )}
            >
              {state.message}
            </span>
          ) : null}
        </p>
      </form>

      {asset ? (
        <div className="mt-4 rounded-lg border border-line bg-surface p-5">
          {asset.title ? (
            <p className="type-section-title">{asset.title}</p>
          ) : null}
          <pre className="type-body mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-ink-2">
            {asset.content}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

export function SeoBrief({
  opportunityId,
  brief,
  contentAsset,
}: {
  opportunityId: string;
  brief: BriefData | null;
  contentAsset: SeoContentAsset | null;
}) {
  const [state, formAction, pending] = useActionState(
    generateSeoBriefAction,
    initialState,
  );

  return (
    <div className="mt-4">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending
            ? "Writing…"
            : brief
              ? "Regenerate brief"
              : "Generate SEO brief"}
        </Button>
        <p className="type-meta" aria-live="polite">
          {pending ? (
            <span className="text-ink-3">
              Reading the target page, the keyword and its live SERP…
            </span>
          ) : state.message ? (
            <span
              className={cn(
                state.status === "error" ? "text-ink-2" : "text-accent-ink",
              )}
            >
              {state.message}
            </span>
          ) : null}
        </p>
      </form>

      {brief ? (
        <div className="mt-5 grid gap-6 rounded-xl border border-line bg-subtle p-6">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <Badge tone="accent">
                {brief.recommendedAction.toLowerCase().replace("_", " ")}
              </Badge>
              {brief.searchIntent ? (
                <span className="type-meta">{brief.searchIntent}</span>
              ) : null}
              {brief.targetKeyword ? (
                <span className="type-meta">· {brief.targetKeyword}</span>
              ) : null}
            </div>
            <p className="type-body mt-3 text-ink-2">{brief.objective}</p>
            {brief.actionJustification ? (
              <p className="type-meta mt-2 text-ink-4">
                {brief.actionJustification}
              </p>
            ) : null}
          </div>

          {brief.recommendedTitle || brief.recommendedMetaDescription ? (
            <div className="border-t border-line pt-5">
              <p className="type-label">Proposed title &amp; meta</p>
              {brief.recommendedTitle ? (
                <p className="type-body mt-2 text-ink-2">
                  {brief.recommendedTitle}
                  <span className="type-meta"> · {brief.recommendedTitle.length} chars</span>
                </p>
              ) : null}
              {brief.recommendedMetaDescription ? (
                <p className="type-meta mt-1.5">
                  {brief.recommendedMetaDescription} ·{" "}
                  {brief.recommendedMetaDescription.length} chars
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-6 border-t border-line pt-5 sm:grid-cols-2">
            <List label="Outline" items={brief.outline} />
            <List label="Key questions" items={brief.keyQuestions} />
            <List label="Competitor insights" items={brief.competitorInsights} />
            <List label="Internal links" items={brief.internalLinks} />
            <List label="Evidence needed" items={brief.evidenceNeeded} />
          </div>

          <SeoContent opportunityId={opportunityId} asset={contentAsset} />
        </div>
      ) : null}
    </div>
  );
}
