"use client";

import {
  generateOpportunitiesAction,
  type GenerateState,
} from "@/app/dashboard/opportunities/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState } from "react";

const initialState: GenerateState = { status: "idle", message: "" };

export function GenerateOpportunities({
  brands,
  defaultBrandId,
}: {
  brands: { id: string; name: string }[];
  defaultBrandId?: string;
}) {
  const [state, formAction, pending] = useActionState(
    generateOpportunitiesAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="brandId" value={defaultBrandId ?? ""} />
      <Button type="submit" disabled={pending || !defaultBrandId}>
        {pending ? "Generating…" : "Generate opportunities"}
      </Button>

      <p className="type-meta" aria-live="polite">
        {pending ? (
          <span className="text-ink-3">
            Reading this brand&apos;s profile, audiences and observations…
          </span>
        ) : state.status === "idle" ? (
          <span className="text-ink-4">
            {defaultBrandId
              ? `From ${brands.find((brand) => brand.id === defaultBrandId)?.name ?? "the selected brand"}'s own recorded knowledge.`
              : "Pick a brand above first."}
          </span>
        ) : (
          <span
            className={cn(
              state.status === "error" ? "text-ink-2" : "text-accent-ink",
            )}
          >
            {state.message}
          </span>
        )}
      </p>
    </form>
  );
}
