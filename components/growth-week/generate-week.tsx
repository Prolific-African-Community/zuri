"use client";

import {
  generateGrowthWeekAction,
  type WeekState,
} from "@/app/dashboard/growth-week/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState } from "react";

const initialState: WeekState = { status: "idle", message: "" };

export function GenerateGrowthWeek({
  brandId,
  hint,
  hasPlan,
}: {
  brandId: string;
  hint?: string;
  hasPlan: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    generateGrowthWeekAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="brandId" value={brandId} />
      <Button type="submit" size="sm" disabled={pending}>
        {pending
          ? "Planning…"
          : hasPlan
            ? "Regenerate Growth Week"
            : "Generate Growth Week"}
      </Button>

      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Weighing opportunities, drafts and what is already scheduled…
          </span>
        ) : state.message ? (
          <span
            className={cn(
              state.status === "error" ? "text-ink-2" : "text-accent-ink",
            )}
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
