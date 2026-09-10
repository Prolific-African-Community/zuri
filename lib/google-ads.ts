/**
 * Google Ads read-only access, server-side only. Reuses the Google OAuth
 * connection already stored for Search Console. Nothing here writes: it lists
 * the accessible customers and runs GAQL SELECT queries.
 */

import { googleAccessToken } from "@/lib/google";

const DEFAULT_VERSION = "v22";

function apiBase() {
  const version = process.env.GOOGLE_ADS_API_VERSION?.trim() || DEFAULT_VERSION;
  return `https://googleads.googleapis.com/${version}`;
}

/** Google Ads wants digits only — no dashes, no spaces. */
export function normalizeCustomerId(value: string | undefined | null) {
  return (value ?? "").replace(/\D/g, "");
}

/** The developer token is global; the account is per brand. */
export function adsConfigured() {
  return Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());
}

export function managerCustomerId() {
  return normalizeCustomerId(process.env.GOOGLE_ADS_MANAGER_CUSTOMER_ID);
}

/**
 * The Google Ads account a brand reads and writes. There is no global
 * fallback: a brand without one simply has no Ads.
 */
export function brandCustomerId(brand: { googleAdsCustomerId: string | null }) {
  return normalizeCustomerId(brand.googleAdsCustomerId);
}

/**
 * Which accounts the signed-in user reaches directly. Cached per process: it
 * only changes when someone is granted or revoked access.
 */
let directAccounts: Promise<string[]> | null = null;

function accessibleAccounts() {
  directAccounts ??= listAccessibleCustomers().catch(() => []);
  return directAccounts;
}

async function headers(customerId?: string) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!developerToken) {
    throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN must be set. See .env.example.");
  }

  const manager = managerCustomerId();
  // An account the user owns directly is refused when a manager it does not
  // belong to is announced, so the header is only sent when it is needed.
  const direct = customerId ? (await accessibleAccounts()).includes(customerId) : false;
  const useManager = Boolean(manager) && !direct;

  return {
    Authorization: `Bearer ${await googleAccessToken()}`,
    "developer-token": developerToken,
    ...(useManager ? { "login-customer-id": manager } : {}),
    "Content-Type": "application/json",
  };
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const customerId = /^\/customers\/(\d+)/.exec(path)?.[1];
  const response = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { ...(await headers(customerId)), ...(init.headers ?? {}) },
  });

  const text = await response.text();
  if (!response.ok) {
    console.error("Google Ads request failed", path, response.status, text);
    let message = "";
    try {
      const payload = JSON.parse(text) as {
        error?: { message?: string; details?: unknown[] };
      };
      message = payload.error?.message ?? "";
    } catch {
      message = "";
    }
    throw new Error(
      `Google Ads ${response.status}${message ? `: ${message.slice(0, 180)}` : ""}`,
    );
  }

  return text ? JSON.parse(text) : null;
}

/** Every customer the connected Google account can reach. */
export async function listAccessibleCustomers(): Promise<string[]> {
  const payload = (await call("/customers:listAccessibleCustomers")) as {
    resourceNames?: string[];
  };
  return (payload.resourceNames ?? []).map((name) => name.replace("customers/", ""));
}

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  impressions: number;
  clicks: number;
  costMicros: number;
};

/** Read-only GAQL over the last 30 days. Never mutates anything. */
export async function listCampaigns(customerId: string): Promise<CampaignRow[]> {
  const query = [
    "SELECT campaign.id, campaign.name, campaign.status,",
    "metrics.impressions, metrics.clicks, metrics.cost_micros",
    "FROM campaign",
    "WHERE segments.date DURING LAST_30_DAYS",
  ].join(" ");

  const payload = (await call(`/customers/${customerId}/googleAds:search`, {
    method: "POST",
    body: JSON.stringify({ query }),
  })) as {
    results?: {
      campaign?: { id?: string; name?: string; status?: string };
      metrics?: { impressions?: string; clicks?: string; costMicros?: string };
    }[];
  };

  return (payload.results ?? []).map((row) => ({
    id: row.campaign?.id ?? "",
    name: row.campaign?.name ?? "",
    status: row.campaign?.status ?? "",
    impressions: Number(row.metrics?.impressions ?? 0),
    clicks: Number(row.metrics?.clicks ?? 0),
    costMicros: Number(row.metrics?.costMicros ?? 0),
  }));
}

