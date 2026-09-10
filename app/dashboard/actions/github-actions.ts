"use server";

import { requireSession } from "@/lib/session";

/**
 * Zuri used to prepare a patch and open a pull request for SEO actions. It no
 * longer changes anyone's site: a SEO action produces an implementation brief,
 * and the change is made outside Zuri.
 *
 * The entry points are kept and refuse explicitly, so an old client, a stale
 * page or a replayed request cannot reach the website bridge.
 */

export type BridgeState = { status: "idle" | "done" | "error"; message: string };

const WEBSITE_WRITES_DISABLED =
  "Zuri no longer changes websites for SEO actions. Copy the implementation brief, make the change, then mark it as implemented.";

export async function prepareWebsiteChange(): Promise<BridgeState> {
  await requireSession();
  return { status: "error", message: WEBSITE_WRITES_DISABLED };
}

export async function createPullRequestForAction(): Promise<BridgeState> {
  await requireSession();
  return { status: "error", message: WEBSITE_WRITES_DISABLED };
}

export async function discardPreparedChange(): Promise<BridgeState> {
  await requireSession();
  return { status: "error", message: WEBSITE_WRITES_DISABLED };
}
