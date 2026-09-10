"use client";

import { syncGoogleAds, type AdsSyncState } from "@/app/dashboard/ads/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState } from "react";

const initialState: AdsSyncState = { status: "idle", message: "" };

export function SyncAds({
  brandId,
  customerId,
  connected,
  hint,
}: {
  brandId: string;
  customerId: string | null;
  connected: boolean;
  hint?: string;
}) {
  const [state, formAction, pending] = useActionState(syncGoogleAds, initialState);

  if (!connected) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <a
          href="/api/google/connect"
          className="inline-flex h-8 items-center justify-center rounded-md border border-line-strong bg-surface px-3 text-[0.8125rem] font-medium text-ink transition-colors duration-200 hover:border-ink-4/60 hover:bg-subtle"
        >
          Connect Google
        </a>
        <span className="type-meta text-ink-4">
          Read-only access to Search Console and Google Ads.
        </span>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="brandId" value={brandId} />
      <Button type="submit" size="sm" disabled={pending || !customerId}>
        {pending ? "Importing…" : "Sync Google Ads"}
      </Button>

      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Reading campaigns, ad groups, keywords and search terms…
          </span>
        ) : state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : (
          <span className="text-ink-4">
            {customerId ? `Account ${customerId}` : "No Ads customer configured."}
            {hint ? ` · ${hint}` : ""}
          </span>
        )}
      </p>
    </form>
  );
}
