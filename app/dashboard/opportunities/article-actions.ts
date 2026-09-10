"use server";

import {
  ContentChannel,
  ContentStatus,
  ContentType,
} from "@/lib/generated/prisma/enums";
import { generateArticle } from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { publishingConfig } from "@/lib/publishing";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type ArticleState = { status: "idle" | "done" | "error"; message: string };

export async function generateArticleAction(
  _prevState: ArticleState,
  formData: FormData,
): Promise<ArticleState> {
  await requireSession();

  const opportunityId = String(formData.get("opportunityId") ?? "").trim();
  if (!opportunityId) return { status: "error", message: "Missing opportunity." };

  try {
    const prisma = getPrisma();
    const opportunity = await prisma.opportunity.findUnique({
      where: { id: opportunityId },
      include: {
        seoBrief: true,
        brand: {
          include: { profile: true, voiceRules: true, goldenExamples: true },
        },
      },
    });
    if (!opportunity) return { status: "error", message: "Opportunity not found." };

    const { brand, seoBrief } = opportunity;

    // An article is written against a publishing target, not into the void.
    const config = publishingConfig(brand);
    if (!config.ok) {
      return {
        status: "error",
        message: `${brand.name} is missing its publishing setup: ${config.missing.join(", ")}.`,
      };
    }

    const targetKeyword = seoBrief?.targetKeyword ?? opportunity.targetKeyword;

    const [keyword, sitePages] = await Promise.all([
      targetKeyword
        ? prisma.keyword.findFirst({
            where: { brandId: brand.id, keyword: targetKeyword },
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

    const generated = await generateArticle({
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
      goldenExamples: brand.goldenExamples.map((example) => ({
        title: example.title,
        content: example.content,
      })),
      opportunity: {
        title: opportunity.title,
        description: opportunity.description,
        rationale: opportunity.rationale,
        targetKeyword: opportunity.targetKeyword,
        targetUrl: opportunity.targetUrl,
      },
      brief: seoBrief
        ? {
            objective: seoBrief.objective,
            targetKeyword: seoBrief.targetKeyword,
            searchIntent: seoBrief.searchIntent,
            recommendedAction: seoBrief.recommendedAction,
            recommendedTitle: seoBrief.recommendedTitle,
            recommendedMetaDescription: seoBrief.recommendedMetaDescription,
            outline: seoBrief.outline,
            keyQuestions: seoBrief.keyQuestions,
            internalLinks: seoBrief.internalLinks,
            competitorInsights: seoBrief.competitorInsights,
            evidenceNeeded: seoBrief.evidenceNeeded,
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
      publicRoute: config.config.publicRoute,
    });

    // Regenerating replaces the draft in place rather than piling up copies.
    const existing = await prisma.contentAsset.findFirst({
      where: {
        opportunityId,
        channel: ContentChannel.WEBSITE,
        type: ContentType.SEO_CONTENT,
        articleDraft: { isNot: null },
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    const draft = {
      slug: generated.slug,
      excerpt: generated.excerpt,
      author: brand.name,
      category: generated.category,
      tags: generated.tags,
      targetKeyword: targetKeyword ?? "",
      metaTitle: generated.metaTitle,
      metaDescription: generated.metaDescription,
      internalLinks: generated.internalLinks,
    };

    const assetId = existing
      ? (
          await prisma.contentAsset.update({
            where: { id: existing.id },
            data: {
              title: generated.title,
              content: generated.content,
              status: ContentStatus.DRAFT,
              articleDraft: {
                update: { ...draft, reviewStatus: "DRAFT" },
              },
            },
          })
        ).id
      : (
          await prisma.contentAsset.create({
            data: {
              brandId: brand.id,
              opportunityId,
              channel: ContentChannel.WEBSITE,
              type: ContentType.SEO_CONTENT,
              status: ContentStatus.DRAFT,
              title: generated.title,
              content: generated.content,
              articleDraft: {
                create: { ...draft, publishedAt: null, images: [] },
              },
            },
          })
        ).id;

    revalidatePath("/dashboard/opportunities");
    revalidatePath("/dashboard/content");
    revalidatePath(`/dashboard/content/${assetId}`);

    const placeholders = (generated.content.match(/\[TO SOURCE:/g) ?? []).length;
    return {
      status: "done",
      message:
        `Article ${existing ? "replaced" : "drafted"}` +
        (placeholders
          ? ` · ${placeholders} spot${placeholders === 1 ? "" : "s"} need a source.`
          : "."),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Article generation failed.",
    };
  }
}
