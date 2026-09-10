"use client";

import {
  disconnectGoogleAction,
  syncSearchConsole,
  type GoogleState,
} from "@/app/dashboard/search/google-actions";
import { testGoogleAds, type AdsState } from "@/app/dashboard/search/ads-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState } from "react";

const initialState: GoogleState = { status: "idle", message: "" };

export function GoogleSearchConsole({
  brandId,
  connectedEmail,
  property,
  hint,
}: {
  brandId: string;
  connectedEmail: string | null;
  property: string | null;
  hint?: string;
}) {
  const [state, formAction, pending] = useActionState(
    syncSearchConsole,
    initialState,
  );

  if (!connectedEmail) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {/* A plain link: the OAuth handshake is a redirect, not an action. */}
        <a
          href="/api/google/connect"
          className="inline-flex h-8 items-center justify-center rounded-md border border-line-strong bg-surface px-3 text-[0.8125rem] font-medium text-ink transition-colors duration-200 hover:border-ink-4/60 hover:bg-subtle"
        >
          Connect Search Console
        </a>
        <span className="type-meta text-ink-4">
          Read-only access to your Search Console performance.
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="brandId" value={brandId} />
        <Button type="submit" size="sm" disabled={pending || !property}>
          {pending ? "Importing…" : "Sync Search Console"}
        </Button>
      </form>

      <form action={disconnectGoogleAction}>
        <Button type="submit" variant="ghost" size="sm">
          Disconnect
        </Button>
      </form>

      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Reading the last 28 days and the 28 before them…
          </span>
        ) : state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : (
          <span className="text-ink-4">
            {connectedEmail}
            {property
              ? ` · ${property}`
              : " · Google Search Console is connected, but no property is selected for this brand."}
            {hint ? ` · ${hint}` : ""}
          </span>
        )}
      </p>
    </div>
  );
}

const adsInitialState: AdsState = { status: "idle", message: "" };

export function GoogleAdsStatus({ adsScope }: { adsScope: boolean }) {
  const [state, formAction, pending] = useActionState(
    async () => testGoogleAds(),
    adsInitialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Checking…" : "Test Google Ads"}
      </Button>
      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Listing accessible accounts, then reading 30 days of campaigns…
          </span>
        ) : state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : (
          <span className="text-ink-4">
            {adsScope
              ? "Read-only campaign check."
              : "Reconnect Google to grant the Ads scope."}
          </span>
        )}
      </p>
    </form>
  );
}
