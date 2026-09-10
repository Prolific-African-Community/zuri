"use client";

import {
  executeAdsAction,
  proposeAdsActions,
  type AdsProposalState,
} from "@/app/dashboard/ads/proposal-actions";
import {
  verifyAdsAction,
  type VerifyState,
} from "@/app/dashboard/ads/verify-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState, useState } from "react";

const initialState: AdsProposalState = { status: "idle", message: "" };

export function ProposeAdsActions({
  brandId,
  hint,
}: {
  brandId: string;
  hint?: string;
}) {
  const [state, formAction, pending] = useActionState(
    proposeAdsActions,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="brandId" value={brandId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Reading the data…" : "Propose Ads actions"}
      </Button>
      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Comparing keywords, search terms and what Zuri researched…
          </span>
        ) : state.message ? (
          <span
            className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
          >
            {state.message}
          </span>
        ) : hint ? (
          <span className="text-ink-4">{hint}</span>
        ) : null}
      </p>
    </form>
  );
}

export type AdsVerification = {
  outcome: string | null;
  actual: string | null;
  note: string | null;
  verifiedAt: string | null;
};

const verifyInitial: VerifyState = { status: "idle", message: "" };

function Verification({
  actionId,
  verification,
  executed,
}: {
  actionId: string;
  verification: AdsVerification | null;
  executed: string;
}) {
  const [state, formAction, pending] = useActionState(
    verifyAdsAction,
    verifyInitial,
  );
  const outcome = verification?.outcome ?? null;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <dl className="grid max-w-3xl gap-2.5">
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">Executed</dt>
          <dd className="type-meta mt-1 sm:mt-0">{executed}</dd>
        </div>
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">Actual</dt>
          <dd className="type-meta mt-1 sm:mt-0">
            {verification?.actual ?? "Not read yet."}
          </dd>
        </div>
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">Verification</dt>
          <dd className="mt-1 sm:mt-0">
            {outcome ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge tone={outcome === "VERIFIED" ? "accent" : "muted"}>
                  {label(outcome)}
                </Badge>
                <span className="type-meta">{verification?.note}</span>
              </div>
            ) : (
              <span className="type-meta">Not verified yet.</span>
            )}
          </dd>
        </div>
      </dl>

      <form action={formAction} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="actionId" value={actionId} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Reading the account…" : "Resync & verify"}
        </Button>
        <p className="type-meta" aria-live="polite">
          {state.message ? (
            <span
              className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
            >
              {state.message}
            </span>
          ) : (
            <span className="text-ink-4">
              Reads the live account. Zuri changes nothing while verifying.
            </span>
          )}
        </p>
      </form>
    </div>
  );
}

export type AdsActionPreview = {
  adsActionType: string;
  current: string;
  proposed: string;
  evidence: string;
  campaignName: string | null;
  adGroupName: string | null;
  keywordText: string;
  matchType: string;
  result?: string;
};

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

export function AdsExecution({
  actionId,
  status,
  risk,
  preview,
  verification,
}: {
  actionId: string;
  status: string;
  risk: string;
  preview: AdsActionPreview;
  verification: AdsVerification | null;
}) {
  const [state, formAction, pending] = useActionState(
    executeAdsAction,
    initialState,
  );
  // A high-risk change is confirmed twice, even though Zuri can run it.
  const [confirmed, setConfirmed] = useState(false);
  const needsConfirmation = risk === "HIGH" && !confirmed;

  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge tone="accent">{label(preview.adsActionType)}</Badge>
        <span className="type-meta">
          {[preview.campaignName, preview.adGroupName].filter(Boolean).join(" / ") ||
            "no ad group"}
          {" · "}
          {preview.keywordText} ({label(preview.matchType)})
        </span>
      </div>

      <dl className="mt-4 grid max-w-3xl gap-2.5">
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">Current</dt>
          <dd className="type-body mt-1 text-ink-2 sm:mt-0">{preview.current}</dd>
        </div>
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">Suggested</dt>
          <dd className="type-body mt-1 text-ink-2 sm:mt-0">{preview.proposed}</dd>
        </div>
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">Evidence</dt>
          <dd className="type-meta mt-1 sm:mt-0">{preview.evidence}</dd>
        </div>
        <div className="sm:flex sm:gap-6">
          <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">Risk</dt>
          <dd className="mt-1 sm:mt-0">
            <Badge tone={risk === "HIGH" ? "accent" : "muted"}>{label(risk)}</Badge>
          </dd>
        </div>
      </dl>

      {status === "EXECUTED" || status === "MEASURED" ? (
        <Verification
          actionId={actionId}
          verification={verification}
          executed={preview.result ?? "Applied in Google Ads."}
        />
      ) : status === "APPROVED" ? (
        <>
          {risk === "HIGH" ? (
            <label className="type-meta mt-4 flex items-center gap-2 text-ink-2">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="h-4 w-4 rounded border-line accent-[var(--color-accent)]"
              />
              This is a high-risk change. I have checked it and want Zuri to apply
              it.
            </label>
          ) : null}

          <form action={formAction} className="mt-4">
            <input type="hidden" name="actionId" value={actionId} />
            <Button
              type="submit"
              size="sm"
              disabled={pending || needsConfirmation}
            >
              {pending ? "Applying…" : "Execute approved action"}
            </Button>
          </form>
          <p className="type-meta mt-2" aria-live="polite">
            {pending ? (
              <span className="text-ink-3">
                Checking the ad group exists, then applying one change…
              </span>
            ) : state.message ? (
              <span
                className={cn(
                  state.status === "error" ? "text-ink-2" : "text-accent-ink",
                )}
              >
                {state.message}
              </span>
            ) : null}
          </p>
        </>
      ) : null}
    </div>
  );
}
