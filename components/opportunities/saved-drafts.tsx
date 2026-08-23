"use client";

import {
  generateVisualImageAction,
  suggestVisualAction,
  type VisualState,
} from "@/app/dashboard/opportunities/visual-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState } from "react";

const initialState: VisualState = { status: "idle", message: "" };

export type SavedDraft = {
  id: string;
  title: string | null;
  content: string;
  status: string;
  visual: {
    id: string;
    type: string;
    reason: string | null;
    concept: string | null;
    imageUrl: string | null;
  } | null;
};

const visualLabels: Record<string, string> = {
  NONE: "No visual",
  STATEMENT: "Statement",
  FAKE_DOCUMENT: "Fake document",
  EDITORIAL: "Editorial",
};

function Message({ state, pending, busy }: { state: VisualState; pending: boolean; busy: string }) {
  return (
    <p className="type-meta" aria-live="polite">
      {pending ? (
        <span className="text-ink-3">{busy}</span>
      ) : state.message ? (
        <span
          className={cn(state.status === "error" ? "text-ink-2" : "text-accent-ink")}
        >
          {state.message}
        </span>
      ) : null}
    </p>
  );
}

function VisualControls({ draft }: { draft: SavedDraft }) {
  const [suggestState, suggestAction, suggesting] = useActionState(
    suggestVisualAction,
    initialState,
  );
  const [imageState, imageAction, rendering] = useActionState(
    generateVisualImageAction,
    initialState,
  );

  const visual = draft.visual;
  const needsImage = Boolean(visual && visual.type !== "NONE");

  return (
    <div className="mt-4 border-t border-line pt-4">
      {visual ? (
        <div className="mb-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Badge tone={visual.type === "NONE" ? "muted" : "accent"}>
              {visualLabels[visual.type] ?? visual.type}
            </Badge>
            {visual.reason ? (
              <span className="type-meta">{visual.reason}</span>
            ) : null}
          </div>
          {visual.concept ? (
            <p className="type-body mt-2 max-w-2xl text-ink-3">{visual.concept}</p>
          ) : null}
        </div>
      ) : null}

      {visual?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={visual.imageUrl}
          alt={visual.concept ?? "Generated visual"}
          className="mt-3 mb-3 w-full max-w-sm rounded-lg border border-line"
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <form action={suggestAction}>
          <input type="hidden" name="contentAssetId" value={draft.id} />
          <Button type="submit" variant="secondary" size="sm" disabled={suggesting}>
            {suggesting ? "Thinking…" : visual ? "Suggest again" : "Suggest visual"}
          </Button>
        </form>

        {needsImage && visual ? (
          <form action={imageAction}>
            <input type="hidden" name="visualAssetId" value={visual.id} />
            <Button type="submit" size="sm" disabled={rendering}>
              {rendering
                ? "Rendering…"
                : visual.imageUrl
                  ? "Regenerate"
                  : "Generate image"}
            </Button>
          </form>
        ) : null}
      </div>

      <Message
        state={suggestState}
        pending={suggesting}
        busy="Reading the post against the brand's voice rules…"
      />
      <Message
        state={imageState}
        pending={rendering}
        busy="Rendering one image…"
      />
    </div>
  );
}

export function SavedDrafts({ drafts }: { drafts: SavedDraft[] }) {
  if (!drafts.length) return null;

  return (
    <div className="mt-5">
      <p className="type-label">
        Saved drafts · {drafts.length}
      </p>
      <ul className="mt-3 grid gap-4">
        {drafts.map((draft) => (
          <li key={draft.id} className="rounded-xl border border-line p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="type-section-title">{draft.title ?? "Untitled draft"}</p>
              <span className="type-meta">{draft.status.toLowerCase()}</span>
            </div>
            <p className="type-body mt-3 whitespace-pre-line text-ink-2">
              {draft.content}
            </p>
            <VisualControls draft={draft} />
          </li>
        ))}
      </ul>
    </div>
  );
}
