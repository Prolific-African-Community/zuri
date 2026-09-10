"use client";

import {
  createMetaDraft,
  generateMetaIdeasAction,
  type MetaState,
} from "@/app/dashboard/content/meta-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { MetaIdea } from "@/lib/openai";
import { useActionState } from "react";

const emptyMetaState: MetaState = { status: "idle", message: "", ideas: [] };

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function Idea({
  idea,
  brandId,
  opportunityId,
}: {
  idea: MetaIdea;
  brandId: string;
  opportunityId: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    createMetaDraft,
    emptyMetaState,
  );

  // BOTH offers a choice; a single-channel idea creates where it belongs.
  const channels =
    idea.channel === "BOTH" ? ["FACEBOOK", "INSTAGRAM"] : [idea.channel];

  return (
    <li className="border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2.5">
        <Badge tone="accent">{label(idea.channel)}</Badge>
        <Badge tone="neutral">{label(idea.contentType)}</Badge>
      </div>

      <p className="mt-2.5 text-[0.9375rem] font-medium tracking-[-0.01em]">
        {idea.hook}
      </p>
      <p className="type-body mt-1.5 max-w-2xl text-ink-2">{idea.angle}</p>
      <p className="type-meta mt-1.5 max-w-2xl">Why it could work: {idea.rationale}</p>
      {idea.concept ? (
        <p className="type-meta mt-1 max-w-2xl text-ink-3">{idea.concept}</p>
      ) : null}

      <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
        <input type="hidden" name="brandId" value={brandId} />
        <input type="hidden" name="opportunityId" value={opportunityId ?? ""} />
        <input type="hidden" name="idea" value={JSON.stringify(idea)} />
        {channels.map((channel) => (
          <Button
            key={channel}
            type="submit"
            name="channel"
            value={channel}
            variant="secondary"
            size="sm"
            disabled={pending}
          >
            {pending
              ? "Creating…"
              : channels.length > 1
                ? `Create draft · ${label(channel)}`
                : "Create draft"}
          </Button>
        ))}
        <p className="type-meta" aria-live="polite">
          {state.message ? (
            <span
              className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
            >
              {state.message}
            </span>
          ) : null}
        </p>
      </form>
    </li>
  );
}

/** Meta ideas for one source. Nothing is stored until a draft is created. */
export function MetaIdeas({
  brandId,
  opportunityId,
  assetId,
}: {
  brandId: string;
  opportunityId?: string | null;
  assetId?: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    generateMetaIdeasAction,
    emptyMetaState,
  );

  return (
    <div className="mt-4">
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="opportunityId" value={opportunityId ?? ""} />
        <input type="hidden" name="assetId" value={assetId ?? ""} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Thinking…" : "Generate Meta ideas"}
        </Button>
        <p className="type-meta" aria-live="polite">
          {pending ? (
            <span className="text-ink-3">
              Looking for four genuinely different angles…
            </span>
          ) : state.message ? (
            <span
              className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
            >
              {state.message}
            </span>
          ) : (
            <span className="text-ink-4">
              Facebook and Instagram, from this brand&apos;s own voice.
            </span>
          )}
        </p>
      </form>

      {state.ideas.length ? (
        <ul className="mt-4 rounded-lg border border-line bg-subtle p-5">
          {state.ideas.map((idea, index) => (
            <Idea
              key={`${idea.contentType}-${index}`}
              idea={idea}
              brandId={brandId}
              opportunityId={opportunityId ?? null}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
