/**
 * Google Search Console access, read-only and server-side only.
 * One OAuth scope, one API call shape. The client secret and the refresh token
 * never leave the server.
 */

import { getPrisma } from "@/lib/prisma";

export const SEARCH_CONSOLE_SCOPE =
  "https://www.googleapis.com/auth/webmasters.readonly";
export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
export const BUSINESS_SCOPE = "https://www.googleapis.com/auth/business.manage";

/** One consent covers Search Console, Google Ads and Business Profile. */
export const SCOPES = [SEARCH_CONSOLE_SCOPE, ADS_SCOPE, BUSINESS_SCOPE].join(" ");

/** True when the stored connection already carries the Google Ads scope. */
export function hasAdsScope(scope: string | undefined | null) {
  return Boolean(scope?.includes(ADS_SCOPE));
}

/** Business Profile was added later, so an older connection lacks it. */
export function hasBusinessScope(scope: string | undefined | null) {
  return Boolean(scope?.includes(BUSINESS_SCOPE));
}

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/webmasters/v3";

/** Single row: this is a one-admin workspace. */
const CONNECTION_ID = "google";

export function googleConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

function credentials() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set. See .env.example.",
    );
  }
  return { clientId, clientSecret };
}

/** The redirect URI must match what is registered in the Google console. */
export function redirectUri(origin: string) {
  return process.env.GOOGLE_REDIRECT_URI?.trim() || `${origin}/api/google/callback`;
}

export function authorizationUrl(origin: string, state: string) {
  const { clientId } = credentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPES,
    // Needed to receive a refresh token, and to receive it again on re-consent.
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });

  const payload = (await response.json()) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    console.error("Google token request failed", response.status, payload);
    throw new Error(
      `Google rejected the token request${
        payload.error_description ? `: ${payload.error_description.slice(0, 140)}` : "."
      }`,
    );
  }
  return payload;
}

/** Reads the email out of the id_token without verifying it — display only. */
function emailFromIdToken(idToken: string | undefined) {
  if (!idToken) return null;
  try {
    const [, payload] = idToken.split(".");
    const decoded = JSON.parse(Buffer.from(payload, "base64").toString("utf8")) as {
      email?: string;
    };
    return decoded.email ?? null;
  } catch {
    return null;
  }
}

export async function exchangeCodeForTokens(code: string, origin: string) {
  const { clientId, clientSecret } = credentials();
  const tokens = await tokenRequest({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(origin),
    grant_type: "authorization_code",
  });

  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke Zuri's access and connect again.",
    );
  }

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
  const data = {
    email: emailFromIdToken(tokens.id_token),
    scope: tokens.scope ?? SCOPES,
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token,
    expiresAt,
  };

  await getPrisma().googleConnection.upsert({
    where: { id: CONNECTION_ID },
    update: data,
    create: { id: CONNECTION_ID, ...data },
  });
}

export async function getConnection() {
  return getPrisma().googleConnection.findUnique({ where: { id: CONNECTION_ID } });
}

export async function disconnectGoogle() {
  await getPrisma().googleConnection.deleteMany({ where: { id: CONNECTION_ID } });
}

/** Returns a valid access token, refreshing it when it is about to expire. */
export async function googleAccessToken() {
  const connection = await getConnection();
  if (!connection) throw new Error("Google is not connected.");

  // A minute of slack so a token never expires mid-request.
  if (connection.expiresAt.getTime() - 60_000 > Date.now()) {
    return connection.accessToken;
  }

  const { clientId, clientSecret } = credentials();
  const tokens = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: connection.refreshToken,
    grant_type: "refresh_token",
  });

  const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
  await getPrisma().googleConnection.update({
    where: { id: CONNECTION_ID },
    data: { accessToken: tokens.access_token!, expiresAt },
  });

  return tokens.access_token!;
}

async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await googleAccessToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    console.error("Search Console request failed", path, response.status, text);
    let message = "";
    try {
      message =
        (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      message = "";
    }
    throw new Error(
      `Search Console ${response.status}${message ? `: ${message.slice(0, 140)}` : ""}`,
    );
  }

  return text ? JSON.parse(text) : null;
}

export async function listProperties() {
  const payload = (await call("/sites")) as {
    siteEntry?: { siteUrl?: string; permissionLevel?: string }[];
  };
  return (payload.siteEntry ?? [])
    .filter((entry) => entry.siteUrl)
    .map((entry) => ({
      siteUrl: entry.siteUrl as string,
      permission: entry.permissionLevel ?? "",
    }));
}

export type AnalyticsRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type AnalyticsTotals = Omit<AnalyticsRow, "key">;

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** One read-only searchAnalytics query. `dimension` omitted returns totals. */
export async function querySearchAnalytics(
  property: string,
  startDate: Date,
  endDate: Date,
  dimension?: "query" | "page",
  rowLimit = 25,
): Promise<AnalyticsRow[]> {
  const payload = (await call(
    `/sites/${encodeURIComponent(property)}/searchAnalytics/query`,
    {
      method: "POST",
      body: JSON.stringify({
        startDate: toIsoDate(startDate),
        endDate: toIsoDate(endDate),
        ...(dimension ? { dimensions: [dimension] } : {}),
        rowLimit,
      }),
    },
  )) as {
    rows?: {
      keys?: string[];
      clicks?: number;
      impressions?: number;
      ctr?: number;
      position?: number;
    }[];
  };

  return (payload.rows ?? []).map((row) => ({
    key: row.keys?.[0] ?? "",
    clicks: Math.round(row.clicks ?? 0),
    impressions: Math.round(row.impressions ?? 0),
    ctr: row.ctr ?? 0,
    position: row.position ?? 0,
  }));
}
