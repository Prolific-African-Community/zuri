"use server";

import { SearchConsoleDimension } from "@/lib/generated/prisma/enums";
import {
  disconnectGoogle,
  getConnection,
  listProperties,
  querySearchAnalytics,
} from "@/lib/google";
import { getPrisma } from "@/lib/prisma";
import { resolveProperty } from "@/lib/search-console";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type GoogleState = {
  status: "idle" | "done" | "error";
  message: string;
};

/** 28 days, ending three days back: Search Console data lags ~2 days. */
const WINDOW_DAYS = 28;
const LAG_DAYS = 3;
const ROW_LIMIT = 25;

function refresh() {
  revalidatePath("/dashboard/search");
}

function windows() {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - LAG_DAYS);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (WINDOW_DAYS - 1));

  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - (WINDOW_DAYS - 1));

  return { start, end, previousStart, previousEnd };
}

/** Normalises a URL so a Search Console page matches a crawled page. */
function normalizeUrl(value: string) {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/$/, "");
    return `${url.hostname.replace(/^www\./i, "")}${path}`.toLowerCase();
  } catch {
    return value.toLowerCase();
  }
}

export async function disconnectGoogleAction() {
  await requireSession();
  await disconnectGoogle();
  refresh();
}

export async function syncSearchConsole(
  _prevState: GoogleState,
  formData: FormData,
): Promise<GoogleState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return { status: "error", message: "Pick a brand first." };

  try {
    const prisma = getPrisma();

    if (!(await getConnection())) {
      return { status: "error", message: "Connect a Google account first." };
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return { status: "error", message: "Brand not found." };

    const available = await listProperties();

    // A brand with no property gets one resolved from its own website URL.
    // An existing choice is never overwritten.
    let property = brand.searchConsoleProperty;
    if (!property) {
      const resolved = resolveProperty(brand.websiteUrl, available);
      if (!resolved) {
        return {
          status: "error",
          message: brand.websiteUrl
            ? "No verified Search Console property found for this brand URL. Pick one on the brand page."
            : "Google Search Console is connected, but no property is selected for this brand.",
        };
      }
      console.log(
        "Search Console property resolved",
        brand.name,
        resolved.property,
        resolved.reason,
      );
      await prisma.brand.update({
        where: { id: brandId },
        data: { searchConsoleProperty: resolved.property },
      });
      property = resolved.property;
    }

    if (!available.some((entry) => entry.siteUrl === property)) {
      return {
        status: "error",
        message: `"${property}" is not a property on the connected account.`,
      };
    }

    const period = windows();

    // Matching targets, fetched once and reused for both periods.
    const [keywords, pages] = await Promise.all([
      prisma.keyword.findMany({
        where: { brandId },
        select: { id: true, keyword: true },
      }),
      prisma.websitePage.findMany({
        where: { brandId },
        select: { id: true, url: true },
      }),
    ]);
    const keywordByText = new Map(
      keywords.map((keyword) => [keyword.keyword.trim().toLowerCase(), keyword.id]),
    );
    const pageByUrl = new Map(pages.map((page) => [normalizeUrl(page.url), page.id]));

    let totalRows = 0;
    let matchedKeywords = 0;
    let matchedPages = 0;

    for (const [start, end] of [
      [period.start, period.end],
      [period.previousStart, period.previousEnd],
    ] as const) {
      const [totals, queries, pageRows] = await Promise.all([
        querySearchAnalytics(property, start, end),
        querySearchAnalytics(property, start, end, "query", ROW_LIMIT),
        querySearchAnalytics(property, start, end, "page", ROW_LIMIT),
      ]);

      const summary = totals[0] ?? {
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      };

      const sync = await prisma.searchConsoleSync.upsert({
        where: { brandId_startDate_endDate: { brandId, startDate: start, endDate: end } },
        update: {
          property,
          clicks: summary.clicks,
          impressions: summary.impressions,
          ctr: summary.ctr,
          position: summary.position,
          syncedAt: new Date(),
        },
        create: {
          brandId,
          property,
          startDate: start,
          endDate: end,
          clicks: summary.clicks,
          impressions: summary.impressions,
          ctr: summary.ctr,
          position: summary.position,
        },
      });

      // A sync replaces its own rows rather than accumulating duplicates.
      await prisma.searchConsoleRow.deleteMany({ where: { syncId: sync.id } });

      const rows = [
        ...queries.map((row) => {
          const keywordId = keywordByText.get(row.key.trim().toLowerCase()) ?? null;
          if (keywordId) matchedKeywords += 1;
          return {
            syncId: sync.id,
            brandId,
            dimension: SearchConsoleDimension.QUERY,
            value: row.key,
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
            keywordId,
            websitePageId: null,
          };
        }),
        ...pageRows.map((row) => {
          const websitePageId = pageByUrl.get(normalizeUrl(row.key)) ?? null;
          if (websitePageId) matchedPages += 1;
          return {
            syncId: sync.id,
            brandId,
            dimension: SearchConsoleDimension.PAGE,
            value: row.key,
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
            keywordId: null,
            websitePageId,
          };
        }),
      ];

      if (rows.length) {
        await prisma.searchConsoleRow.createMany({ data: rows });
        totalRows += rows.length;
      }
    }

    refresh();
    return {
      status: "done",
      message:
        `Imported ${totalRows} row${totalRows === 1 ? "" : "s"} over two 28-day periods` +
        (matchedKeywords || matchedPages
          ? ` · matched ${matchedKeywords} keyword${matchedKeywords === 1 ? "" : "s"} and ${matchedPages} page${matchedPages === 1 ? "" : "s"}.`
          : "."),
    };
  } catch (error) {
    console.error("Search Console sync failed", brandId, error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Sync failed.",
    };
  }
}

/** Manual choice, when no match is reliable enough to pick on its own. */
export async function setSearchConsoleProperty(brandId: string, formData: FormData) {
  await requireSession();

  const property = String(formData.get("property") ?? "").trim();
  const prisma = getPrisma();

  if (!property) {
    await prisma.brand.update({
      where: { id: brandId },
      data: { searchConsoleProperty: null },
    });
  } else {
    const available = await listProperties();
    if (!available.some((entry) => entry.siteUrl === property)) {
      throw new Error(`"${property}" is not a property on the connected account.`);
    }
    await prisma.brand.update({
      where: { id: brandId },
      data: { searchConsoleProperty: property },
    });
  }

  revalidatePath(`/dashboard/brands/${brandId}`);
  refresh();
}
