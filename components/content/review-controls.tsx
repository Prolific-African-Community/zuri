"use client";

import {
  markReadyForReview,
  returnToDraft,
  type ReviewState,
} from "@/app/dashboard/content/review-actions";
import {
  checkProductionStatus,
  checkPublishingStatus,
  createPublishingPr,
  publishArticle,
  publishUpdate,
  refreshPublishingPr,
  returnToReview,
  type PublishState,
} from "@/app/dashboard/content/publish-actions";
import { unpublishArticle } from "@/app/dashboard/content/unpublish-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState, useState } from "react";

const initialState: ReviewState = { status: "idle", message: "" };

export function MarkReadyForReview({
  contentAssetId,
  ready,
  reviewStatus,
}: {
  contentAssetId: string;
  ready: boolean;
  reviewStatus: string;
}) {
  const [state, formAction, pending] = useActionState(
    markReadyForReview,
    initialState,
  );
  const inReview = reviewStatus === "READY_FOR_REVIEW";

  return (
    <div className="mt-5 flex flex-wrap items-center gap-3">
      {inReview ? (
        <form action={returnToDraft.bind(null, contentAssetId)}>
          <Button type="submit" variant="secondary" size="sm">
            Return to draft
          </Button>
        </form>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="contentAssetId" value={contentAssetId} />
          <Button type="submit" size="sm" disabled={!ready || pending}>
            {pending ? "Checking…" : "Mark ready for review"}
          </Button>
        </form>
      )}

      <p className="type-meta" aria-live="polite">
        {state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : inReview ? (
          <span className="text-ink-3">
            Frozen as an intention, not as files — any edit sends it back to draft.
          </span>
        ) : ready ? null : (
          <span className="text-ink-4">Fix the blockers above first.</span>
        )}
      </p>
    </div>
  );
}

const publishInitial: PublishState = { status: "idle", message: "" };

export function CreatePublishingPr({
  contentAssetId,
  ready,
}: {
  contentAssetId: string;
  ready: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createPublishingPr,
    publishInitial,
  );

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <form action={formAction}>
        <input type="hidden" name="contentAssetId" value={contentAssetId} />
        <Button type="submit" size="sm" disabled={!ready || pending}>
          {pending ? "Pushing…" : "Create publishing PR"}
        </Button>
      </form>
      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Creating the branch, writing the files, opening the pull request…
          </span>
        ) : state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : (
          <span className="text-ink-4">
            One branch, one PR. Nothing is merged or deployed.
          </span>
        )}
      </p>
    </div>
  );
}

export function CheckPublishingStatus({
  contentAssetId,
}: {
  contentAssetId: string;
}) {
  const [state, formAction, pending] = useActionState(
    checkPublishingStatus,
    publishInitial,
  );

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <form action={formAction}>
        <input type="hidden" name="contentAssetId" value={contentAssetId} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Reading GitHub…" : "Check publishing status"}
        </Button>
      </form>
      <p className="type-meta" aria-live="polite">
        {state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : (
          <span className="text-ink-4">
            Reads the real pull request. Zuri never merges it.
          </span>
        )}
      </p>
    </div>
  );
}

export function ReturnToReview({ contentAssetId }: { contentAssetId: string }) {
  return (
    <form action={returnToReview.bind(null, contentAssetId)} className="mt-4">
      <Button type="submit" variant="secondary" size="sm">
        Return to review
      </Button>
    </form>
  );
}

