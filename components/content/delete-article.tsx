"use client";

import {
  deleteArticle,
  type DeleteState,
} from "@/app/dashboard/content/delete-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState, useState } from "react";

const initialState: DeleteState = { status: "idle", message: "" };

export function DeleteArticle({
  assetId,
  title,
  reviewStatus,
  published,
}: {
  assetId: string;
  title: string;
  reviewStatus: string;
  published: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    deleteArticle.bind(null, assetId),
    initialState,
  );
  const [asking, setAsking] = useState(false);
  const blocked = reviewStatus === "PR_OPENED";

  if (!asking) {
    return (
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(true)}>
          Delete article
        </Button>
        <span className="type-meta text-ink-4">
          Removes it from Zuri only.
        </span>
      </div>
    );
  }

  return (
    <div className="mt-8 border-t border-line pt-6">
      <p className="type-body text-ink-2">
        Delete <span className="font-medium text-ink">{title}</span>?
      </p>
      <p className="type-meta mt-2">
        Deleting it here removes the draft, its banner and its publishing history
        from Zuri. It does not remove anything already published on the site.
      </p>

      {blocked ? (
        <p className="type-body mt-4 max-w-xl text-ink-2">
          This article has an open publishing PR. Close or resolve it before
          deleting.
        </p>
      ) : null}

      {published && !blocked ? (
        <p className="type-body mt-4 max-w-xl text-ink-2">
          This article is published. Deleting it from Zuri will not remove the live
          article.
        </p>
      ) : null}

      <form action={formAction} className="mt-5 flex flex-wrap items-center gap-3">
        {published ? (
          <input type="hidden" name="confirmPublished" value="yes" />
        ) : null}
        <Button type="submit" size="sm" disabled={pending || blocked}>
          {pending
            ? "Deleting…"
            : published
              ? "Delete anyway"
              : "Delete article"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAsking(false)}
        >
          Cancel
        </Button>
        <p className="type-meta" aria-live="polite">
          {state.message ? (
            <span className={cn("text-ink-2")}>{state.message}</span>
          ) : null}
        </p>
      </form>
    </div>
  );
}
