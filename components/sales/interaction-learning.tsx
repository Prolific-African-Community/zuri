"use client";

import {
  analyzeInteraction,
  applyInteractionAnalysis,
  dismissAnalysis,
  setDecisionGroup,
  type LearningState,
} from "@/app/dashboard/sales/interaction-actions";
import { EvidenceTypeBadge } from "@/components/sales/sales-ui";
import { Button } from "@/components/ui/button";
import type { Analysis, Proposal } from "@/lib/interaction-learning";
import { humanize } from "@/lib/sales";
import { useActionState } from "react";

const initialState: LearningState = { status: "idle", message: "" };

const dateTime = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function AnalyzeInteraction({
  interactionId,
  failed,
}: {
  interactionId: string;
  failed: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    analyzeInteraction.bind(null, interactionId),
    initialState,
  );
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-center gap-3">
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? "Reading the note…" : "Analyze interaction"}
      </Button>
      <span className="type-meta" aria-live="polite">
        {state.status === "error"
          ? state.message
          : failed
            ? "The last analysis failed. The interaction is saved."
            : "Proposes changes. Nothing is applied until you approve."}
      </span>
    </form>
  );
}

/** One proposal, with its own checkbox. Approved by default, easy to untick. */
function Item({ proposal, children }: { proposal: Proposal; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <input
        type="checkbox"
        name="proposal"
        value={proposal.id}
        defaultChecked
        aria-label="Apply this change"
        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
      />
      <div className="min-w-0">{children}</div>
    </li>
  );
}

function Group({ title, items }: { title: string; items: React.ReactNode[] }) {
  if (!items.length) return null;
  return (
    <div className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <p className="type-label">{title}</p>
      <ul className="mt-1">{items}</ul>
    </div>
  );
}

export function AnalysisPanel({
  interactionId,
  analysis,
  contactNames,
}: {
  interactionId: string;
  analysis: Analysis;
  contactNames: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(
    applyInteractionAnalysis.bind(null, interactionId),
    initialState,
  );
  const of = <K extends Proposal["kind"]>(kind: K) =>
    analysis.proposals.filter((p): p is Extract<Proposal, { kind: K }> => p.kind === kind);
  const factById = new Map(of("NEW_FACT").map((fact) => [fact.id, fact.statement]));

  return (
    <form action={formAction} className="mt-3 grid gap-3 rounded-xl border border-line bg-subtle p-4">
      <Group
        title="New facts"
        items={of("NEW_FACT").map((p) => (
          <Item key={p.id} proposal={p}>
            <span className="flex flex-wrap items-center gap-2">
              <EvidenceTypeBadge type="FACT" />
              <span className="type-body text-ink">{p.statement}</span>
            </span>
            <span className="type-meta block">“{p.quote}” · {humanize(p.confidence)} confidence</span>
          </Item>
        ))}
      />
      <Group
        title="Resolved unknowns"
        items={of("RESOLVE_UNKNOWN").map((p) => (
          <Item key={p.id} proposal={p}>
            <span className="type-body text-ink-2 line-through decoration-ink-4">{p.evidenceStatement}</span>
            <span className="type-meta block">Answered by: {factById.get(p.byFactId)}</span>
          </Item>
        ))}
      />
      <Group
        title="Superseded assumptions"
        items={of("SUPERSEDE").map((p) => (
          <Item key={p.id} proposal={p}>
            <span className="flex flex-wrap items-center gap-2">
              <EvidenceTypeBadge type={p.evidenceType} />
              <span className="type-body text-ink-2 line-through decoration-ink-4">{p.evidenceStatement}</span>
            </span>
            <span className="type-meta block">Replaced by: {factById.get(p.byFactId)} · {p.reason}</span>
          </Item>
        ))}
      />
      <Group
        title="Prospect updates"
        items={of("FIELD").map((p) => (
          <Item key={p.id} proposal={p}>
            <span className="type-body text-ink">
              {humanize(p.field.replace(/([A-Z])/g, "_$1"))}: {p.previous ?? "—"} → <strong className="font-medium">{p.value}</strong>
            </span>
            <span className="type-meta block">
              Backed by: {p.byFactId ? factById.get(p.byFactId) : "a stored fact"}
            </span>
          </Item>
        ))}
      />
      <Group
        title="Contact updates"
        items={of("CONTACT").map((p) => (
          <Item key={p.id} proposal={p}>
            <span className="type-body text-ink">
              {contactNames[p.contactId] ?? p.contactName}
              {p.decisionRole ? ` → ${humanize(p.decisionRole)}` : ""}
              {p.makePrimary ? " · make primary" : ""}
            </span>
            <span className="type-meta block">
              {p.decisionRole ? `Was ${humanize(p.previousRole)}. ` : ""}“{p.quote}”
            </span>
          </Item>
        ))}
      />
      <Group
        title="Suggested pipeline update"
        items={of("PIPELINE").map((p) => (
          <Item key={p.id} proposal={p}>
            <span className="type-body text-ink">
              {humanize(p.from)} → <strong className="font-medium">{humanize(p.to)}</strong>
            </span>
            <span className="type-meta block">{p.reason}</span>
          </Item>
        ))}
      />
      <Group
        title="Next best action"
        items={of("NEXT_ACTION").map((p) => (
          <Item key={p.id} proposal={p}>
            <span className="type-body text-ink">
              {p.text}
              {p.at ? ` · ${dateTime.format(new Date(p.at))}` : ""}
            </span>
            <span className="type-meta block">
              {p.preserved ? "Your own next step, kept. " : ""}
              {p.reason}
              {!p.at && p.dateNeedsConfirmation ? " · Date needs confirmation" : ""}
            </span>
          </Item>
        ))}
      />

      {analysis.fitImpact ? (
        <div className="border-t border-line pt-3">
          <p className="type-label">Fit impact</p>
          <p className="type-meta mt-1">
            {analysis.fitImpact} The score is recalculated by the scorer when you apply.
          </p>
        </div>
      ) : null}

      {analysis.refused.length ? (
        <details className="border-t border-line pt-3">
          <summary className="type-meta cursor-pointer">
            {analysis.refused.length} suggestion{analysis.refused.length === 1 ? "" : "s"} refused by
            verification
          </summary>
          <ul className="type-meta mt-2 list-disc space-y-1 pl-5">
            {analysis.refused.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {analysis.proposals.length ? (
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Applying…" : "Apply selected"}
          </Button>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            formAction={dismissAnalysis.bind(null, interactionId)}
            disabled={pending}
          >
            Dismiss
          </Button>
          <span className="type-meta" aria-live="polite">
            {state.message}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span className="type-meta">Nothing in this note changes the record.</span>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            formAction={dismissAnalysis.bind(null, interactionId)}
          >
            Dismiss
          </Button>
        </div>
      )}
    </form>
  );
}

export function ConfirmGroup({
  prospectId,
  group,
  reason,
}: {
  prospectId: string;
  group: "KEEP" | "REVIEW" | "REMOVE";
  reason: string;
}) {
  return (
    <form
      action={setDecisionGroup.bind(null, prospectId, group, reason)}
      className="flex flex-wrap items-center gap-2.5"
    >
      <span className="type-meta">
        Suggested group: <strong className="font-medium text-ink">{humanize(group)}</strong> — {reason}
      </span>
      <Button type="submit" variant="secondary" size="sm">
        Confirm {humanize(group).toLowerCase()}
      </Button>
    </form>
  );
}
