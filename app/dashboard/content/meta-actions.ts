"use server";

import {
  ContentChannel,
  ContentStatus,
  ContentType,
} from "@/lib/generated/prisma/enums";
import { generateMetaIdeas, META_TYPES, type MetaIdea } from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type MetaState = {
  status: "idle" | "done" | "error";
  message: string;
  ideas: MetaIdea[];
};

// Only async functions may be exported from a "use server" file; the initial
// state lives with the component that uses it.
const emptyMetaState: MetaState = { status: "idle", message: "", ideas: [] };

function refresh() {
  revalidatePath("/dashboard/content");
  revalidatePath("/dashboard/opportunities");
}

/**
 * Ideas for Meta, from an opportunity or from an article. They are returned to
 * the page and not stored: only the one the reader picks becomes a draft.
 */
export async function generateMetaIdeasAction(
  _prevState: MetaState,
  formData: FormData,
): Promise<MetaState> {
  await requireSession();

  const opportunityId = String(formData.get("opportunityId") ?? "").trim();
  const assetId = String(formData.get("assetId") ?? "").trim();
  if (!opportunityId && !assetId) {
    return { ...emptyMetaState, status: "error", message: "Missing source." };
  }

  try {
    const prisma = getPrisma();

    const asset = assetId
      ? await prisma.contentAsset.findUnique({
          where: { id: assetId },
          include: { articleDraft: true },
        })
      : null;
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId || (asset?.opportunityId ?? "") },
    });

    const brandId = asset?.brandId ?? opportunity?.brandId;
    if (!brandId) {
      return { ...emptyMetaState, status: "error", message: "Source not found." };
    }

    // Everything comes from this brand: its brain, its audiences, its content.
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        profile: true,
        voiceRules: { orderBy: { createdAt: "asc" } },
        audiences: true,
        goldenExamples: true,
      },
    });
    if (!brand) {
      return { ...emptyMetaState, status: "error", message: "Brand not found." };
    }

    const recent = await prisma.contentAsset.findMany({
      where: { brandId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { title: true },
    });

    const ideas = await generateMetaIdeas({
      brandName: brand.name,
      profile: brand.profile
        ? {
            mission: brand.profile.mission,
            manifesto: brand.profile.manifesto,
            positioning: brand.profile.positioning,
            valueProposition: brand.profile.valueProposition,
            voiceDescription: brand.profile.voiceDescription,
            language: brand.profile.language,
          }
        : null,
      voiceRules: brand.voiceRules.map((rule) => ({
        type: rule.type,
        rule: rule.rule,
      })),
      audiences: brand.audiences.map((audience) => ({
        name: audience.name,
        description: audience.description,
        pains: audience.pains,
        motivations: audience.motivations,
        objections: audience.objections,
      })),
      goldenExamples: brand.goldenExamples.map((example) => ({
        title: example.title,
        content: example.content,
      })),
      source: asset
        ? {
            kind: "ARTICLE",
            title: asset.title ?? "",
            description: asset.articleDraft?.excerpt ?? "",
            body: asset.content,
            url: asset.articleDraft?.publishedUrl ?? null,
          }
        : {
            kind: "OPPORTUNITY",
            title: opportunity?.title ?? "",
            description: opportunity?.description ?? "",
            body: opportunity?.rationale ?? "",
            url: opportunity?.targetUrl ?? null,
          },
      recentContent: recent
        .map((entry) => entry.title)
        .filter((title): title is string => Boolean(title)),
    });

    if (!ideas.length) {
      return { ...emptyMetaState, status: "error", message: "No idea came back." };
    }

    return {
      status: "done",
      message: `${ideas.length} idea${ideas.length === 1 ? "" : "s"}.`,
      ideas,
    };
  } catch (error) {
    return {
      ...emptyMetaState,
      status: "error",
      message: error instanceof Error ? error.message : "Meta generation failed.",
    };
  }
}

/** Renders one idea into the body a person will actually work from. */
function body(idea: MetaIdea): string {
  const lines: string[] = [`Hook: ${idea.hook}`, ""];

  switch (idea.contentType) {
    case "TEXT_POST":
      lines.push(idea.post || idea.concept);
      if (idea.cta) lines.push("", `CTA: ${idea.cta}`);
      break;
    case "MEME_CONCEPT":
      lines.push(
        `Setup: ${idea.setup}`,
        `Punchline: ${idea.punchline}`,
        "",
        `Visual: ${idea.visualConcept}`,
        `Caption: ${idea.caption}`,
      );
      break;
    case "VIDEO_AD_BRIEF":
      lines.push(
        `Concept: ${idea.concept}`,
        `Audience: ${idea.audience}`,
        `Pain point: ${idea.painPoint}`,
        `Promise: ${idea.promise}`,
        `Duration: ${idea.duration}`,
        `CTA: ${idea.cta}`,
      );
      break;
    case "TESTIMONIAL_VIDEO_BRIEF":
      lines.push(
        // Stated in the body itself so it cannot be mistaken for a real quote.
        "PERSONA — a scenario to cast and script, not a real customer.",
        "",
        `Persona: ${idea.persona}`,
        `Problem: ${idea.problem}`,
        `Transformation: ${idea.transformation}`,
        `Structure: ${idea.structure}`,
        `CTA: ${idea.cta}`,
      );
      break;
  }

  lines.push("", `Angle: ${idea.angle}`, `Why it could work: ${idea.rationale}`);
  return lines.join("\n").trim();
}

function readIdea(formData: FormData): MetaIdea | null {
  const raw = String(formData.get("idea") ?? "");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as MetaIdea;
    return (META_TYPES as readonly string[]).includes(parsed.contentType)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** One draft, from one chosen idea. The other ideas are simply dropped. */
export async function createMetaDraft(
  _prevState: MetaState,
  formData: FormData,
): Promise<MetaState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  const opportunityId = String(formData.get("opportunityId") ?? "").trim() || null;
  const channel = String(formData.get("channel") ?? "").trim();
  const idea = readIdea(formData);

  if (!brandId || !idea) {
    return { ...emptyMetaState, status: "error", message: "Missing idea." };
  }
  if (channel !== "FACEBOOK" && channel !== "INSTAGRAM") {
    return { ...emptyMetaState, status: "error", message: "Pick a channel." };
  }

  try {
    const asset = await getPrisma().contentAsset.create({
      data: {
        brandId,
        opportunityId,
        channel: channel as ContentChannel,
        type: idea.contentType as ContentType,
        status: ContentStatus.DRAFT,
        title: idea.hook.slice(0, 120),
        content: body(idea),
      },
    });

    refresh();
    revalidatePath(`/dashboard/content/${asset.id}`);
    return {
      ...emptyMetaState,
      status: "done",
      message: `Draft created for ${channel.toLowerCase()}.`,
    };
  } catch (error) {
    return {
      ...emptyMetaState,
      status: "error",
      message: error instanceof Error ? error.message : "Could not create the draft.",
    };
  }
}
