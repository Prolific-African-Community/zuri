"use server";

import { requireSession } from "@/lib/session";

import { generateGrowthWeek } from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { weekStart } from "@/lib/week";
import { revalidatePath } from "next/cache";

export type WeekState = {
  status: "idle" | "done" | "error";
  message: string;
};

export async function generateGrowthWeekAction(
  _prevState: WeekState,
  formData: FormData,
): Promise<WeekState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return { status: "error", message: "Pick a brand first." };

  try {
    const prisma = getPrisma();
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        profile: true,
        opportunities: {
          where: { status: { not: "ARCHIVED" } },
          orderBy: [{ score: "desc" }, { createdAt: "desc" }],
          take: 30,
          include: {
            seoBrief: { select: { id: true } },
            contentAssets: { select: { type: true } },
          },
        },
        contentAssets: {
          where: { status: { not: "ARCHIVED" } },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });
    if (!brand) return { status: "error", message: "Brand not found." };

    if (!brand.opportunities.length && !brand.contentAssets.length) {
      return {
        status: "error",
        message: "Nothing to plan yet — create some opportunities or drafts first.",
      };
    }

    const start = weekStart(new Date());

    const items = await generateGrowthWeek({
      brandName: brand.name,
      weekStart: start.toISOString().slice(0, 10),
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
      opportunities: brand.opportunities.map((opportunity) => ({
        id: opportunity.id,
        title: opportunity.title,
        source: opportunity.source,
        status: opportunity.status,
        score: opportunity.score,
        actionType: opportunity.actionType,
        targetKeyword: opportunity.targetKeyword,
        hasSeoBrief: Boolean(opportunity.seoBrief),
        hasSeoContent: opportunity.contentAssets.some(
          (asset) => asset.type === "SEO_CONTENT",
        ),
        savedDraftCount: opportunity.contentAssets.filter(
          (asset) => asset.type === "SOCIAL_POST",
        ).length,
      })),
      contentAssets: brand.contentAssets.map((asset) => ({
        id: asset.id,
        title: asset.title,
        channel: asset.channel,
        type: asset.type,
        status: asset.status,
        scheduledAt: asset.scheduledAt?.toISOString() ?? null,
        excerpt: asset.content.slice(0, 200),
      })),
    });

    if (!items.length) {
      return { status: "done", message: "The model proposed no action." };
    }

    // One plan per brand per week; regenerating replaces its items.
    const plan = await prisma.growthWeekPlan.upsert({
      where: { brandId_weekStart: { brandId, weekStart: start } },
      update: {},
      create: { brandId, weekStart: start },
    });
    await prisma.growthWeekItem.deleteMany({ where: { planId: plan.id } });
    await prisma.growthWeekItem.createMany({
      data: items.map((item) => ({
        planId: plan.id,
        day: item.day,
        action: item.action,
        channel: item.channel,
        reason: item.reason,
        priority: item.priority,
        opportunityId: item.opportunityId || null,
        contentAssetId: item.contentAssetId || null,
      })),
    });

    revalidatePath("/dashboard/growth-week");

    const social = items.filter((item) => item.channel === "SOCIAL").length;
    const search = items.filter((item) => item.channel === "SEARCH").length;
    return {
      status: "done",
      message: `${items.length} action${items.length === 1 ? "" : "s"} planned · ${social} social, ${search} search.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Planning failed.",
    };
  }
}
