import { cn } from "@/lib/cn";
import type { ComponentProps, ReactNode } from "react";

const control =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2.5 text-[0.875rem] text-ink " +
  "placeholder:text-ink-4 transition-[border-color,box-shadow] duration-200 " +
  "hover:border-ink-4/50 " +
  "focus:border-accent focus:ring-4 focus:ring-accent/15 focus:outline-none " +
  "focus-visible:outline-none";

function Label({
  children,
  hint,
}: {
  children: ReactNode;
  hint?: string;
}) {
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-[0.8125rem] font-medium text-ink-2">{children}</span>
      {hint ? <span className="type-meta text-ink-4">{hint}</span> : null}
    </span>
  );
}

export function Field({
  label,
  hint,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="grid gap-2">
      <Label hint={hint}>{label}</Label>
      <input className={cn(control, className)} {...props} />
    </label>
  );
}

export function TextArea({
  label,
  hint,
  className,
  rows = 4,
  ...props
}: ComponentProps<"textarea"> & { label: string; hint?: string }) {
  return (
    <label className="grid gap-2">
      <Label hint={hint}>{label}</Label>
      <textarea
        rows={rows}
        className={cn(control, "resize-y leading-relaxed", className)}
        {...props}
      />
    </label>
  );
}

export function Select({
  label,
  hint,
  className,
  children,
  ...props
}: ComponentProps<"select"> & { label: string; hint?: string }) {
  return (
    <label className="grid gap-2">
      <Label hint={hint}>{label}</Label>
      <span className="relative block">
        <select
          className={cn(control, "appearance-none pr-9", className)}
          {...props}
        >
          {children}
        </select>
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-ink-4"
        >
          <path
            d="M4 6.5 8 10.5 12 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </label>
  );
}
