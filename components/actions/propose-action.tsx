"use client";

import {
  proposeActionFromOpportunity,
  type ActionState,
} from "@/app/dashboard/actions/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import Link from "next/link";
import { useActionState } from "react";

const initialState: ActionState = { status: "idle", message: "" };

export function ProposeAction({
  opportunityId,
  hasOpenAction,
}: {
  opportunityId: string;
  hasOpenAction: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    proposeActionFromOpportunity,
    initialState,
  );

  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={pending || hasOpenAction}
      >
        {pending ? "Proposing…" : "Create proposed action"}
      </Button>

      {hasOpenAction ? (
        <Link
          href="/dashboard/actions"
          className="type-meta rounded-md text-accent-ink transition-colors hover:text-accent-strong"
        >
          Already in the Action Center
        </Link>
      ) : null}

      <p className="type-meta" aria-live="polite">
        {state.message ? (
          <span
            className={cn(
              state.status === "error" ? "text-ink-2" : "text-accent-ink",
            )}
          >
            {state.message}
          </span>
        ) : null}
      </p>
    </form>
  );
}
