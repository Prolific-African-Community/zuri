/**
 * Before/after reading of an executed action. Local arithmetic only — a window,
 * two sets of numbers, and a verdict Zuri can defend. No AI, no modelling.
 */

export type Outcome = "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "NOT_ENOUGH_DATA";

export type Metrics = Record<string, number>;

export type Window = { start: Date; end: Date; days: number; label: string };

/** Below this the after-window is too short for the numbers to mean anything. */
export const MIN_DAYS = 3;

/** A change smaller than this is noise, not an effect. */
const SIGNIFICANT = 0.1;

const DAY = 24 * 60 * 60 * 1000;

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function label(start: Date, end: Date) {
  return `${isoDate(start)} → ${isoDate(end)}`;
}

/**
 * After runs from the execution to today; before is the same number of days
 * immediately preceding it, so the two windows are directly comparable.
 */
export function windows(executedAt: Date, now = new Date()) {
  const afterStart = new Date(executedAt);
  const afterEnd = now;
  const days = Math.max(1, Math.round((afterEnd.getTime() - afterStart.getTime()) / DAY));

  const beforeEnd = new Date(afterStart.getTime() - DAY);
  const beforeStart = new Date(beforeEnd.getTime() - (days - 1) * DAY);

  const before: Window = {
    start: beforeStart,
    end: beforeEnd,
    days,
    label: label(beforeStart, beforeEnd),
  };
  const after: Window = {
    start: afterStart,
    end: afterEnd,
    days,
    label: label(afterStart, afterEnd),
  };
  return { before, after, days };
}

function ratio(before: number, after: number) {
  if (before === 0) return after === 0 ? 0 : 1;
  return (after - before) / before;
}

function pct(value: number) {
  const rounded = Math.round(value * 1000) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/* -------------------------------------------------------------------------- */
/* Google Ads                                                                 */
/* -------------------------------------------------------------------------- */

export type AdsRaw = {
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
};

export function adsMetrics(raw: AdsRaw): Metrics {
  return {
    impressions: raw.impressions,
    clicks: raw.clicks,
    cost: round(raw.costMicros / 1_000_000),
    ctr: raw.impressions ? round((raw.clicks / raw.impressions) * 100, 2) : 0,
    cpc: raw.clicks ? round(raw.costMicros / raw.clicks / 1_000_000, 2) : 0,
    conversions: round(raw.conversions, 2),
  };
}

/* -------------------------------------------------------------------------- */
/* Search Console                                                             */
/* -------------------------------------------------------------------------- */

export type SeoRaw = {
  impressions: number;
  clicks: number;
  ctr: number;
  position: number;
};

export function seoMetrics(raw: SeoRaw): Metrics {
  return {
    impressions: raw.impressions,
    clicks: raw.clicks,
    ctr: round(raw.ctr * 100, 2),
    position: round(raw.position, 1),
  };
}

/* -------------------------------------------------------------------------- */
/* Verdict                                                                    */
/* -------------------------------------------------------------------------- */

export type Verdict = { outcome: Outcome; headline: string; observation: string };

function empty(metrics: Metrics) {
  return (metrics.impressions ?? 0) === 0 && (metrics.clicks ?? 0) === 0;
}

export function judgeAds(
  before: Metrics,
  after: Metrics,
  days: number,
  context: { keywordText: string; isNew: boolean },
): Verdict {
  if (days < MIN_DAYS || (empty(before) && empty(after))) {
    return {
      outcome: "NOT_ENOUGH_DATA",
      headline: "Not enough data",
      observation:
        days < MIN_DAYS
          ? `Only ${days} day${days === 1 ? "" : "s"} since execution — wait until ${MIN_DAYS} before reading anything into it.`
          : "Neither window recorded a single impression, so nothing can be compared yet.",
    };
  }

  // A brand-new keyword has no before by definition: it either ran or it did not.
  if (context.isNew) {
    if (after.impressions === 0) {
      return {
        outcome: "NEUTRAL",
        headline: "0 impressions",
        observation: `"${context.keywordText}" has not been shown once in ${days} day${days === 1 ? "" : "s"} — check the bid, the budget, or whether the term has any paid demand.`,
      };
    }
    return {
      outcome: after.clicks > 0 ? "POSITIVE" : "NEUTRAL",
      headline: `${after.impressions} impressions, ${after.clicks} clicks`,
      observation:
        after.clicks > 0
          ? `The keyword is live and drew ${after.clicks} click${after.clicks === 1 ? "" : "s"} at ${after.ctr}% CTR for ${after.cost} spent.`
          : `The keyword is being shown but never clicked — the ad copy or the match is off, not the targeting.`,
    };
  }

  if (after.conversions !== before.conversions) {
    const change = ratio(before.conversions, after.conversions);
    return {
      outcome: after.conversions > before.conversions ? "POSITIVE" : "NEGATIVE",
      headline: `Conversions ${pct(change)}`,
      observation: `Conversions moved from ${before.conversions} to ${after.conversions} over ${days} day${days === 1 ? "" : "s"}.`,
    };
  }

  const change = ratio(before.ctr, after.ctr);
  if (Math.abs(change) < SIGNIFICANT) {
    return {
      outcome: "NEUTRAL",
      headline: `CTR ${pct(change)}`,
      observation: `CTR held around ${after.ctr}% — the change had no measurable effect on how often the ad is clicked.`,
    };
  }
  return {
    outcome: change > 0 ? "POSITIVE" : "NEGATIVE",
    headline: `CTR ${pct(change)}`,
    observation: `CTR went from ${before.ctr}% to ${after.ctr}% while cost went from ${before.cost} to ${after.cost}.`,
  };
}

export function judgeSeo(before: Metrics, after: Metrics, days: number): Verdict {
  if (days < MIN_DAYS || (empty(before) && empty(after))) {
    return {
      outcome: "NOT_ENOUGH_DATA",
      headline: "Not enough data",
      observation:
        days < MIN_DAYS
          ? `Only ${days} day${days === 1 ? "" : "s"} since execution, and Search Console lags a further two.`
          : "Search Console reports no impressions in either window for this page.",
    };
  }

  const change = ratio(before.impressions, after.impressions);
  if (Math.abs(change) < SIGNIFICANT) {
    return {
      outcome: "NEUTRAL",
      headline: `Impressions ${pct(change)}`,
      observation: `The page held its ${after.impressions} impressions and position ${after.position} — the change was not enough to move visibility.`,
    };
  }
  return {
    outcome: change > 0 ? "POSITIVE" : "NEGATIVE",
    headline: `Impressions ${pct(change)}`,
    observation:
      change > 0
        ? `Impressions went from ${before.impressions} to ${after.impressions} and position from ${before.position} to ${after.position}.`
        : `Impressions fell from ${before.impressions} to ${after.impressions} — worth checking whether the change hurt the page.`,
  };
}
