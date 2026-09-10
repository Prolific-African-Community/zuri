"use client";

import {
  generateCoverAction,
  updateArticleImage,
  type ImageState,
} from "@/app/dashboard/content/image-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Panel, Section } from "@/components/ui/layout";
import { cn } from "@/lib/cn";
import { useActionState } from "react";

const initialState: ImageState = { status: "idle", message: "" };

export type ArticleImageView = {
  id: string;
  kind: "COVER" | "INLINE";
  order: number;
  purpose: string;
  insertionPoint: string;
  concept: string;
  alt: string;
  caption: string | null;
  blobUrl: string | null;
  targetPath: string;
  publicPath: string;
};

function Message({ state, pending, busy }: { state: ImageState; pending: boolean; busy: string }) {
  return (
    <p className="type-meta" aria-live="polite">
      {pending ? (
        <span className="text-ink-3">{busy}</span>
      ) : state.message ? (
        <span className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}>
          {state.message}
        </span>
      ) : null}
    </p>
  );
}

function Preview({ image }: { image: ArticleImageView }) {
  if (!image.blobUrl) {
    return <p className="type-meta">Missing — nothing rendered yet.</p>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image.blobUrl}
      alt={image.alt || "Generated image"}
      className="w-full rounded-lg border border-line"
    />
  );
}

function Meta({ image }: { image: ArticleImageView }) {
  return (
    <dl className="mt-3 grid gap-1.5">
      <div className="sm:flex sm:gap-4">
        <dt className="type-label shrink-0 sm:w-24">Public path</dt>
        <dd className="type-meta break-all">{image.publicPath}</dd>
      </div>
      <div className="sm:flex sm:gap-4">
        <dt className="type-label shrink-0 sm:w-24">Target path</dt>
        <dd className="type-meta break-all">{image.targetPath || "—"}</dd>
      </div>
    </dl>
  );
}

function EditFields({ image }: { image: ArticleImageView }) {
  return (
    <form
      action={updateArticleImage.bind(null, image.id)}
      className="mt-4 grid gap-4 border-t border-line pt-4"
    >
      <Field label="Alt text" name="alt" defaultValue={image.alt} autoComplete="off" />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" size="sm">
          Save
        </Button>
      </div>
    </form>
  );
}

export function ArticleImages({
  contentAssetId,
  images,
}: {
  contentAssetId: string;
  images: ArticleImageView[];
}) {
  const [coverState, coverAction, coverPending] = useActionState(
    generateCoverAction,
    initialState,
  );
  const cover = images.find((image) => image.kind === "COVER") ?? null;
  return (
    <>
      <Section title="Article banner" hint="one per article, panoramic">
        <Panel>
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone={cover?.blobUrl ? "accent" : "muted"}>
              {cover?.blobUrl ? "generated" : "missing"}
            </Badge>
          </div>

          {cover ? (
            <div className="mt-4">
              {cover.concept ? (
                <p className="type-body max-w-2xl text-ink-2">{cover.concept}</p>
              ) : null}
              <div className="mt-4">
                <Preview image={cover} />
              </div>
              <Meta image={cover} />
            </div>
          ) : (
            <p className="type-meta mt-4">
              No banner yet. The article stays valid without one.
            </p>
          )}

          <form
            action={coverAction}
            className="mt-4 flex flex-wrap items-center gap-3"
          >
            <input type="hidden" name="contentAssetId" value={contentAssetId} />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={coverPending}
            >
              {coverPending
                ? "Drawing…"
                : cover?.blobUrl
                  ? "Regenerate banner"
                  : "Generate banner"}
            </Button>
            <Message
              state={coverState}
              pending={coverPending}
              busy="Art-directing, then rendering the banner…"
            />
          </form>

          {cover ? <EditFields image={cover} /> : null}
        </Panel>
      </Section>
    </>
  );
}
