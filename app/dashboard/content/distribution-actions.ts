"use server";

import {
  ContentChannel,
  ContentStatus,
  ContentType,
} from "@/lib/generated/prisma/enums";
import { generateGoogleBusinessPost } from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { publishingConfig } from "@/lib/publishing";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type DistributionState = {
  status: "idle" | "done" | "error";
  message: string;
};

function refresh(assetId: string) {
  revalidatePath(`/dashboard/content/${assetId}`);
  revalidatePath("/dashboard/content");
}

/**
 * Turns a published article into a Google Business post. It writes a draft in
 * Zuri only — this run publishes nothing to Google Business Profile.
 */
export async function generateBusinessPost(
  _prevState: DistributionState,
  formData: FormData,
): Promise<DistributionState> {
  await requireSession();

  const assetId = String(formData.get("assetId") ?? "").trim();
  if (!assetId) return { status: "error", message: "Missing article." };

  try {
    const prisma = getPrisma();
    const asset = await prisma.contentAsset.findUnique({
      where: { id: assetId },
      include: {
        brand: { include: { profile: true } },
        articleDraft: { include: { imageAssets: true } },
      },
    });
    if (!asset?.articleDraft) {
      return { status: "error", message: "This asset is not an article." };
    }

    const draft = asset.articleDraft;
    const config = publishingConfig(asset.brand);
    const site = (asset.brand.websiteUrl ?? "").replace(/\/+$/, "");
    const url =
      draft.publishedUrl ??
      (config.ok && site
        ? `${site}${config.config.publicRoute === "/" ? "" : config.config.publicRoute}/${draft.slug}`
        : "");

    if (!url) {
      return {
        status: "error",
        message: "The article has no public URL yet — publish it first.",
      };
    }

    const generated = await generateGoogleBusinessPost({
      brandName: asset.brand.name,
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
      article: {
        title: asset.title ?? "",
        excerpt: draft.excerpt,
        body: asset.content,
        targetKeyword: draft.targetKeyword,
        url,
      },
    });

    const body = `${generated.content}\n\n${generated.callToAction}: ${url}`;

    // Regenerating replaces the existing draft rather than piling up posts.
    const existing = await prisma.contentAsset.findFirst({
      where: {
        brandId: asset.brandId,
        channel: ContentChannel.GOOGLE_BUSINESS,
        opportunityId: asset.opportunityId,
        status: { not: ContentStatus.ARCHIVED },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const post = existing
      ? await prisma.contentAsset.update({
          where: { id: existing.id },
          data: { title: asset.title, content: body, status: ContentStatus.DRAFT },
        })
      : await prisma.contentAsset.create({
          data: {
            brandId: asset.brandId,
            opportunityId: asset.opportunityId,
            channel: ContentChannel.GOOGLE_BUSINESS,
            type: ContentType.SOCIAL_POST,
            status: ContentStatus.DRAFT,
            title: asset.title,
            content: body,
          },
        });

    refresh(assetId);
    refresh(post.id);
    return {
      status: "done",
      message: existing ? "Post replaced." : "Post drafted.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Generation failed.",
    };
  }
}
