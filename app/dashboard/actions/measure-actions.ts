"use server";

import { ActionStatus, ActionType } from "@/lib/generated/prisma/enums";
import { getConnection, hasAdsScope, querySearchAnalytics } from "@/lib/google";
import {
  brandCustomerId,
  campaignMetricsRange,
  keywordMetricsRange,
} from "@/lib/google-ads";
import {
  adsMetrics,
  isoDate,
  judgeAds,
  judgeSeo,
  seoMetrics,
  windows,
  type Metrics,
  type Outcome,
} from "@/lib/measurement";
import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type MeasureState = { status: "idle" | "done" | "error"; message: string };

const EMPTY: Metrics = { impressions: 0, clicks: 0 };

function readPayload(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

/** Search Console lags roughly two days; never ask it for today. */
function seoEnd(end: Date) {
  const capped = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
  return end > capped ? capped : end;
}

export async function measureAction(
  _prevState: MeasureState,
  formData: FormData,
): Promise<MeasureState> {
  await requireSession();

  const actionId = String(formData.get("actionId") ?? "").trim();
  if (!actionId) return { status: "error", message: "Missing action." };

  try {
    const prisma = getPrisma();
    const action = await prisma.proposedAction.findUnique({ where: { id: actionId } });
    if (!action) return { status: "error", message: "Action not found." };
    if (!action.executedAt) {
      return { status: "error", message: "Only an executed action can be measured." };
    }

    const { before, after, days } = windows(action.executedAt);

    let metricsBefore: Metrics = EMPTY;
    let metricsAfter: Metrics = EMPTY;
    let verdict: { outcome: Outcome; headline: string; observation: string };

    if (action.type === ActionType.GOOGLE_ADS) {
      const connection = await getConnection();
      if (!connection || !hasAdsScope(connection.scope)) {
        return { status: "error", message: "Google Ads is not connected." };
      }

      const payload = readPayload(action.payload);
      const customerId = text(payload.customerId);
      const brand = await prisma.brand.findUnique({ where: { id: action.brandId } });
      if (!customerId || !brand || customerId !== brandCustomerId(brand)) {
        return {
          status: "error",
          message: "This action targets a customer outside the configured account.",
        };
      }

      const adGroupId = text(payload.adGroupId);
      const campaignId = text(payload.campaignId);
      const keywordText = text(payload.keywordText);

      const read = (start: Date, end: Date) =>
        adGroupId && keywordText
          ? keywordMetricsRange(customerId, adGroupId, keywordText, isoDate(start), isoDate(end))
          : campaignMetricsRange(customerId, campaignId, isoDate(start), isoDate(end));

      if (!adGroupId && !campaignId) {
        return { status: "error", message: "This action has nothing to measure against." };
      }

      const [rawBefore, rawAfter] = await Promise.all([
        read(before.start, before.end),
        read(after.start, after.end),
      ]);

      metricsBefore = adsMetrics(rawBefore);
      metricsAfter = adsMetrics(rawAfter);
      verdict = judgeAds(metricsBefore, metricsAfter, days, {
        keywordText,
        // Adding a keyword creates the thing being measured, so there is no before.
        isNew: text(payload.adsActionType) === "ADD_KEYWORD",
      });
    } else {
      const sync = await prisma.searchConsoleSync.findFirst({
        where: { brandId: action.brandId },
        orderBy: { syncedAt: "desc" },
        select: { property: true },
      });
      if (!sync) {
        return { status: "error", message: "Connect Search Console for this brand first." };
      }

      const target = (action.target ?? "").toLowerCase();
      const pick = async (start: Date, end: Date) => {
        const rows = await querySearchAnalytics(sync.property, start, seoEnd(end), "page", 200);
        const matched = target
          ? rows.filter(
              (row) =>
                row.key.toLowerCase().includes(target) ||
                target.includes(row.key.toLowerCase()),
            )
          : [];
        const chosen = matched.length ? matched : rows;
        return chosen.reduce(
          (total, row) => ({
            impressions: total.impressions + row.impressions,
            clicks: total.clicks + row.clicks,
            ctr: total.ctr + row.ctr * row.impressions,
            position: total.position + row.position * row.impressions,
          }),
          { impressions: 0, clicks: 0, ctr: 0, position: 0 },
        );
      };

      const [rawBefore, rawAfter] = await Promise.all([
        pick(before.start, before.end),
        pick(after.start, after.end),
      ]);

      // ctr and position were accumulated weighted by impressions.
      const flatten = (raw: typeof rawBefore) =>
        seoMetrics({
          impressions: raw.impressions,
          clicks: raw.clicks,
          ctr: raw.impressions ? raw.ctr / raw.impressions : 0,
          position: raw.impressions ? raw.position / raw.impressions : 0,
        });

      metricsBefore = flatten(rawBefore);
      metricsAfter = flatten(rawAfter);
      verdict = judgeSeo(metricsBefore, metricsAfter, days);
    }

    await prisma.actionMeasurement.create({
      data: {
        actionId,
        periodBefore: before.label,
        periodAfter: after.label,
        metricsBefore: { ...metricsBefore },
        metricsAfter: { ...metricsAfter },
        outcome: verdict.outcome,
        headline: verdict.headline,
        observation: verdict.observation,
      },
    });

    await prisma.proposedAction.update({
      where: { id: actionId },
      data: {
        measuredAt: new Date(),
        // A reading that says nothing yet must not look like a finished action.
        ...(verdict.outcome === "NOT_ENOUGH_DATA"
          ? {}
          : { status: ActionStatus.MEASURED }),
      },
    });

    revalidatePath("/dashboard/actions");
    revalidatePath("/dashboard");
    return { status: "done", message: verdict.headline };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not measure.",
    };
  }
}