/** The one control that matters: publish, without opening GitHub. */
export function PublishArticle({
  contentAssetId,
  ready,
  stale,
  label = "Publish",
}: {
  contentAssetId: string;
  ready: boolean;
  stale: boolean;
  /** "Republish" once the article has already been on the site. */
  label?: string;
}) {
  const [publishState, publishAction, publishing] = useActionState(
    publishArticle,
    publishInitial,
  );
  const [refreshState, refreshAction, refreshing] = useActionState(
    refreshPublishingPr,
    publishInitial,
  );
  const busy = publishing || refreshing;
  const state = publishState.message ? publishState : refreshState;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-3">
        {stale ? (
          <form action={refreshAction}>
            <input type="hidden" name="contentAssetId" value={contentAssetId} />
            <Button type="submit" size="sm" disabled={busy}>
              {refreshing ? "Refreshing…" : "Refresh publishing PR"}
            </Button>
          </form>
        ) : (
          <form action={publishAction}>
            <input type="hidden" name="contentAssetId" value={contentAssetId} />
            <Button type="submit" size="sm" disabled={!ready || busy}>
              {publishing ? `${label}ing…` : label}
            </Button>
          </form>
        )}
      </div>

      <p className="type-meta mt-2" aria-live="polite">
        {publishing ? (
          <span className="text-ink-3">
            Pushing the package, then merging the pull request…
          </span>
        ) : refreshing ? (
          <span className="text-ink-3">Bringing the branch back in line…</span>
        ) : state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : stale ? (
          <span className="text-ink-2">
            Article changed after PR creation — a stale pull request is never merged.
          </span>
        ) : (
          <span className="text-ink-4">
            Publishing merges the pull request into the configured branch.
          </span>
        )}
      </p>
    </div>
  );
}

/** Republishes a live article that has drifted from what is online. */
export function PublishUpdate({ contentAssetId }: { contentAssetId: string }) {
  const [state, formAction, pending] = useActionState(
    publishUpdate,
    publishInitial,
  );

  return (
    <div className="mt-4">
      <form action={formAction}>
        <input type="hidden" name="contentAssetId" value={contentAssetId} />
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Publishing update…" : "Publish update"}
        </Button>
      </form>
      <p className="type-meta mt-2" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Opening a new pull request with the current version, then merging it…
          </span>
        ) : state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : (
          <span className="text-ink-4">
            A new pull request — the merged one is never rewritten.
          </span>
        )}
      </p>
    </div>
  );
}

/** Merged is not live: this asks Vercel whether production actually shipped. */
export function CheckProductionStatus({
  contentAssetId,
}: {
  contentAssetId: string;
}) {
  const [state, formAction, pending] = useActionState(
    checkProductionStatus,
    publishInitial,
  );

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <form action={formAction}>
        <input type="hidden" name="contentAssetId" value={contentAssetId} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Asking Vercel…" : "Check production status"}
        </Button>
      </form>
      <p className="type-meta" aria-live="polite">
        {state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : (
          <span className="text-ink-4">
            Reads the production deployment for the merged commit.
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * Taking an article off the site. Two steps on purpose: the first click only
 * says what will happen, the second one does it.
 */
export function UnpublishArticle({
  assetId,
  publicUrl,
  unpublish,
}: {
  assetId: string;
  publicUrl: string | null;
  unpublish: {
    requestedAt: string | null;
    unpublishedAt: string | null;
    prNumber: number | null;
    prUrl: string | null;
    branch: string | null;
    urlStatus: number | null;
  };
}) {
  const [state, formAction, pending] = useActionState(
    unpublishArticle,
    publishInitial,
  );
  const [asking, setAsking] = useState(false);

  return (
    <div className="mt-4 border-t border-line pt-4">
      {asking ? (
        <>
          <p className="type-body max-w-2xl text-ink-2">
            This article is live. Unpublishing removes it from the website. It
            stays in Zuri, editable and republishable — archiving is separate.
          </p>
          <p className="type-meta mt-1.5">
            {publicUrl ?? "The published URL is unknown."} · the MDX file and its
            banner are deleted through a pull request, then merged and deployed.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <form action={formAction}>
              <input type="hidden" name="assetId" value={assetId} />
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Unpublishing…" : "Unpublish"}
              </Button>
            </form>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setAsking(false)}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(true)}>
          Unpublish
        </Button>
      )}

      <p className="type-meta mt-2" aria-live="polite">
        {state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : unpublish.requestedAt ? (
          <span className="text-ink-2">
            Removal merged in #{unpublish.prNumber} — check the production status to
            confirm the page is gone.
          </span>
        ) : null}
      </p>
    </div>
  );
}
