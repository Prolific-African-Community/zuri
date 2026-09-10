"use server";

import { requireSession } from "@/lib/session";

import { resetReview } from "@/app/dashboard/content/review-actions";
import { parseLinks, parseTags } from "@/lib/article";
import { ContentStatus } from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

function refresh(assetId?: string) {
  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/opportunities");
  if (assetId) revalidatePath(`/dashboard/content/${assetId}`);
}

export async function updateContentAsset(assetId: string, formData: FormData) {
  await requireSession();

  const content = String(formData.get("content") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  if (!content) throw new Error("Content cannot be empty.");

  await getPrisma().contentAsset.update({
    where: { id: assetId },
    data: { title: title || null, content },
  });
  await resetReview(assetId);
  refresh(assetId);
}

export async function setContentStatus(assetId: string, status: ContentStatus) {
  await requireSession();

  await getPrisma().contentAsset.update({
    where: { id: assetId },
    data: { status },
  });
  refresh(assetId);
}

export async function approveContentAsset(assetId: string) {
  await requireSession();

  await setContentStatus(assetId, ContentStatus.APPROVED);
}

export async function archiveContentAsset(assetId: string) {
  await requireSession();

  await setContentStatus(assetId, ContentStatus.ARCHIVED);
}

export async function restoreContentAsset(assetId: string) {
  await requireSession();

  await setContentStatus(assetId, ContentStatus.DRAFT);
}

/** Assigning and moving a date share this action; the form supplies both. */
export async function scheduleContentAsset(assetId: string, formData: FormData) {
  await requireSession();

  const raw = String(formData.get("scheduledAt") ?? "").trim();
  if (!raw) throw new Error("Pick a date and time.");

  const scheduledAt = new Date(raw);
  if (Number.isNaN(scheduledAt.getTime())) throw new Error("Invalid date.");

  await getPrisma().contentAsset.update({
    where: { id: assetId },
    data: { scheduledAt },
  });
  refresh(assetId);
}

export async function unscheduleContentAsset(assetId: string) {
  await requireSession();

  await getPrisma().contentAsset.update({
    where: { id: assetId },
    data: { scheduledAt: null },
  });
  refresh(assetId);
}

/* -------------------------------------------------------------------------- */
/* Article draft                                                              */
/* -------------------------------------------------------------------------- */

/** Every ArticlePackage field is editable by hand; validation runs on read. */
export async function updateArticleDraft(assetId: string, formData: FormData) {
  await requireSession();

  const has = (name: string) => formData.has(name);
  const read = (name: string) => String(formData.get(name) ?? "").trim();

  // Each tab submits only its own fields; anything absent is left untouched.
  const asset: { title?: string; content?: string } = {};
  if (has("title")) {
    const title = read("title");
    if (!title) throw new Error("Title cannot be empty.");
    asset.title = title;
  }
  if (has("content")) {
    const content = String(formData.get("content") ?? "");
    if (!content.trim()) throw new Error("Content cannot be empty.");
    asset.content = content;
  }

  const draft: Record<string, unknown> = {};
  if (has("slug")) draft.slug = read("slug");
  if (has("excerpt")) draft.excerpt = read("excerpt");
  if (has("author")) draft.author = read("author");
  if (has("category")) draft.category = read("category");
  if (has("targetKeyword")) draft.targetKeyword = read("targetKeyword");
  if (has("metaTitle")) draft.metaTitle = read("metaTitle");
  if (has("metaDescription")) draft.metaDescription = read("metaDescription");
  if (has("tags")) draft.tags = parseTags(read("tags"));
  if (has("internalLinks")) draft.internalLinks = parseLinks(read("internalLinks"));
  if (has("canonicalUrl")) draft.canonicalUrl = read("canonicalUrl") || null;
  if (has("publishedAt")) {
    const raw = read("publishedAt");
    const publishedAt = raw ? new Date(raw) : null;
    if (publishedAt && Number.isNaN(publishedAt.getTime())) {
      throw new Error("Invalid publication date.");
    }
    draft.publishedAt = publishedAt;
  }

  await getPrisma().contentAsset.update({
    where: { id: assetId },
    data: {
      ...asset,
      ...(Object.keys(draft).length ? { articleDraft: { update: draft } } : {}),
    },
  });
  await resetReview(assetId);
  refresh(assetId);
}
