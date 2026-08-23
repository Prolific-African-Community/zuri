"use client";

import {
  generateDraftsAction,
  saveDraft,
  type DraftsState,
} from "@/app/dashboard/opportunities/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState } from "react";

const initialState: DraftsState = {
  status: "idle",
  message: "",
  opportunityId: null,
  drafts: [],
};

export function LinkedInDrafts({ opportunityId }: { opportunityId: string }) {
  const [state, formAction, pending] = useActionState(
    generateDraftsAction,
    initialState,
  );

  const drafts = state.opportunityId === opportunityId ? state.drafts : [];
  const showsMessage = state.opportunityId === opportunityId && state.message;

  return (
    <div className="mt-3">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending
            ? "Writing…"
            : drafts.length
              ? "Regenerate"
              : "Generate LinkedIn drafts"}
        </Button>
        <p className="type-meta" aria-live="polite">
          {pending ? (
            <span className="text-ink-3">
              Writing against this brand&apos;s voice rules and golden examples…
            </span>
          ) : showsMessage ? (
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

      {drafts.length ? (
        <ul className="mt-5 grid gap-4">
          {drafts.map((draft, index) => (
            <li
              key={`${draft.angle}-${index}`}
              className="rounded-xl border border-line bg-subtle p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <p className="type-section-title">
                  {draft.angle || `Draft ${index + 1}`}
                </p>
                <span className="type-meta">
                  {draft.content.length} characters
                </span>
              </div>

              <p className="type-body mt-3 whitespace-pre-line text-ink-2">
                {draft.content}
              </p>

              {draft.whyItWorks ? (
                <p className="type-meta mt-3 text-ink-4">{draft.whyItWorks}</p>
              ) : null}

              <form action={saveDraft} className="mt-4">
                <input type="hidden" name="opportunityId" value={opportunityId} />
                <input type="hidden" name="title" value={draft.angle} />
                <input type="hidden" name="content" value={draft.content} />
                <Button type="submit" size="sm">
                  Save draft
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