/* -------------------------------------------------------------------------- */
/* Read-only reporting                                                        */
/* -------------------------------------------------------------------------- */

export type AdsMetrics = {
  impressions: number;
  clicks: number;
  costMicros: number;
  conversions: number;
};

export type AdsReportRow = AdsMetrics & {
  campaignId: string | null;
  campaignName: string | null;
  adGroupId: string | null;
  adGroupName: string | null;
  text: string | null;
  matchType: string | null;
  status: string | null;
};

type RawRow = {
  campaign?: { id?: string; name?: string; status?: string };
  adGroup?: { id?: string; name?: string; status?: string };
  adGroupCriterion?: {
    status?: string;
    keyword?: { text?: string; matchType?: string };
  };
  searchTermView?: { searchTerm?: string; status?: string };
  metrics?: {
    impressions?: string;
    clicks?: string;
    costMicros?: string;
    conversions?: number | string;
  };
};

function metrics(row: RawRow): AdsMetrics {
  return {
    impressions: Number(row.metrics?.impressions ?? 0),
    clicks: Number(row.metrics?.clicks ?? 0),
    costMicros: Number(row.metrics?.costMicros ?? 0),
    conversions: Number(row.metrics?.conversions ?? 0),
  };
}

async function search(customerId: string, query: string): Promise<RawRow[]> {
  const payload = (await call(`/customers/${customerId}/googleAds:search`, {
    method: "POST",
    body: JSON.stringify({ query }),
  })) as { results?: RawRow[] };
  return payload.results ?? [];
}

const LAST_30 = "WHERE segments.date DURING LAST_30_DAYS";

/** Campaigns with their 30-day totals. */
export async function reportCampaigns(customerId: string): Promise<AdsReportRow[]> {
  const rows = await search(
    customerId,
    `SELECT campaign.id, campaign.name, campaign.status, metrics.impressions,
     metrics.clicks, metrics.cost_micros, metrics.conversions
     FROM campaign ${LAST_30}`,
  );

  return rows.map((row) => ({
    campaignId: row.campaign?.id ?? null,
    campaignName: row.campaign?.name ?? null,
    adGroupId: null,
    adGroupName: null,
    text: null,
    matchType: null,
    status: row.campaign?.status ?? null,
    ...metrics(row),
  }));
}

export async function reportAdGroups(customerId: string): Promise<AdsReportRow[]> {
  const rows = await search(
    customerId,
    `SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name,
     metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
     FROM ad_group ${LAST_30}`,
  );

  return rows.map((row) => ({
    campaignId: row.campaign?.id ?? null,
    campaignName: row.campaign?.name ?? null,
    adGroupId: row.adGroup?.id ?? null,
    adGroupName: row.adGroup?.name ?? null,
    text: null,
    matchType: null,
    status: row.adGroup?.status ?? null,
    ...metrics(row),
  }));
}

export async function reportKeywords(customerId: string): Promise<AdsReportRow[]> {
  const rows = await search(
    customerId,
    `SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
     ad_group_criterion.status, ad_group.id, ad_group.name, campaign.id, campaign.name,
     metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
     FROM keyword_view ${LAST_30}`,
  );

  return rows.map((row) => ({
    campaignId: row.campaign?.id ?? null,
    campaignName: row.campaign?.name ?? null,
    adGroupId: row.adGroup?.id ?? null,
    adGroupName: row.adGroup?.name ?? null,
    text: row.adGroupCriterion?.keyword?.text ?? null,
    matchType: row.adGroupCriterion?.keyword?.matchType ?? null,
    status: row.adGroupCriterion?.status ?? null,
    ...metrics(row),
  }));
}

