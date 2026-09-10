"use client";

import {
  measureAction,
  type MeasureState,
} from "@/app/dashboard/actions/measure-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useActionState } from "react";

const initialState: MeasureState = { status: "idle", message: "" };

export type MeasurementView = {
  periodBefore: string;
  periodAfter: string;
  metricsBefore: Record<string, number>;
  metricsAfter: Record<string, number>;
  outcome: string;
  headline: string;
  observation: string;
  createdAt: string;
};

const OUTCOME_TONE: Record<string, "accent" | "neutral" | "muted"> = {
  POSITIVE: "accent",
  NEUTRAL: "neutral",
  NEGATIVE: "neutral",
  NOT_ENOUGH_DATA: "muted",
};

// Postgres jsonb does not keep key order, so the reading order is fixed here.
const ORDER = [
  "impressions",
  "clicks",
  "ctr",
  "position",
  "cpc",
  "cost",
  "conversions",
];

function label(value: string) {
  return value.toLowerCase().replace(/_/g, " ");
}

function Row({
  period,
  metrics,
  title,
}: {
  period: string;
  metrics: Record<string, number>;
  title: string;
}) {
  const keys = Object.keys(metrics).sort(
    (a, b) =>
      (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99),
  );
  return (
    <div className="sm:flex sm:gap-6">
      <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">{title}</dt>
      <dd className="mt-1 sm:mt-0">
        <p className="type-body text-ink-2">
          {keys.length
            ? keys.map((key) => `${label(key)} ${metrics[key]}`).join(" · ")
            : "—"}
        </p>
        <p className="type-meta mt-0.5">{period}</p>
      </dd>
    </div>
  );
}

export function ActionMeasurement({
  actionId,
  measurement,
}: {
  actionId: string;
  measurement: MeasurementView | null;
}) {
  const [state, formAction, pending] = useActionState(measureAction, initialState);

  return (
    <div className="mt-4 border-t border-line pt-4">
      {measurement ? (
        <dl className="grid max-w-3xl gap-2.5">
          <Row
            title="Before"
            period={measurement.periodBefore}
            metrics={measurement.metricsBefore}
          />
          <Row
            title="After"
            period={measurement.periodAfter}
            metrics={measurement.metricsAfter}
          />
          <div className="sm:flex sm:gap-6">
            <dt className="type-label shrink-0 sm:w-28 sm:pt-0.5">Outcome</dt>
            <dd className="mt-1 sm:mt-0">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge tone={OUTCOME_TONE[measurement.outcome] ?? "muted"}>
                  {label(measurement.outcome)}
                </Badge>
                <span className="type-body text-ink-2">{measurement.headline}</span>
              </div>
              <p className="type-meta mt-1.5">{measurement.observation}</p>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="type-meta">
          Not measured yet — Zuri reads the same window before and after the change.
        </p>
      )}

      <form action={formAction} className="mt-4 flex flex-wrap items-center gap-3">
        <input type="hidden" name="actionId" value={actionId} />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending
            ? "Reading…"
            : measurement
              ? "Measure again"
              : "Measure impact"}
        </Button>
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
    </div>
  );
}
