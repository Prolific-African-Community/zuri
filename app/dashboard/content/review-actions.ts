"use server";

import { ArticleReviewStatus } from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { buildPublishingPackage } from "@/lib/publishing-package";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type ReviewState = { status: "idle" | "done" | "error"; message: string };

/**
 * Any edit to the article, its metadata or its images drops it back to draft:
 * the review approved a specific state, not a title.
 */
export async function resetReview(contentAssetId: string) {
  const prisma = getPrisma();
  await Promise.all([
    // An approved-but-unpublished article goes back to being a draft.
    prisma.articleDraft
      .updateMany({
        where: { contentAssetId, reviewStatus: ArticleReviewStatus.READY_FOR_REVIEW },
        data: { reviewStatus: ArticleReviewStatus.DRAFT },
      })
      .catch(() => undefined),
    // A published one is not un-published by an edit — it is now out of date.
    prisma.articleDraft
      .updateMany({
        where: { contentAssetId, reviewStatus: ArticleReviewStatus.PUBLISHED },
        data: { reviewStatus: ArticleReviewStatus.NEEDS_UPDATE },
      })
      .catch(() => undefined),
  ]);
}

export async function markReadyForReview(
  _prevState: ReviewState,
  formData: FormData,
): Promise<ReviewState> {
  await requireSession();

  const contentAssetId = String(formData.get("contentAssetId") ?? "").trim();
  if (!contentAssetId) return { status: "error", message: "Missing article." };

  const prisma = getPrisma();
  const asset = await prisma.contentAsset.findUnique({
    where: { id: contentAssetId },
    include: {
      brand: true,
      articleDraft: { include: { imageAssets: { orderBy: { order: "asc" } } } },
    },
  });
  if (!asset?.articleDraft) {
    return { status: "error", message: "This asset is not an article." };
  }

  // The gate is re-run server-side: a stale page must never let it through.
  const pkg = buildPublishingPackage({
    brand: asset.brand,
    asset,
    draft: asset.articleDraft,
    images: asset.articleDraft.imageAssets,
  });
  if (!pkg.ready) {
    return {
      status: "error",
      message: `Still blocked: ${pkg.errors[0]}`,
    };
  }

  await prisma.articleDraft.update({
    where: { id: asset.articleDraft.id },
    data: { reviewStatus: ArticleReviewStatus.READY_FOR_REVIEW },
  });

  revalidatePath(`/dashboard/content/${contentAssetId}`);
  revalidatePath("/dashboard/content");
  return { status: "done", message: "Ready for review." };
}

export async function returnToDraft(contentAssetId: string) {
  await requireSession();

  await getPrisma().articleDraft.updateMany({
    where: { contentAssetId },
    data: { reviewStatus: ArticleReviewStatus.DRAFT },
  });

  revalidatePath(`/dashboard/content/${contentAssetId}`);
  revalidatePath("/dashboard/content");
}
