"use server";

import { requireSession } from "@/lib/session";

import {
  ContentChannel,
  ContentStatus,
  ContentType,
  SeoActionType,
} from "@/lib/generated/prisma/enums";
import { generateSeoBrief, generateSeoContent } from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type BriefState = {
  status: "idle" | "done" | "error";
  message: string;
};

export async function generateSeoBriefAction(
  _prevState: BriefState,
  formData: FormData,
): Promise<BriefState> {
  await requireSession();

  const opportunityId = String(formData.get("opportunityId") ?? "").trim();
  if (!opportunityId) return { status: "error", message: "Missing opportunity." };

  try {
    const prisma = getPrisma();
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: { brand: { include: { profile: true } } },
    });
    if (!opportunity) return { status: "error", message: "Opportunity not found." };

    const { brand } = opportunity;

    const [targetPage, keyword, sitePages] = await Promise.all([
      opportunity.targetUrl
        ? prisma.websitePage.findFirst({
            where: { brandId: brand.id, url: opportunity.targetUrl },
          })
        : null,
      opportunity.targetKeyword
        ? prisma.keyword.findFirst({
            where: { brandId: brand.id, keyword: opportunity.targetKeyword },
            include: { serpCompetitors: { orderBy: { position: "asc" }, take: 10 } },
          })
        : null,
      prisma.websitePage.findMany({
        where: { brandId: brand.id },
        orderBy: { url: "asc" },
        take: 50,
        select: { url: true, title: true },
      }),
    ]);

    const brief = await generateSeoBrief({
      brandName: brand.name,
      opportunity: {
        title: opportunity.title,
        description: opportunity.description,
        rationale: opportunity.rationale,
        actionType: opportunity.actionType,
        targetUrl: opportunity.targetUrl,
        targetKeyword: opportunity.targetKeyword,
        score: opportunity.score,
      },
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
      targetPage: targetPage
        ? {
            url: targetPage.url,
            title: targetPage.title,
            metaDescription: targetPage.metaDescription,
            h1: targetPage.h1,
            wordCount: targetPage.wordCount,
          }
        : null,
      keyword: keyword
        ? {
            keyword: keyword.keyword,
            searchVolume: keyword.searchVolume,
            difficulty: keyword.difficulty,
            intent: keyword.intent,
          }
        : null,
      serpCompetitors:
        keyword?.serpCompetitors.map((entry) => ({
          position: entry.position,
          domain: entry.domain,
          url: entry.url,
          title: entry.title,
        })) ?? [],
      sitePages,
    });

    const data = {
      objective: brief.objective,
      targetKeyword: brief.targetKeyword || null,
      searchIntent: brief.searchIntent || null,
      recommendedAction: brief.recommendedAction as SeoActionType,
      actionJustification: brief.actionJustification || null,
      recommendedTitle: brief.recommendedTitle || null,
      recommendedMetaDescription: brief.recommendedMetaDescription || null,
      outline: brief.outline,
      keyQuestions: brief.keyQuestions,
      internalLinks: brief.internalLinks,
      competitorInsights: brief.competitorInsights,
      evidenceNeeded: brief.evidenceNeeded,
    };

    await prisma.seoBrief.upsert({
      where: { opportunityId },
      update: data,
      create: { brandId: brand.id, opportunityId, ...data },
    });

    revalidatePath("/dashboard/opportunities");
    revalidatePath("/dashboard/search");

    const changed = brief.recommendedAction !== opportunity.actionType;
    return {
      status: "done",
      message: changed
        ? `Brief ready — action changed to ${brief.recommendedAction.toLowerCase().replace("_", " ")}.`
        : "Brief ready.",
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Brief generation failed.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* SEO content                                                                */
/* -------------------------------------------------------------------------- */

export async function generateSeoContentAction(
  _prevState: BriefState,
  formData: FormData,
): Promise<BriefState> {
  await requireSession();

  const opportunityId = String(formData.get("opportunityId") ?? "").trim();
  if (!opportunityId) return { status: "error", message: "Missing opportunity." };

  try {
    const prisma = getPrisma();
    const brief = await prisma.seoBrief.findUnique({
      where: { opportunityId },
      include: { brand: { include: { profile: true, goldenExamples: true } } },
    });
    if (!brief) {
      return { status: "error", message: "Generate the brief first." };
    }

    const { brand } = brief;
    const [keyword, sitePages] = await Promise.all([
      brief.targetKeyword
        ? prisma.keyword.findFirst({
            where: { brandId: brand.id, keyword: brief.targetKeyword },
            include: { serpCompetitors: { orderBy: { position: "asc" }, take: 10 } },
          })
        : null,
      prisma.websitePage.findMany({
        where: { brandId: brand.id },
        orderBy: { url: "asc" },
        take: 50,
        select: { url: true, title: true },
      }),
    ]);

    const generated = await generateSeoContent({
      brandName: brand.name,
      brief: {
        objective: brief.objective,
        targetKeyword: brief.targetKeyword,
        searchIntent: brief.searchIntent,
        recommendedAction: brief.recommendedAction,
        recommendedTitle: brief.recommendedTitle,
        recommendedMetaDescription: brief.recommendedMetaDescription,
        outline: brief.outline,
        keyQuestions: brief.keyQuestions,
        internalLinks: brief.internalLinks,
        competitorInsights: brief.competitorInsights,
        evidenceNeeded: brief.evidenceNeeded,
      },
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
      keyword: keyword
        ? {
            keyword: keyword.keyword,
            searchVolume: keyword.searchVolume,
            difficulty: keyword.difficulty,
            intent: keyword.intent,
          }
        : null,
      serpCompetitors:
        keyword?.serpCompetitors.map((entry) => ({
          position: entry.position,
          domain: entry.domain,
          title: entry.title,
        })) ?? [],
      sitePages,
      goldenExamples: brand.goldenExamples.map((example) => ({
        title: example.title,
        content: example.content,
      })),
    });

    // Regenerating replaces the previous draft rather than piling up copies.
    const body = generated.suggestedSlug
      ? `${generated.content}\n\n---\n\nSuggested slug: /${generated.suggestedSlug}\nMeta description: ${generated.metaDescription}`
      : generated.content;

    const existing = await prisma.contentAsset.findFirst({
      where: {
        opportunityId,
        channel: ContentChannel.WEBSITE,
        type: ContentType.SEO_CONTENT,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing) {
      await prisma.contentAsset.update({
        where: { id: existing.id },
        data: { title: generated.title, content: body, status: ContentStatus.DRAFT },
      });
    } else {
      await prisma.contentAsset.create({
        data: {
          brandId: brand.id,
          opportunityId,
          channel: ContentChannel.WEBSITE,
          type: ContentType.SEO_CONTENT,
          status: ContentStatus.DRAFT,
          title: generated.title,
          content: body,
        },
      });
    }

    revalidatePath("/dashboard/opportunities");
    revalidatePath("/dashboard/content");

    const placeholders = (generated.content.match(/\[TO SOURCE:/g) ?? []).length;
    return {
      status: "done",
      message:
        `Content ${existing ? "replaced" : "saved"} as a draft` +
        (placeholders
          ? ` · ${placeholders} spot${placeholders === 1 ? "" : "s"} need a source.`
          : "."),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Content generation failed.",
    };
  }
}
