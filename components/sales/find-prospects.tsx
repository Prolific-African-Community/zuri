"use client";

import {
  startProspectResearch,
  type ResearchState,
} from "@/app/dashboard/sales/research-actions";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

const initialState: ResearchState = { status: "idle", message: "" };

/** Opens a small form; research starts only on an explicit submit. */
export function FindProspects({
  campaignId,
  geography,
  industries,
  running,
  disabledReason,
}: {
  campaignId: string;
  geography: string[];
  industries: string[];
  running: boolean;
  disabledReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    startProspectResearch.bind(null, campaignId),
    initialState,
  );

  if (running) {
    return (
      <Button type="button" disabled>
        Research in progress…
      </Button>
    );
  }

  if (!open) {
    return (
      <div className="flex flex-col items-start gap-1.5 sm:items-end">
        <Button
          type="button"
          onClick={() => setOpen(true)}
          disabled={Boolean(disabledReason)}
          title={disabledReason ?? undefined}
        >
          Find prospects
        </Button>
        {disabledReason ? <span className="type-meta">{disabledReason}</span> : null}
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="grid w-full max-w-md gap-4 rounded-xl border border-line bg-surface p-5 shadow-[var(--shadow-subtle)]"
    >
      <div>
        <p className="type-section-title">Find prospects</p>
        <p className="type-meta mt-1">
          Public company websites only. Only companies that clear the quality threshold are
          saved — fewer than requested is normal.
        </p>
      </div>
      <Field
        label="Number requested"
        name="requestedCount"
        type="number"
        min={1}
        max={20}
        defaultValue={10}
        required
      />
      <Select label="Geography" name="geography" defaultValue="">
        <option value="">Campaign geography ({geography.join(", ") || "none"})</option>
        {geography.map((value) => (
          <option key={value} value={value}>
            {value} only
          </option>
        ))}
      </Select>
      <Select label="Industry" name="industry" defaultValue="">
        <option value="">Campaign industries ({industries.join(", ") || "none"})</option>
        {industries.map((value) => (
          <option key={value} value={value}>
            {value} only
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Starting…" : "Start research"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {state.status === "error" ? (
        <p className="type-meta text-ink-2" aria-live="polite">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/** Re-reads the page while a run is going, and stops the moment it ends. */
export function RunProgressRefresh({ running }: { running: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [running, router]);
  return null;
}
