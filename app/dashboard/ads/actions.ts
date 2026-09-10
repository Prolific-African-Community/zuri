"use server";

import { AdsLevel } from "@/lib/generated/prisma/enums";
import { getConnection, hasAdsScope } from "@/lib/google";
import {
  adsConfigured,
  listAccessibleCustomers,
  reportAdGroups,
  reportCampaigns,
  reportKeywords,
  reportSearchTerms,
  brandCustomerId,
  type AdsReportRow,
} from "@/lib/google-ads";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type AdsSyncState = {
  status: "idle" | "done" | "error";
  message: string;
};

const WINDOW_DAYS = 30;

/** Loose text match so an Ads keyword lines up with a Zuri keyword. */
function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/^[+"[\]]+|[+"[\]]+$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export async function syncGoogleAds(
  _prevState: AdsSyncState,
  formData: FormData,
): Promise<AdsSyncState> {
  await requireSession();

  const brandId = String(formData.get("brandId") ?? "").trim();
  if (!brandId) return { status: "error", message: "Pick a brand first." };

  try {
    const prisma = getPrisma();

    const connection = await getConnection();
    if (!connection) {
      return { status: "error", message: "Connect a Google account first." };
    }
    if (!hasAdsScope(connection.scope)) {
      return {
        status: "error",
        message: "The connection has no Ads scope. Disconnect and connect again.",
      };
    }
    if (!adsConfigured()) {
      return {
        status: "error",
        message: "GOOGLE_ADS_DEVELOPER_TOKEN must be set.",
      };
    }

    const brand = await prisma.brand.findUnique({ where: { id: brandId } });
    if (!brand) return { status: "error", message: "Brand not found." };

    const customerId = brandCustomerId(brand);
    if (!customerId) {
      return { status: "error", message: "No Google Ads customer configured for this brand." };
    }
    const accessible = await listAccessibleCustomers();
    if (!accessible.includes(customerId)) {
      return {
        status: "error",
        message: `Customer ${customerId} is not accessible from this account.`,
      };
    }

    const [campaigns, adGroups, keywords, searchTerms] = await Promise.all([
      reportCampaigns(customerId),
      reportAdGroups(customerId),
      reportKeywords(customerId),
      reportSearchTerms(customerId),
    ]);

    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (WINDOW_DAYS - 1));

    const totals = campaigns.reduce(
      (sum, row) => ({
        impressions: sum.impressions + row.impressions,
        clicks: sum.clicks + row.clicks,
        costMicros: sum.costMicros + row.costMicros,
        conversions: sum.conversions + row.conversions,
      }),
      { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 },
    );

    const sync = await prisma.adsSync.upsert({
      where: {
        brandId_customerId_startDate_endDate: {
          brandId,
          customerId,
          startDate: start,
          endDate: end,
        },
      },
      update: {
        impressions: totals.impressions,
        clicks: totals.clicks,
        costMicros: BigInt(Math.round(totals.costMicros)),
        conversions: totals.conversions,
        syncedAt: new Date(),
      },
      create: {
        brandId,
        customerId,
        startDate: start,
        endDate: end,
        impressions: totals.impressions,
        clicks: totals.clicks,
        costMicros: BigInt(Math.round(totals.costMicros)),
        conversions: totals.conversions,
      },
    });

    // A snapshot replaces its own rows rather than accumulating duplicates.
    await prisma.adsRow.deleteMany({ where: { syncId: sync.id } });

    const zuriKeywords = await prisma.keyword.findMany({
      where: { brandId },
      select: { id: true, keyword: true },
    });
    const keywordByText = new Map(
      zuriKeywords.map((keyword) => [normalize(keyword.keyword), keyword.id]),
    );

    let matched = 0;
    const toRow = (level: AdsLevel) => (row: AdsReportRow) => {
      const keywordId =
        row.text && (level === "KEYWORD" || level === "SEARCH_TERM")
          ? (keywordByText.get(normalize(row.text)) ?? null)
          : null;
      if (keywordId) matched += 1;
      return {
        syncId: sync.id,
        brandId,
        level,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        adGroupId: row.adGroupId,
        adGroupName: row.adGroupName,
        text: row.text,
        matchType: row.matchType,
        status: row.status,
        impressions: row.impressions,
        clicks: row.clicks,
        costMicros: BigInt(Math.round(row.costMicros)),
        conversions: row.conversions,
        keywordId,
      };
    };

    const rows = [
      ...campaigns.map(toRow(AdsLevel.CAMPAIGN)),
      ...adGroups.map(toRow(AdsLevel.AD_GROUP)),
      ...keywords.map(toRow(AdsLevel.KEYWORD)),
      ...searchTerms.map(toRow(AdsLevel.SEARCH_TERM)),
    ];

    if (rows.length) await prisma.adsRow.createMany({ data: rows });

    revalidatePath("/dashboard/ads");
    return {
      status: "done",
      message:
        `${campaigns.length} campaigns, ${adGroups.length} ad groups, ` +
        `${keywords.length} keywords, ${searchTerms.length} search terms` +
        (matched ? ` · ${matched} matched a Zuri keyword.` : "."),
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Ads sync failed.",
    };
  }
}