/** Search terms that actually drew an impression, biggest spend first. */
export async function reportSearchTerms(
  customerId: string,
  limit = 50,
): Promise<AdsReportRow[]> {
  const rows = await search(
    customerId,
    `SELECT search_term_view.search_term, search_term_view.status,
     campaign.id, campaign.name, ad_group.id, ad_group.name,
     metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
     FROM search_term_view ${LAST_30}
     ORDER BY metrics.cost_micros DESC
     LIMIT ${limit}`,
  );

  return rows.map((row) => ({
    campaignId: row.campaign?.id ?? null,
    campaignName: row.campaign?.name ?? null,
    adGroupId: row.adGroup?.id ?? null,
    adGroupName: row.adGroup?.name ?? null,
    text: row.searchTermView?.searchTerm ?? null,
    matchType: null,
    status: row.searchTermView?.status ?? null,
    ...metrics(row),
  }));
}

/* -------------------------------------------------------------------------- */
/* Write operations — only ever reached from an approved action               */
/* -------------------------------------------------------------------------- */

export type AdGroupRef = {
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  campaignStatus: string;
};

/** Confirms an ad group exists in the configured account before writing. */
export async function findAdGroup(
  customerId: string,
  adGroupId: string,
): Promise<AdGroupRef | null> {
  const rows = await search(
    customerId,
    `SELECT ad_group.id, ad_group.name, campaign.id, campaign.name, campaign.status
     FROM ad_group WHERE ad_group.id = ${Number(adGroupId)}`,
  );
  const row = rows[0];
  if (!row?.adGroup?.id) return null;

  return {
    adGroupId: row.adGroup.id,
    adGroupName: row.adGroup.name ?? "",
    campaignId: row.campaign?.id ?? "",
    campaignName: row.campaign?.name ?? "",
    campaignStatus: row.campaign?.status ?? "",
  };
}

