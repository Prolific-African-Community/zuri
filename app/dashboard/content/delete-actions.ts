"use server";

import { ArticleReviewStatus } from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type DeleteState = { status: "idle" | "error"; message: string };

const PUBLISHED_STATES: ArticleReviewStatus[] = [
  ArticleReviewStatus.PUBLISHED,
  ArticleReviewStatus.NEEDS_UPDATE,
];

/**
 * Removes an article from Zuri only. It never touches the brand's repository,
 * never opens a deletion PR, and never takes a live page down.
 */
export async function deleteArticle(
  assetId: string,
  _prevState: DeleteState,
  formData: FormData,
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

  const published =
    PUBLISHED_STATES.includes(draft.reviewStatus) || draft.publications.length > 0;

  // A live article needs a second, explicit yes.
  if (published && String(formData.get("confirmPublished") ?? "") !== "yes") {
    return {
      status: "error",
      message:
        "This article is published. Deleting it from Zuri will not remove the live article.",
    };
  }

  // Blobs are only reclaimed for something that never went out; keeping an
  // orphan is cheaper than breaking a page that is online.
  const blobUrls = published
    ? []
    : draft.imageAssets
        .map((image) => image.blobUrl)
        .filter((url): url is string => Boolean(url));

  // ArticleDraft, its images and its publication history cascade from here.
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
