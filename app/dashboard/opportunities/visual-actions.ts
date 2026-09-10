"use server";

import { requireSession } from "@/lib/session";

import {
  generateImage,
  suggestVisual,
  type VisualSuggestion,
} from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { VisualType } from "@/lib/generated/prisma/enums";
import { del, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

export type VisualState = {
  status: "idle" | "done" | "error";
  message: string;
};

function refresh() {
  revalidatePath("/dashboard/opportunities");
}

export async function suggestVisualAction(
  _prevState: VisualState,
  formData: FormData,
): Promise<VisualState> {
  await requireSession();

  const contentAssetId = String(formData.get("contentAssetId") ?? "").trim();
  if (!contentAssetId) {
    return { status: "error", message: "Missing draft." };
  }

  try {
    const prisma = getPrisma();
    const asset = await prisma.contentAsset.findUnique({
      where: { id: contentAssetId },
      include: {
        brand: {
          include: {
            profile: true,
            voiceRules: { orderBy: { createdAt: "asc" } },
          },
        },
        opportunity: { select: { title: true, description: true } },
      },
    });
    if (!asset) return { status: "error", message: "Draft not found." };

    const suggestion: VisualSuggestion = await suggestVisual({
      brandName: asset.brand.name,
      post: asset.content,
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
      opportunity: asset.opportunity,
    });

    const data = {
      type: suggestion.type as VisualType,
      reason: suggestion.reason || null,
      concept: suggestion.concept || null,
      prompt: suggestion.imagePrompt || null,
      // A fresh recommendation invalidates any previously rendered image.
      imageUrl: null,
    };

    await prisma.visualAsset.upsert({
      where: { contentAssetId },
      update: data,
      create: { brandId: asset.brandId, contentAssetId, ...data },
    });

    refresh();
    return {
      status: "done",
      message:
        suggestion.type === "NONE"
          ? "No visual needed for this post."
          : `Recommended: ${suggestion.type.toLowerCase().replace("_", " ")}.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Suggestion failed.",
    };
  }
}

export async function generateVisualImageAction(
  _prevState: VisualState,
  formData: FormData,
): Promise<VisualState> {
  await requireSession();

  const visualAssetId = String(formData.get("visualAssetId") ?? "").trim();
  if (!visualAssetId) return { status: "error", message: "Missing visual." };

  try {
    const prisma = getPrisma();
    const visual = await prisma.visualAsset.findUnique({
      where: { id: visualAssetId },
    });
    if (!visual) return { status: "error", message: "Visual not found." };
    if (visual.type === VisualType.NONE) {
      return { status: "error", message: "This post does not need a visual." };
    }
    if (!visual.prompt) {
      return { status: "error", message: "No image prompt. Suggest a visual first." };
    }

    const previousUrl = visual.imageUrl;
    const bytes = await generateImage(visual.prompt);

    const blob = await put(`visuals/${randomUUID()}.png`, bytes, {
      access: "public",
      contentType: "image/png",
    });

    await prisma.visualAsset.update({
      where: { id: visualAssetId },
      data: { imageUrl: blob.url },
    });

    // Only once the replacement is uploaded *and* persisted: a failure above
    // leaves the old image in place rather than losing both.
    if (previousUrl && previousUrl !== blob.url) {
      try {
        await del(previousUrl);
      } catch (error) {
        // An orphaned blob is not worth failing a successful generation over.
        console.error("Could not delete the replaced blob", previousUrl, error);
      }
    }

    refresh();
    return { status: "done", message: "Image generated." };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Image generation failed.",
    };
  }
}
