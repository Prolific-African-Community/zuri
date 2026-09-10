/**
 * Google Business Profile, server-side only. Three APIs are involved: accounts
 * and locations are read from the current v1 endpoints, while local posts still
 * live on the legacy v4 My Business API — Google never migrated them.
 *
 * Zuri only ever lists, creates one post, and reads that post back. It never
 * edits a listing and never touches reviews.
 */

import { googleAccessToken } from "@/lib/google";

const ACCOUNTS_API = "https://mybusinessaccountmanagement.googleapis.com/v1";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const POSTS_API = "https://mybusiness.googleapis.com/v4";

async function call(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${await googleAccessToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    console.error("Google Business request failed", url, response.status, text);
    let message = "";
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      message = "";
    }
    throw new Error(
      `Google Business ${response.status}${message ? `: ${message.slice(0, 180)}` : ""}`,
    );
  }

  return text ? JSON.parse(text) : null;
}

export type BusinessAccount = {
  /** `accounts/123456789` */
  name: string;
  accountName: string;
  type: string;
};

export async function listBusinessAccounts(): Promise<BusinessAccount[]> {
  const payload = (await call(`${ACCOUNTS_API}/accounts`)) as {
    accounts?: { name?: string; accountName?: string; type?: string }[];
  };

  return (payload.accounts ?? [])
    .filter((account) => account.name)
    .map((account) => ({
      name: account.name as string,
      accountName: account.accountName ?? "",
      type: account.type ?? "",
    }));
}

export type BusinessLocation = {
  /** `locations/123456789` */
  name: string;
  title: string;
  address: string;
  storeCode: string;
};

/** Locations of one account, with enough detail to tell two shops apart. */
export async function listBusinessLocations(
  accountName: string,
): Promise<BusinessLocation[]> {
  const fields = "name,title,storefrontAddress,storeCode";
  const payload = (await call(
    `${INFO_API}/${accountName}/locations?readMask=${encodeURIComponent(fields)}&pageSize=100`,
  )) as {
    locations?: {
      name?: string;
      title?: string;
      storeCode?: string;
      storefrontAddress?: { addressLines?: string[]; locality?: string; postalCode?: string };
    }[];
  };

  return (payload.locations ?? [])
    .filter((location) => location.name)
    .map((location) => ({
      name: location.name as string,
      title: location.title ?? "",
      storeCode: location.storeCode ?? "",
      address: [
        ...(location.storefrontAddress?.addressLines ?? []),
        location.storefrontAddress?.postalCode,
        location.storefrontAddress?.locality,
      ]
        .filter(Boolean)
        .join(", "),
    }));
}

export type LocalPost = {
  /** `accounts/1/locations/2/localPosts/3` */
  name: string;
  state: string;
  searchUrl: string | null;
  summary: string;
  createTime: string | null;
};

function shapePost(raw: {
  name?: string;
  state?: string;
  searchUrl?: string;
  summary?: string;
  createTime?: string;
}): LocalPost {
  return {
    name: raw.name ?? "",
    state: raw.state ?? "",
    searchUrl: raw.searchUrl ?? null,
    summary: raw.summary ?? "",
    createTime: raw.createTime ?? null,
  };
}

/**
 * One STANDARD update post on one location. The photo is optional: Google
 * rejects the whole post if the media is unusable, so the caller may retry
 * without it rather than lose the publication.
 */
export async function createLocalPost(
  accountId: string,
  locationId: string,
  post: {
    summary: string;
    actionUrl: string;
    actionType?: string;
    photoUrl?: string | null;
    languageCode?: string;
  },
): Promise<LocalPost> {
  const body: Record<string, unknown> = {
    languageCode: post.languageCode ?? "fr",
    summary: post.summary,
    topicType: "STANDARD",
    callToAction: {
      actionType: post.actionType ?? "LEARN_MORE",
      url: post.actionUrl,
    },
  };

  if (post.photoUrl) {
    body.media = [{ mediaFormat: "PHOTO", sourceUrl: post.photoUrl }];
  }

  const created = (await call(
    `${POSTS_API}/${accountId}/${locationId}/localPosts`,
    { method: "POST", body: JSON.stringify(body) },
  )) as Parameters<typeof shapePost>[0];

  return shapePost(created);
}

/** Reads a post back, so publication is confirmed rather than assumed. */
export async function getLocalPost(postName: string): Promise<LocalPost> {
  const raw = (await call(`${POSTS_API}/${postName}`)) as Parameters<
    typeof shapePost
  >[0];
  return shapePost(raw);
}
