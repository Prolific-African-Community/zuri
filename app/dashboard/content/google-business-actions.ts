"use server";

import { ContentChannel, ContentStatus } from "@/lib/generated/prisma/enums";
import { getConnection, hasBusinessScope } from "@/lib/google";
import { createLocalPost, getLocalPost } from "@/lib/google-business";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type PublishState = { status: "idle" | "done" | "error"; message: string };

const NO_LOCATION = "No Google Business Profile location selected for this brand.";

/** The article this post amplifies, found through the shared opportunity. */
async function sourceArticle(brandId: string, opportunityId: string | null) {
  if (!opportunityId) return null;
  return getPrisma().contentAsset.findFirst({
    where: { brandId, opportunityId, channel: ContentChannel.WEBSITE },
    include: { articleDraft: { include: { imageAssets: true } } },
  });
}

/**
 * Publishes one approved post to one location. Explicit click only, one
 * location only, and never anything but a standard update.
 */
export async function publishToGoogleBusiness(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  await requireSession();

  const postId = String(formData.get("postId") ?? "").trim();
  if (!postId) return { status: "error", message: "Missing post." };

  const prisma = getPrisma();
  const post = await prisma.contentAsset.findUnique({
    where: { id: postId },
    include: { brand: true },
  });
  if (!post) return { status: "error", message: "Post not found." };

  // Every precondition is re-checked here, not only in the interface.
  if (post.channel !== ContentChannel.GOOGLE_BUSINESS) {
    return { status: "error", message: "This is not a Google Business post." };
  }
  if (post.status !== ContentStatus.APPROVED) {
    return { status: "error", message: "Approve the post first." };
  }
  if (!post.content.trim()) {
    return { status: "error", message: "The post is empty." };
  }
  if (post.googleBusinessPostName) {
    return {
      status: "error",
      message: `Already published as ${post.googleBusinessPostName}.`,
    };
  }

  const connection = await getConnection();
  if (!connection) {
    return { status: "error", message: "Connect a Google account first." };
  }
  if (!hasBusinessScope(connection.scope)) {
    return {
      status: "error",
      message:
        "The connection predates the Business Profile scope. Disconnect and connect again.",
    };
  }

  const accountId = post.brand.googleBusinessAccountId;
  const locationId = post.brand.googleBusinessLocationId;
  if (!accountId || !locationId) {
    return { status: "error", message: NO_LOCATION };
  }

  const article = await sourceArticle(post.brandId, post.opportunityId);
  const url = article?.articleDraft?.publishedUrl ?? null;
  if (!url) {
    return {
      status: "error",
      message: "The source article has no public URL — publish it first.",
    };
  }

  const banner =
    article?.articleDraft?.imageAssets.find(
      (image) => image.kind === "COVER" && image.blobUrl,
    )?.blobUrl ?? null;

  // The link is already in the body; the call to action carries it separately.
  const summary = post.content.replace(url, "").replace(/\s*\S*:\s*$/, "").trim();

  try {
    let imageSent = Boolean(banner);
    let created;
    try {
      created = await createLocalPost(accountId, locationId, {
        summary,
        actionUrl: url,
        photoUrl: banner,
      });
    } catch (error) {
      // An unusable photo must not cost the whole publication.
      if (!banner) throw error;
      console.error("Google Business post with media failed, retrying text only", error);
      imageSent = false;
      created = await createLocalPost(accountId, locationId, {
        summary,
        actionUrl: url,
      });
    }

    // Published because Google returns it, not because the POST was sent.
    const confirmed = await getLocalPost(created.name).catch(() => created);

    await prisma.contentAsset.update({
      where: { id: postId },
      data: {
        googleBusinessPostName: confirmed.name,
        googleBusinessPublishedAt: new Date(),
        googleBusinessError: null,
        publishedAt: new Date(),
      },
    });

    revalidatePath(`/dashboard/content/${postId}`);
    revalidatePath("/dashboard/content");
    if (article) revalidatePath(`/dashboard/content/${article.id}`);

    return {
      status: "done",
      message: `Published on Google Business${imageSent ? " with the article banner" : " — text and link only, the banner was not sent"}.`,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Google Business publishing failed.";
    await prisma.contentAsset
      .update({ where: { id: postId }, data: { googleBusinessError: message } })
      .catch(() => undefined);
    revalidatePath(`/dashboard/content/${postId}`);
    return { status: "error", message };
  }
}

/** Reads the published post back from Google, on demand. */
export async function verifyGoogleBusinessPost(
  _prevState: PublishState,
  formData: FormData,
): Promise<PublishState> {
  await requireSession();

  const postId = String(formData.get("postId") ?? "").trim();
  if (!postId) return { status: "error", message: "Missing post." };

  const prisma = getPrisma();
  const post = await prisma.contentAsset.findUnique({ where: { id: postId } });
  if (!post?.googleBusinessPostName) {
    return { status: "error", message: "This post has not been published yet." };
  }

  try {
    const live = await getLocalPost(post.googleBusinessPostName);
    return {
      status: "done",
      message: `${live.state || "found"} on Google${live.searchUrl ? ` · ${live.searchUrl}` : ""}`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not read the post.",
    };
  }
}
