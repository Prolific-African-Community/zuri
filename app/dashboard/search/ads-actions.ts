"use server";

import {
  adsConfigured,
  listAccessibleCustomers,
  listCampaigns,
  managerCustomerId,
  brandCustomerId,
} from "@/lib/google-ads";
import { getConnection, hasAdsScope } from "@/lib/google";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";

export type AdsState = {
  status: "idle" | "done" | "error";
  message: string;
};

/** Read-only connection check: lists customers, then reads 30 days of campaigns. */
export async function testGoogleAds(): Promise<AdsState> {
  await requireSession();

  try {
    const connection = await getConnection();
    if (!connection) {
      return { status: "error", message: "Connect a Google account first." };
    }
    if (!hasAdsScope(connection.scope)) {
      return {
        status: "error",
        message: "The connection predates the Ads scope. Disconnect and connect again.",
      };
    }
    if (!adsConfigured()) {
      return { status: "error", message: "GOOGLE_ADS_DEVELOPER_TOKEN must be set." };
    }

    const brands = await getPrisma().brand.findMany({
      where: { googleAdsCustomerId: { not: null } },
      select: { name: true, googleAdsCustomerId: true },
    });
    if (!brands.length) {
      return {
        status: "error",
        message: "No brand has a Google Ads customer configured.",
      };
    }

    const accessible = await listAccessibleCustomers();
    // The first configured brand is enough to prove the connection works.
    const customer = brandCustomerId(brands[0]);
    const manager = managerCustomerId();

    const reachable =
      accessible.includes(customer) || accessible.includes(manager);
    if (!reachable) {
      return {
        status: "error",
        message: `Neither ${customer} nor ${manager} is accessible. Reachable: ${
          accessible.join(", ") || "none"
        }.`,
      };
    }

    const campaigns = await listCampaigns(customer);
    const impressions = campaigns.reduce((sum, row) => sum + row.impressions, 0);
    const clicks = campaigns.reduce((sum, row) => sum + row.clicks, 0);
    const cost = campaigns.reduce((sum, row) => sum + row.costMicros, 0) / 1_000_000;

    return {
      status: "done",
      message:
        `${accessible.length} account${accessible.length === 1 ? "" : "s"} accessible · ` +
        `${customer}: ${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} ` +
        `over 30 days — ${impressions.toLocaleString("en")} impressions, ` +
        `${clicks.toLocaleString("en")} clicks, ${cost.toFixed(2)} spend.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Google Ads test failed.",
    };
  }
}
