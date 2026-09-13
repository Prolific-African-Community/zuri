"use client";

import {
  deleteOpportunity,
  type DeleteOpportunityState,
} from "@/app/dashboard/opportunities/actions";
import { Button } from "@/components/ui/button";
import { useActionState, useState } from "react";

const initialState: DeleteOpportunityState = { status: "idle", message: "" };

/**
 * Permanent deletion, two steps and deliberately quiet. Archiving is the
 * everyday, reversible act; this one is not.
 */
export function DeleteOpportunity({ opportunityId }: { opportunityId: string }) {
  const [state, formAction, pending] = useActionState(
    deleteOpportunity.bind(null, opportunityId),
    initialState,
  );
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="type-meta rounded-md text-ink-4 transition-colors hover:text-ink-2"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="w-full rounded-lg border border-line bg-subtle p-4">
      <p className="type-body text-ink-2">Delete this opportunity permanently?</p>
      <p className="type-meta mt-1">This cannot be undone.</p>
      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Deleting…" : "Delete permanently"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAsking(false)}
        >
          Cancel
        </Button>
        <p className="type-meta" aria-live="polite">
          {state.message ? (
            <span className="text-ink-2">{state.message}</span>
          ) : null}
        </p>
      </form>
    </div>
  );
}
