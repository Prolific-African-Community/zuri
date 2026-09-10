"use server";

import { ART_DIRECTION } from "@/lib/article-images";
import { generateImage, generateMetaCreative } from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { del, put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";

export type CreativeState = { status: "idle" | "done" | "error"; message: string };

const META_CHANNELS = ["FACEBOOK", "INSTAGRAM"];

function refresh(assetId: string) {
  revalidatePath(`/dashboard/content/${assetId}`);
  revalidatePath("/dashboard/content");
}

/** Instagram is square, Facebook reads better wide. */
function imageSize(channel: string): "1024x1024" | "1536x1024" {
  return channel === "INSTAGRAM" ? "1024x1024" : "1536x1024";
}

async function load(assetId: string) {
  const asset = await getPrisma().contentAsset.findUnique({
    where: { id: assetId },
    include: {
      brand: {
        include: { profile: true, voiceRules: true, audiences: true, goldenExamples: true },
      },
      opportunity: true,
      metaCreative: true,
    },
  });
  if (!asset) return { error: "Draft not found." };
  if (!META_CHANNELS.includes(asset.channel)) {
    return { error: "This draft is not a Meta draft." };
  }
  return { error: null, asset };
}

/**
 * Builds the package a person produces from: final copy for a post, a full
 * brief for a video. No video is generated here, and nothing is published.
 */
export async function buildMetaCreative(
  _prevState: CreativeState,
  formData: FormData,
): Promise<CreativeState> {
  await requireSession();

  const assetId = String(formData.get("assetId") ?? "").trim();
  if (!assetId) return { status: "error", message: "Missing draft." };

  try {
    const loaded = await load(assetId);
    if (loaded.error !== null) return { status: "error", message: loaded.error };
    const { asset } = loaded;

    const creative = await generateMetaCreative({
      brandName: asset.brand.name,
      channel: asset.channel,
      contentType: asset.type,
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
      audiences: asset.brand.audiences.map((audience) => ({
        name: audience.name,
        description: audience.description,
        pains: audience.pains,
        motivations: audience.motivations,
        objections: audience.objections,
      })),
      goldenExamples: asset.brand.goldenExamples.map((example) => ({
        title: example.title,
        content: example.content,
      })),
      draft: { title: asset.title ?? "", body: asset.content },
      source: {
        title: asset.opportunity?.title ?? "",
        description: asset.opportunity?.description ?? "",
        url: asset.opportunity?.targetUrl ?? null,
      },
      artDirection: ART_DIRECTION,
    });

    const data = {
      hook: creative.hook,
      copy: creative.copy,
      cta: creative.cta,
      visualRecommendation: creative.visualRecommendation,
      imagePrompt: creative.imagePrompt,
      productionPrompt: creative.productionPrompt,
      brief: creative.sections,
    };

    await getPrisma().contentAsset.update({
      where: { id: assetId },
      data: {
        metaCreative: {
          upsert: {
            // A rebuild replaces the brief but keeps any image already rendered.
            create: data,
            update: data,
          },
        },
      },
    });

    refresh(assetId);
    return { status: "done", message: "Creative package ready." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not build it.",
    };
  }
}

/** Renders the still image a static post or a meme needs. */
export async function generateMetaVisual(
  _prevState: CreativeState,
  formData: FormData,
): Promise<CreativeState> {
  await requireSession();

  const assetId = String(formData.get("assetId") ?? "").trim();
  if (!assetId) return { status: "error", message: "Missing draft." };

  try {
    const loaded = await load(assetId);
    if (loaded.error !== null) return { status: "error", message: loaded.error };
    const { asset } = loaded;

    const creative = asset.metaCreative;
    if (!creative) {
      return { status: "error", message: "Build the creative package first." };
    }
    if (!creative.imagePrompt) {
      return { status: "error", message: "This package needs no image." };
    }

    const previous = creative.imageUrl;
    const bytes = await generateImage(
      `${creative.imagePrompt}\n\n${ART_DIRECTION}`,
      imageSize(asset.channel),
    );
    const blob = await put(`meta/${randomUUID()}.png`, bytes, {
      access: "public",
      contentType: "image/png",
    });

    await getPrisma().metaCreative.update({
      where: { id: creative.id },
      data: { imageUrl: blob.url },
    });

    // Only once the replacement is uploaded and persisted.
    if (previous && previous !== blob.url) {
      try {
        await del(previous);
      } catch (error) {
        console.error("Could not delete the replaced Meta visual", previous, error);
      }
    }

    refresh(assetId);
    return { status: "done", message: previous ? "Visual regenerated." : "Visual generated." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Image generation failed.",
    };
  }
}

/** Hand edits win: what the user saves is what gets produced. */
export async function updateMetaCreative(assetId: string, formData: FormData) {
  await requireSession();

  const read = (name: string) => String(formData.get(name) ?? "").trim();
  const sections = String(formData.get("brief") ?? "")
    .split(/\n(?=[A-Z][^\n:]{2,40}:)/)
    .map((block) => {
      const at = block.indexOf(":");
      return at === -1
        ? null
        : { label: block.slice(0, at).trim(), body: block.slice(at + 1).trim() };
    })
    .filter((section): section is { label: string; body: string } =>
      Boolean(section?.label && section.body),
    );

  await getPrisma().contentAsset.update({
    where: { id: assetId },
    data: {
      content: read("content") || undefined,
      metaCreative: {
        update: {
          hook: read("hook"),
          copy: read("copy"),
          cta: read("cta"),
          imagePrompt: read("imagePrompt"),
          productionPrompt: read("productionPrompt"),
          ...(sections.length ? { brief: sections } : {}),
        },
      },
    },
  });

  refresh(assetId);
}
