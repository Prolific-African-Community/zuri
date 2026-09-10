"use server";

import { requireSession } from "@/lib/session";

import { crawlSite } from "@/lib/crawler";
import {
  fetchKeywordMetrics,
  fetchSerp,
  priorityScore,
} from "@/lib/dataforseo";
import { OpportunitySource, SeoActionType } from "@/lib/generated/prisma/enums";
import {
  generateSeedKeywords,
  generateSeoOpportunities,
} from "@/lib/openai";
import { getPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type CrawlState = {
  status: "idle" | "done" | "error";
  message: string;
};

export async function crawlBrandWebsite(
  _prevState: CrawlState,
  formData: FormData,
): Promise<CrawlState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return { status: "error", message: "Pick a brand first." };

  try {
    const prisma = getPrisma();
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { websiteUrl: true },
    });
    if (!brand) return { status: "error", message: "Brand not found." };
    if (!brand.websiteUrl) {
      return {
        status: "error",
        message: "This brand has no website URL. Add one on its brand page first.",
      };
    }

    const pages = await crawlSite(brand.websiteUrl);
    if (!pages.length) {
      return { status: "error", message: "Nothing could be fetched from that URL." };
    }

    const lastCrawledAt = new Date();
    for (const page of pages) {
      const data = { ...page, lastCrawledAt };
      await prisma.websitePage.upsert({
        where: { brandId_url: { brandId, url: page.url } },
        update: data,
        create: { brandId, ...data },
      });
    }

    // Pages that vanished between two crawls should not linger in the audit.
    await prisma.websitePage.deleteMany({
      where: { brandId, url: { notIn: pages.map((page) => page.url) } },
    });

    revalidatePath("/dashboard/search");
    return {
      status: "done",
      message: `Crawled ${pages.length} page${pages.length === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Crawl failed.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Keyword discovery                                                          */
/* -------------------------------------------------------------------------- */

/** How many enriched keywords are kept and sent to the SERP endpoint. */
const KEPT_KEYWORDS = 5;

export async function discoverKeywords(
  _prevState: CrawlState,
  formData: FormData,
): Promise<CrawlState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return { status: "error", message: "Pick a brand first." };

  try {
    const prisma = getPrisma();
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        profile: true,
        websitePages: { orderBy: { url: "asc" }, take: 50 },
        competitors: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!brand) return { status: "error", message: "Brand not found." };

    if (
      !brand.profile?.mission &&
      !brand.websitePages.length &&
      !brand.competitors.length
    ) {
      return {
        status: "error",
        message:
          "Nothing to seed from. Add a mission, crawl the site, or add a competitor first.",
      };
    }

    // 1. Seed keywords from what the brand already knows about itself.
    const seeds = await generateSeedKeywords({
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
      pages: brand.websitePages.map((page) => ({
        url: page.url,
        title: page.title,
        h1: page.h1,
      })),
      competitors: brand.competitors.map((competitor) => ({
        name: competitor.name,
        websiteUrl: competitor.websiteUrl,
      })),
    });
    if (!seeds.length) {
      return { status: "error", message: "No seed keyword could be proposed." };
    }

    // 2. Enrich with real volume, difficulty and intent.
    const metrics = await fetchKeywordMetrics(seeds);
    if (!metrics.length) {
      return {
        status: "error",
        message: "DataForSEO returned no metrics for those keywords.",
      };
    }

    // 3. Keep the strongest few.
    const scored = metrics
      .map((item) => ({ ...item, priorityScore: priorityScore(item) }))
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, KEPT_KEYWORDS);

    let serpCount = 0;

    for (const item of scored) {
      const keyword = await prisma.keyword.upsert({
        where: { brandId_keyword: { brandId, keyword: item.keyword } },
        update: {
          searchVolume: item.searchVolume,
          difficulty: item.difficulty,
          intent: item.intent,
          priorityScore: item.priorityScore,
        },
        create: {
          brandId,
          keyword: item.keyword,
          searchVolume: item.searchVolume,
          difficulty: item.difficulty,
          intent: item.intent,
          priorityScore: item.priorityScore,
        },
      });

      // 4. Live SERP for each kept keyword, replacing the previous snapshot.
      // Skip keywords with no measurable demand — the SERP call is billed.
      const serp = item.searchVolume ? await fetchSerp(item.keyword) : [];
      await prisma.serpCompetitor.deleteMany({ where: { keywordId: keyword.id } });
      if (serp.length) {
        const checkedAt = new Date();
        await prisma.serpCompetitor.createMany({
          data: serp.map((entry) => ({
            brandId,
            keywordId: keyword.id,
            domain: entry.domain,
            position: entry.position,
            url: entry.url,
            title: entry.title,
            checkedAt,
          })),
        });
        serpCount += serp.length;
      }
    }

    revalidatePath("/dashboard/search");
    return {
      status: "done",
      message: `Kept ${scored.length} of ${metrics.length} keywords · ${serpCount} SERP results.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Keyword discovery failed.",
    };
  }
}

