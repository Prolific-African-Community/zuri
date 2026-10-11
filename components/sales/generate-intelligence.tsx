"use client";

import {
  generateIntelligence,
  type IntelligenceState,
} from "@/app/dashboard/sales/intelligence-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState } from "react";

const initialState: IntelligenceState = { status: "idle", message: "" };

/** Explicit, never automatic: a brief is regenerated only when asked. */
export function GenerateIntelligence({
  prospectId,
  generated,
  stale,
  generatedLabel,
}: {
  prospectId: string;
  generated: boolean;
  stale: boolean;
  generatedLabel: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    generateIntelligence.bind(null, prospectId),
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <Button
        type="submit"
        size="sm"
        variant={generated && !stale ? "secondary" : "primary"}
        disabled={pending}
      >
        {pending
          ? "Thinking…"
          : generated
            ? "Refresh intelligence"
            : "Generate intelligence"}
      </Button>
      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">Reading the evidence, contacts and campaign…</span>
        ) : state.status === "error" ? (
          <span className="text-ink-2">{state.message}</span>
        ) : generatedLabel ? (
          <span className={cn(stale ? "text-ink-2" : "text-ink-4")}>
            Last generated {generatedLabel}
            {stale ? " · the inputs changed since" : ""}
          </span>
        ) : (
          <span className="text-ink-4">Interprets only what is stored here. No research.</span>
        )}
      </p>
    </form>
  );
}
