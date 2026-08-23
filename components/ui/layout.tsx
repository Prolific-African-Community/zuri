import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/** Page container. Every page shares the same measure and rhythm. */
export function Page({
  children,
  className,
  width = "default",
}: {
  children: ReactNode;
  className?: string;
  width?: "default" | "narrow";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full animate-rise",
        width === "narrow" ? "max-w-3xl" : "max-w-5xl",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="type-label">{eyebrow}</p> : null}
        <h1 className={cn("type-page-title", eyebrow && "mt-3")}>{title}</h1>
        {description ? (
          <p className="type-body mt-3 max-w-xl text-ink-3">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </header>
  );
}

/** A titled band of content, separated by whitespace and a hairline rule. */
export function Section({
  title,
  hint,
  actions,
  children,
  className,
}: {
  title?: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-14 first:mt-0", className)}>
      {title ? (
        <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
          <div className="flex items-baseline gap-3">
            <h2 className="type-section-title">{title}</h2>
            {hint ? <span className="type-meta">{hint}</span> : null}
          </div>
          {actions}
        </div>
      ) : null}
      <div className={cn(title && "mt-6")}>{children}</div>
    </section>
  );
}

/** Neutral panel used sparingly — only where a form needs to feel contained. */
export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-line bg-surface p-6 sm:p-8",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg bg-subtle px-6 py-12 text-center">
      <p className="type-section-title text-ink-2">{title}</p>
      {description ? (
        <p className="type-meta mx-auto mt-2 max-w-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="type-label">{label}</p>
      <p className="mt-2 text-[1.75rem] leading-none font-semibold tracking-[-0.03em]">
        {value}
      </p>
    </div>
  );
}