/** Existing criterion for this exact text and match type, if any. */
export async function findKeywordCriterion(
  customerId: string,
  adGroupId: string,
  text: string,
  matchType: string,
) {
  const escaped = text.replace(/'/g, "\'");
  const rows = (await search(
    customerId,
    `SELECT ad_group_criterion.criterion_id, ad_group_criterion.status,
     ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type
     FROM ad_group_criterion
     WHERE ad_group.id = ${Number(adGroupId)}
       AND ad_group_criterion.type = KEYWORD
       AND ad_group_criterion.keyword.text = '${escaped}'
       AND ad_group_criterion.keyword.match_type = ${matchType}`,
  )) as (RawRow & { adGroupCriterion?: { criterionId?: string } })[];

  const row = rows[0];
  if (!row?.adGroupCriterion) return null;
  return {
    criterionId: row.adGroupCriterion.criterionId ?? "",
    status: row.adGroupCriterion.status ?? "",
  };
}

async function mutate(
  customerId: string,
  resource: string,
  operations: unknown[],
): Promise<string[]> {
  const payload = (await call(`/customers/${customerId}/${resource}:mutate`, {
    method: "POST",
    body: JSON.stringify({ operations }),
  })) as { results?: { resourceName?: string }[] };

  return (payload.results ?? []).map((result) => result.resourceName ?? "");
}

export async function addKeyword(
  customerId: string,
  adGroupId: string,
  text: string,
  matchType: string,
) {
  return mutate(customerId, "adGroupCriteria", [
    {
      create: {
        adGroup: `customers/${customerId}/adGroups/${adGroupId}`,
        status: "ENABLED",
        keyword: { text, matchType },
      },
    },
  ]);
}

export async function setKeywordStatus(
  customerId: string,
  adGroupId: string,
  criterionId: string,
  status: "ENABLED" | "PAUSED",
) {
  return mutate(customerId, "adGroupCriteria", [
    {
      update: {
        resourceName: `customers/${customerId}/adGroupCriteria/${adGroupId}~${criterionId}`,
        status,
      },
      updateMask: "status",
    },
  ]);
}

/** Negative keywords are added at campaign level so they cover every ad group. */
export async function addNegativeKeyword(
  customerId: string,
  campaignId: string,
  text: string,
  matchType: string,
) {
  return mutate(customerId, "campaignCriteria", [
    {
      create: {
        campaign: `customers/${customerId}/campaigns/${campaignId}`,
        negative: true,
        keyword: { text, matchType },
      },
    },
  ]);
}

/* -------------------------------------------------------------------------- */
/* Measurement reads — arbitrary date ranges, no writes                       */
/* -------------------------------------------------------------------------- */

function sum(rows: RawRow[]): AdsMetrics {
  return rows.reduce<AdsMetrics>(
    (total, row) => {
      const value = metrics(row);
      return {
        impressions: total.impressions + value.impressions,
        clicks: total.clicks + value.clicks,
        costMicros: total.costMicros + value.costMicros,
        conversions: total.conversions + value.conversions,
      };
    },
    { impressions: 0, clicks: 0, costMicros: 0, conversions: 0 },
  );
}

function between(start: string, end: string) {
  return `segments.date BETWEEN '${start}' AND '${end}'`;
}

/** What one keyword did between two dates, whatever its match type. */
export async function keywordMetricsRange(
  customerId: string,
  adGroupId: string,
  text: string,
  start: string,
  end: string,
): Promise<AdsMetrics> {
  const escaped = text.replace(/'/g, "\'");
  return sum(
    await search(
      customerId,
      `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
       FROM keyword_view
       WHERE ${between(start, end)}
         AND ad_group.id = ${Number(adGroupId)}
         AND ad_group_criterion.keyword.text = '${escaped}'`,
    ),
  );
}

/** What a whole campaign did between two dates. */
export async function campaignMetricsRange(
  customerId: string,
  campaignId: string,
  start: string,
  end: string,
): Promise<AdsMetrics> {
  return sum(
    await search(
      customerId,
      `SELECT metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
       FROM campaign
       WHERE ${between(start, end)} AND campaign.id = ${Number(campaignId)}`,
    ),
  );
}

/* -------------------------------------------------------------------------- */
/* Verification reads — live state, never a write                             */
/* -------------------------------------------------------------------------- */

export type LiveKeyword = {
  criterionId: string;
  text: string;
  matchType: string;
  status: string;
  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
};

/** Every criterion in an ad group matching this text, whatever its match type. */
export async function findKeywordCriteria(
  customerId: string,
  adGroupId: string,
  text: string,
): Promise<LiveKeyword[]> {
  const escaped = text.replace(/'/g, "\'");
  const rows = (await search(
    customerId,
    `SELECT ad_group_criterion.criterion_id, ad_group_criterion.status,
     ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
     ad_group.id, ad_group.name, campaign.id, campaign.name
     FROM ad_group_criterion
     WHERE ad_group.id = ${Number(adGroupId)}
       AND ad_group_criterion.type = KEYWORD
       AND ad_group_criterion.keyword.text = '${escaped}'`,
  )) as (RawRow & { adGroupCriterion?: { criterionId?: string } })[];

  return rows.map((row) => ({
    criterionId: row.adGroupCriterion?.criterionId ?? "",
    text: row.adGroupCriterion?.keyword?.text ?? "",
    matchType: row.adGroupCriterion?.keyword?.matchType ?? "",
    status: row.adGroupCriterion?.status ?? "",
    adGroupId: row.adGroup?.id ?? "",
    adGroupName: row.adGroup?.name ?? "",
    campaignId: row.campaign?.id ?? "",
    campaignName: row.campaign?.name ?? "",
  }));
}

/** Campaign-level negative keywords matching this text. */
export async function findNegativeKeywords(
  customerId: string,
  campaignId: string,
  text: string,
) {
  const escaped = text.replace(/'/g, "\'");
  const rows = (await search(
    customerId,
    `SELECT campaign_criterion.criterion_id, campaign_criterion.negative,
     campaign_criterion.keyword.text, campaign_criterion.keyword.match_type,
     campaign.id, campaign.name
     FROM campaign_criterion
     WHERE campaign.id = ${Number(campaignId)}
       AND campaign_criterion.type = KEYWORD
       AND campaign_criterion.negative = TRUE
       AND campaign_criterion.keyword.text = '${escaped}'`,
  )) as (RawRow & {
    campaignCriterion?: {
      criterionId?: string;
      negative?: boolean;
      keyword?: { text?: string; matchType?: string };
    };
  })[];

  return rows.map((row) => ({
    criterionId: row.campaignCriterion?.criterionId ?? "",
    text: row.campaignCriterion?.keyword?.text ?? "",
    matchType: row.campaignCriterion?.keyword?.matchType ?? "",
    campaignName: row.campaign?.name ?? "",
  }));
}
