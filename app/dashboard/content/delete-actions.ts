"use server";

import {
  ArticlePublicationState,
  ArticleReviewStatus,
} from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type DeleteState = { status: "idle" | "error"; message: string };

/**
 * Why this content may not be permanently deleted, or null when it may.
 * Deleting a ContentAsset cascades to its draft, images, creative and
 * publication history, so anything that ever existed outside Zuri is refused
 * here — the schema cannot express the rule, only the server can.
 */
function deletionBlocker(asset: {
  googleBusinessPublishedAt: Date | null;
  googleBusinessPostName: string | null;
  articleDraft:
    | {
        publicationState: ArticlePublicationState;
        reviewStatus: ArticleReviewStatus;
        mergedAt: Date | null;
        publishedUrl: string | null;
        mergeCommitSha: string | null;
        lastPublishMergeCommitSha: string | null;
        lastUnpublishMergeCommitSha: string | null;
        prNumber: number | null;
        unpublishPrNumber: number | null;
        unpublishRequestedAt: Date | null;
        unpublishedAt: Date | null;
        publications: { id: string }[];
      }
    | null
    | undefined;
}): string | null {
  const draft = asset.articleDraft;

  if (draft?.reviewStatus === ArticleReviewStatus.PR_OPENED) {
    return "This article has an open publishing PR. Close or resolve it before deleting.";
  }

  if (
    draft &&
    (draft.publicationState !== ArticlePublicationState.NEVER_PUBLISHED ||
      draft.publications.length > 0 ||
      draft.mergedAt !== null ||
      draft.publishedUrl !== null ||
      draft.mergeCommitSha !== null ||
      draft.lastPublishMergeCommitSha !== null ||
      draft.lastUnpublishMergeCommitSha !== null ||
      draft.prNumber !== null ||
      draft.unpublishPrNumber !== null ||
      draft.unpublishRequestedAt !== null ||
      draft.unpublishedAt !== null)
  ) {
    return "This article has publication history and cannot be permanently deleted. Archive it instead.";
  }

  // The Google Business post name is the only record of what went out; losing
  // it would lose the trace of a real external publication.
  if (asset.googleBusinessPublishedAt || asset.googleBusinessPostName) {
    return "This post was published to Google Business Profile and cannot be permanently deleted. Archive it instead.";
  }

  return null;
}

const DELETE_INCLUDE = {
  visualAsset: true,
  metaCreative: true,
  articleDraft: {
    include: { imageAssets: true, publications: { select: { id: true } } },
  },
} as const;

/** Blobs owned by this content alone; shared assets are never touched. */
function ownedBlobs(asset: {
  visualAsset: { imageUrl: string | null } | null;
  metaCreative: { imageUrl: string | null } | null;
  articleDraft: { imageAssets: { blobUrl: string | null }[] } | null;
}) {
  return [
    asset.visualAsset?.imageUrl,
    asset.metaCreative?.imageUrl,
    ...(asset.articleDraft?.imageAssets ?? []).map((image) => image.blobUrl),
  ].filter((url): url is string => Boolean(url));
}

async function dropBlobs(urls: string[]) {
  for (const url of urls) {
    try {
      await del(url);
    } catch (error) {
      console.error("Could not delete the blob", url, error);
    }
  }
}

/**
 * Permanent deletion for any content. Archiving is the reversible act; this
 * one is not, so every guard runs on the server before anything is removed.
 */
export async function deleteContentAsset(
  assetId: string,
  _prevState: DeleteState,
  _formData: FormData,
): Promise<DeleteState> {
  await requireSession();

  const prisma = getPrisma();
  const asset = await prisma.contentAsset.findUnique({
    where: { id: assetId },
    include: DELETE_INCLUDE,
  });
  if (!asset) return { status: "error", message: "Content not found." };

  const blocker = deletionBlocker(asset);
  if (blocker) return { status: "error", message: blocker };

  const blobUrls = ownedBlobs(asset);
  await prisma.contentAsset.delete({ where: { id: assetId } });
  await dropBlobs(blobUrls);

  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/opportunities");
  return { status: "idle", message: "" };
}

/**
 * Removes an article from Zuri only. It never touches the brand's repository,
 * never opens a deletion PR, and never takes a live page down.
 */
export async function deleteArticle(
  assetId: string,
  _prevState: DeleteState,
  _formData: FormData,
): Promise<DeleteState> {
  await requireSession();

  const prisma = getPrisma();
  const asset = await prisma.contentAsset.findUnique({
    where: { id: assetId },
    include: DELETE_INCLUDE,
  });
  if (!asset) return { status: "error", message: "Article not found." };

  if (!asset.articleDraft) {
    return { status: "error", message: "This asset is not an article." };
  }

  const blocker = deletionBlocker(asset);
  if (blocker) return { status: "error", message: blocker };

  // Nothing of this article ever went out, so its blobs go with it.
  const blobUrls = ownedBlobs(asset);
  await prisma.contentAsset.delete({ where: { id: assetId } });
  await dropBlobs(blobUrls);

  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/opportunities");
  redirect("/dashboard/content?deleted=1");
}
