"use server";

import {
  ART_DIRECTION,
  BANNER_HEIGHT,
  BANNER_WIDTH,
  coverPublicPath,
  coverTargetPath,
  toPackageImages,
  type StoredImage,
} from "@/lib/article-images";
import { resetReview } from "@/app/dashboard/content/review-actions";
import { Prisma } from "@/lib/generated/prisma/client";
import { ArticleImageKind } from "@/lib/generated/prisma/enums";
import { generateImage, suggestCover, type ArticleVisualContext } from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { publishingConfig } from "@/lib/publishing";
import { requireSession } from "@/lib/session";
import { del, put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

export type ImageState = { status: "idle" | "done" | "error"; message: string };

async function refresh(assetId: string) {
  // Regenerating or re-labelling an image changes what a review approved.
  await resetReview(assetId);
  revalidatePath(`/dashboard/content/${assetId}`);
  revalidatePath("/dashboard/content");
}

/** Loads everything an image action needs, or explains what is missing. */
async function load(contentAssetId: string) {
  const prisma = getPrisma();
  const asset = await prisma.contentAsset.findUnique({
    where: { id: contentAssetId },
    include: {
      brand: { include: { profile: true, voiceRules: true } },
      articleDraft: { include: { imageAssets: { orderBy: { order: "asc" } } } },
    },
  });
  if (!asset?.articleDraft) {
    return { error: "This asset is not an article." };
  }

  const config = publishingConfig(asset.brand);
  if (!config.ok) {
    return {
      error: `${asset.brand.name} is missing its publishing setup: ${config.missing.join(", ")}.`,
    };
  }
  if (!asset.articleDraft.slug) {
    return { error: "Give the article a slug first — the paths depend on it." };
  }

  return {
    error: null,
    asset,
    draft: asset.articleDraft,
    config: config.config,
  };
}

type LoadedAsset = {
  title: string | null;
  content: string;
  brand: {
    name: string;
    profile: {
      mission: string;
      manifesto: string;
      positioning: string;
      valueProposition: string;
      voiceDescription: string;
      language: string;
    } | null;
    voiceRules: { type: string; rule: string }[];
  };
};

function visualContext(
  asset: LoadedAsset,
  draft: { excerpt: string; category: string; targetKeyword: string },
): ArticleVisualContext {
  return {
    brandName: asset.brand.name,
    title: asset.title ?? "",
    excerpt: draft.excerpt,
    category: draft.category,
    targetKeyword: draft.targetKeyword,
    content: asset.content,
    profile: asset.brand.profile
      ? {
          mission: asset.brand.profile.mission,
          manifesto: asset.brand.profile.manifesto,
          positioning: asset.brand.profile.positioning,
          valueProposition: asset.brand.profile.valueProposition,
          voiceDescription: asset.brand.profile.voiceDescription,
          language: asset.brand.profile.language,
        }
      : null,
    voiceRules: asset.brand.voiceRules.map((rule) => ({
      type: rule.type,
      rule: rule.rule,
    })),
    artDirection: ART_DIRECTION,
  };
}

/**
 * Recomputes every target path from the current slug and mirrors the rendered
 * images into the draft, so `validateArticlePackage` keeps reading one truth.
 */
async function syncPackage(contentAssetId: string) {
  const prisma = getPrisma();
  const asset = await prisma.contentAsset.findUnique({
    where: { id: contentAssetId },
    include: {
      brand: true,
      articleDraft: { include: { imageAssets: { orderBy: { order: "asc" } } } },
    },
  });
  if (!asset?.articleDraft) return;

  const config = publishingConfig(asset.brand);
  if (!config.ok) return;
  const { publicRoute, assetsDirectory } = config.config;
  const { slug } = asset.articleDraft;

  const stored: StoredImage[] = [];
  // Only the banner takes part; older inline rows are left alone, not deleted.
  for (const image of asset.articleDraft.imageAssets) {
    if (image.kind !== ArticleImageKind.COVER) continue;
    const publicPath = coverPublicPath(publicRoute, slug);
    const targetPath = coverTargetPath(assetsDirectory, publicRoute, slug);

    if (image.targetPath !== targetPath) {
      await prisma.articleImageAsset.update({
        where: { id: image.id },
        data: { targetPath },
      });
    }
    stored.push({
      kind: image.kind,
      order: image.order,
      alt: image.alt,
      blobUrl: image.blobUrl,
      publicPath,
    });
  }

  const { coverImage, images } = toPackageImages(stored);
  await prisma.articleDraft.update({
    where: { id: asset.articleDraft.id },
    data: {
      coverImage: coverImage ? { ...coverImage } : Prisma.DbNull,
      images,
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Cover                                                                      */
/* -------------------------------------------------------------------------- */

export async function generateCoverAction(
  _prevState: ImageState,
  formData: FormData,
): Promise<ImageState> {
  await requireSession();

  const contentAssetId = String(formData.get("contentAssetId") ?? "").trim();
  if (!contentAssetId) return { status: "error", message: "Missing article." };

  try {
    const loaded = await load(contentAssetId);
    if (loaded.error !== null) return { status: "error", message: loaded.error };
    const { asset, draft, config } = loaded;

    const prisma = getPrisma();
    const existing = draft.imageAssets.find(
      (image) => image.kind === ArticleImageKind.COVER,
    );
    const previousUrl = existing?.blobUrl ?? null;

    const concept = await suggestCover(visualContext(asset, draft));
    const generated = await generateImage(concept.imagePrompt, "1536x1024");
    // The provider's widest size is 3:2, so the banner is cropped, never
    // stretched, to the panoramic ratio the layout expects.
    const bytes = await sharp(generated)
      .resize(BANNER_WIDTH, BANNER_HEIGHT, { fit: "cover", position: "attention" })
      .png()
      .toBuffer();
    const blob = await put(`articles/${randomUUID()}.png`, bytes, {
      access: "public",
      contentType: "image/png",
    });

    const data = {
      concept: concept.concept,
      prompt: concept.imagePrompt,
      // A hand-written alt is the author's, not the model's, so it is kept.
      alt: existing?.alt?.trim() ? existing.alt : concept.alt,
      blobUrl: blob.url,
      targetPath: coverTargetPath(config.assetsDirectory, config.publicRoute, draft.slug),
    };

    if (existing) {
      await prisma.articleImageAsset.update({ where: { id: existing.id }, data });
    } else {
      await prisma.articleImageAsset.create({
        data: {
          articleDraftId: draft.id,
          kind: ArticleImageKind.COVER,
          order: 0,
          purpose: "Cover",
          ...data,
        },
      });
    }

    await syncPackage(contentAssetId);

    // Only once the replacement is uploaded *and* persisted.
    if (previousUrl && previousUrl !== blob.url) {
      try {
        await del(previousUrl);
      } catch (error) {
        console.error("Could not delete the replaced cover blob", previousUrl, error);
      }
    }

    await refresh(contentAssetId);
    return { status: "done", message: existing ? "Cover regenerated." : "Cover generated." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Cover generation failed.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Manual edits                                                               */
/* -------------------------------------------------------------------------- */

export async function updateArticleImage(imageId: string, formData: FormData) {
  await requireSession();

  const alt = String(formData.get("alt") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim();

  const prisma = getPrisma();
  const image = await prisma.articleImageAsset.update({
    where: { id: imageId },
    data: { alt, caption: caption || null },
    include: { draft: { select: { contentAssetId: true } } },
  });

  await syncPackage(image.draft.contentAssetId);
  await refresh(image.draft.contentAssetId);
}

export async function deleteArticleImage(imageId: string) {
  await requireSession();

  const prisma = getPrisma();
  const image = await prisma.articleImageAsset.findUnique({
    where: { id: imageId },
    include: { draft: { select: { contentAssetId: true } } },
  });
  if (!image) return;


  await prisma.articleImageAsset.delete({ where: { id: imageId } });
  await syncPackage(image.draft.contentAssetId);

  if (image.blobUrl) {
    try {
      await del(image.blobUrl);
    } catch (error) {
      console.error("Could not delete the blob", image.blobUrl, error);
    }
  }

  await refresh(image.draft.contentAssetId);
}
