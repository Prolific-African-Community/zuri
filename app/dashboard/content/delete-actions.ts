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
    include: {
      articleDraft: {
        include: { imageAssets: true, publications: { select: { id: true } } },
      },
    },
  });
  if (!asset) return { status: "error", message: "Article not found." };

  const draft = asset.articleDraft;
  if (!draft) {
    return { status: "error", message: "This asset is not an article." };
  }

  if (draft.reviewStatus === ArticleReviewStatus.PR_OPENED) {
    return {
      status: "error",
      message:
        "This article has an open publishing PR. Close or resolve it before deleting.",
    };
  }

  // Deleting the asset cascades to the draft, its images and its publication
  // history, so anything that ever existed publicly is protected here — the
  // schema cannot express this rule, only the server can.
  const everPublic =
    draft.publicationState !== ArticlePublicationState.NEVER_PUBLISHED ||
    draft.publications.length > 0 ||
    draft.mergedAt !== null ||
    draft.publishedUrl !== null ||
    draft.mergeCommitSha !== null ||
    draft.lastPublishMergeCommitSha !== null ||
    draft.lastUnpublishMergeCommitSha !== null ||
    draft.prNumber !== null ||
    draft.unpublishPrNumber !== null ||
    draft.unpublishRequestedAt !== null ||
    draft.unpublishedAt !== null;

  if (everPublic) {
    return {
      status: "error",
      message:
        "This article has publication history and cannot be permanently deleted. Archive it instead.",
    };
  }

  // Nothing of this article ever went out, so its blobs go with it.
  const blobUrls = draft.imageAssets
    .map((image) => image.blobUrl)
    .filter((url): url is string => Boolean(url));

  // Guarded above: only an article with no public history reaches this line.
  await prisma.contentAsset.delete({ where: { id: assetId } });

  for (const url of blobUrls) {
    try {
      await del(url);
    } catch (error) {
      console.error("Could not delete the blob", url, error);
    }
  }

  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/opportunities");
  redirect("/dashboard/content?deleted=1");
}
