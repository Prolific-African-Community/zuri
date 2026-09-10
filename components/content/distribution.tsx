"use client";

import {
  approveContentAsset,
  updateContentAsset,
} from "@/app/dashboard/content/actions";
import {
  generateBusinessPost,
  type DistributionState,
} from "@/app/dashboard/content/distribution-actions";
import {
  publishToGoogleBusiness,
  verifyGoogleBusinessPost,
} from "@/app/dashboard/content/google-business-actions";
import { MetaIdeas } from "@/components/content/meta-ideas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useActionState, useState } from "react";

const initialState: DistributionState = { status: "idle", message: "" };

export type BusinessPostView = {
  id: string;
  title: string | null;
  content: string;
  status: string;
  googlePostName: string | null;
  googlePublishedAt: string | null;
  googleError: string | null;
};

/** Publication is its own step: approved is not published. */
function PublishToGoogle({
  post,
  location,
}: {
  post: BusinessPostView;
  location: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    publishToGoogleBusiness,
    initialState,
  );
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyGoogleBusinessPost,
    initialState,
  );

  if (post.googlePostName) {
    return (
      <div className="mt-4 border-t border-line pt-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge tone="accent">published on google business</Badge>
          <span className="type-meta">{location ?? "location unknown"}</span>
        </div>
        <dl className="mt-3 grid gap-1.5">
          <p className="type-meta break-all">Post: {post.googlePostName}</p>
          {post.googlePublishedAt ? (
            <p className="type-meta">Published {post.googlePublishedAt.slice(0, 19)}</p>
          ) : null}
        </dl>
        <form action={verifyAction} className="mt-3 flex flex-wrap items-center gap-3">
          <input type="hidden" name="postId" value={post.id} />
          <Button type="submit" variant="ghost" size="sm" disabled={verifying}>
            {verifying ? "Reading Google…" : "Check on Google"}
          </Button>
          <p className="type-meta" aria-live="polite">
            {verifyState.message ? (
              <span
                className={cn(
                  verifyState.status === "error" ? "text-ink-2" : "text-accent-ink",
                )}
              >
                {verifyState.message}
              </span>
            ) : null}
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      {location ? null : (
        <p className="type-meta mb-3 text-ink-2">
          No Google Business Profile location selected for this brand.
        </p>
      )}
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="postId" value={post.id} />
        <Button
          type="submit"
          size="sm"
          disabled={pending || !location || post.status !== "APPROVED"}
        >
          {pending ? "Publishing…" : "Publish to Google"}
        </Button>
        <p className="type-meta" aria-live="polite">
          {pending ? (
            <span className="text-ink-3">Posting to {location ?? "the location"}…</span>
          ) : state.message || post.googleError ? (
            <span
              className={cn(
                state.status === "error" || (!state.message && post.googleError)
                  ? "text-ink-2"
                  : "text-accent-ink",
              )}
            >
              {state.message || post.googleError}
            </span>
          ) : post.status === "APPROVED" ? (
            <span className="text-ink-4">
              Posts once, to the selected location. Nothing else.
            </span>
          ) : (
            <span className="text-ink-4">Approve the post to publish it.</span>
          )}
        </p>
      </form>
    </div>
  );
}

/**
 * Amplification of a published article. Zuri writes the post and keeps it as a
 * draft; nothing is sent to Google Business Profile from here.
 */
export function Distribution({
  assetId,
  post,
  targetUrl,
  bannerUrl,
  location,
  brandId,
  opportunityId,
}: {
  assetId: string;
  post: BusinessPostView | null;
  targetUrl: string | null;
  bannerUrl: string | null;
  location: string | null;
  brandId: string;
  opportunityId: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    generateBusinessPost,
    initialState,
  );
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!post) return;
    try {
      await navigator.clipboard.writeText(post.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <p className="type-label">Distribution</p>
        <Badge tone="muted">google business</Badge>
        {post ? (
          <Badge tone={post.status === "APPROVED" ? "accent" : "neutral"}>
            {post.status.toLowerCase()}
          </Badge>
        ) : null}
      </div>

      <dl className="mt-3 grid max-w-3xl gap-2">
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">Target URL</dt>
          <dd className="type-meta mt-1 break-all sm:mt-0">
            {targetUrl ?? "Not published yet."}
          </dd>
        </div>
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">Location</dt>
          <dd className="type-meta mt-1 sm:mt-0">
            {location ?? "No Google Business Profile location selected for this brand."}
          </dd>
        </div>
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-32 sm:pt-0.5">Image</dt>
          <dd className="mt-1 sm:mt-0">
            {bannerUrl ? (
              <>
                <p className="type-meta">Article banner available.</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={bannerUrl}
                  alt="Article banner"
                  className="mt-2 w-48 rounded-lg border border-line"
                />
              </>
            ) : (
              <p className="type-meta">No image.</p>
            )}
          </dd>
        </div>
      </dl>

      <form action={formAction} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="assetId" value={assetId} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending
            ? "Writing…"
            : post
              ? "Regenerate Google Business post"
              : "Generate Google Business post"}
        </Button>
        <p className="type-meta" aria-live="polite">
          {pending ? (
            <span className="text-ink-3">Writing a short post from the article…</span>
          ) : state.message ? (
            <span
              className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
            >
              {state.message}
            </span>
          ) : (
            <span className="text-ink-4">
              Drafted in Zuri. Nothing is sent to Google Business Profile.
            </span>
          )}
        </p>
      </form>

      {post ? (
        <div className="mt-4">
          <form
            action={updateContentAsset.bind(null, post.id)}
            className="grid max-w-2xl gap-3"
          >
            <input type="hidden" name="title" value={post.title ?? ""} />
            <TextArea
              label="Post"
              name="content"
              rows={7}
              defaultValue={post.content}
              hint={`${post.content.length} characters`}
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant="secondary" size="sm">
                Save
              </Button>
            </div>
          </form>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {post.status === "APPROVED" ? null : (
              <form action={approveContentAsset.bind(null, post.id)}>
                <Button type="submit" size="sm">
                  Approve
                </Button>
              </form>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={copy}>
              {copied ? "Copied" : "Copy post"}
            </Button>
            <Link
              href={`/dashboard/content/${post.id}`}
              className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
            >
              Open in Content
            </Link>
          </div>

          <PublishToGoogle post={post} location={location} />
        </div>
      ) : null}

      <div className="mt-6 border-t border-line pt-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="type-label">Meta</p>
          <Badge tone="muted">facebook · instagram</Badge>
        </div>
        <MetaIdeas brandId={brandId} opportunityId={opportunityId} assetId={assetId} />
      </div>
    </div>
  );
}