/* -------------------------------------------------------------------------- */
/* SEO opportunities                                                          */
/* -------------------------------------------------------------------------- */

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function generateSeoOpportunitiesAction(
  _prevState: CrawlState,
  formData: FormData,
): Promise<CrawlState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return { status: "error", message: "Pick a brand first." };

  try {
    const prisma = getPrisma();
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: {
        profile: true,
        websitePages: { orderBy: { url: "asc" }, take: 50 },
        competitors: { orderBy: { createdAt: "asc" } },
        keywords: {
          orderBy: { priorityScore: "desc" },
          include: { serpCompetitors: { orderBy: { position: "asc" }, take: 10 } },
        },
        opportunities: { select: { title: true } },
      },
    });
    if (!brand) return { status: "error", message: "Brand not found." };

    if (!brand.websitePages.length && !brand.keywords.length) {
      return {
        status: "error",
        message: "Crawl the site or discover keywords first — there is nothing to work from.",
      };
    }

    const generated = await generateSeoOpportunities({
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
      pages: brand.websitePages.map((page) => ({
        url: page.url,
        title: page.title,
        metaDescription: page.metaDescription,
        h1: page.h1,
        statusCode: page.statusCode,
        wordCount: page.wordCount,
      })),
      keywords: brand.keywords.map((keyword) => ({
        keyword: keyword.keyword,
        searchVolume: keyword.searchVolume,
        difficulty: keyword.difficulty,
        intent: keyword.intent,
        priorityScore: keyword.priorityScore,
        serp: keyword.serpCompetitors.map((entry) => ({
          position: entry.position,
          domain: entry.domain,
          url: entry.url,
        })),
      })),
      competitors: brand.competitors.map((competitor) => ({
        name: competitor.name,
        websiteUrl: competitor.websiteUrl,
      })),
      existingOpportunityTitles: brand.opportunities.map((item) => item.title),
    });

    if (!generated.length) {
      return { status: "done", message: "The model returned no opportunity." };
    }

    const existing = new Set(
      brand.opportunities.map((item) => normalizeTitle(item.title)),
    );
    const fresh = generated.filter((item) => {
      const key = normalizeTitle(item.title);
      if (!key || existing.has(key)) return false;
      existing.add(key);
      return true;
    });

    if (!fresh.length) {
      return {
        status: "done",
        message: "Nothing new — every suggestion already exists.",
      };
    }

    await prisma.opportunity.createMany({
      data: fresh.map((item) => ({
        brandId,
        title: item.title,
        description: item.description,
        source: OpportunitySource.SEARCH,
        score: item.score,
        rationale: item.rationale,
        actionType: item.actionType as SeoActionType,
        targetUrl: item.targetUrl || null,
        targetKeyword: item.targetKeyword || null,
      })),
    });

    revalidatePath("/dashboard/search");
    revalidatePath("/dashboard/opportunities");

    const skipped = generated.length - fresh.length;
    return {
      status: "done",
      message:
        `Created ${fresh.length} SEO opportunit${fresh.length === 1 ? "y" : "ies"}` +
        (skipped ? ` · ${skipped} skipped as duplicates.` : "."),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Generation failed.",
    };
  }
}
