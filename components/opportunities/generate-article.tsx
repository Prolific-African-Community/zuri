"use client";

import {
  generateArticleAction,
  type ArticleState,
} from "@/app/dashboard/opportunities/article-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useActionState } from "react";

const initialState: ArticleState = { status: "idle", message: "" };

export function GenerateArticle({
  opportunityId,
  articleAssetId,
  /** The card decides which single action leads; the rest stay secondary. */
  emphasis = "secondary",
}: {
  opportunityId: string;
  articleAssetId: string | null;
  emphasis?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(
    generateArticleAction,
    initialState,
  );

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-center gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <Button
        type="submit"
        variant={emphasis === "primary" ? "primary" : "secondary"}
        size="sm"
        disabled={pending}
      >
        {pending
          ? "Writing…"
          : articleAssetId
            ? "Regenerate article"
            : "Generate article"}
      </Button>
      {articleAssetId ? (
        <Link
          href={`/dashboard/content/${articleAssetId}`}
          className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
        >
          Open the article editor
        </Link>
      ) : null}
      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Writing the article from the brand voice and the brief…
          </span>
        ) : state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : null}
      </p>
    </form>
  );
}
