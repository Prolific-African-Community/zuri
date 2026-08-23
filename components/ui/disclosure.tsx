import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

/**
 * A quiet inline editor. Native <details> keeps every CRUD form working
 * without client-side state, which matters for forms driven by Server Actions.
 */
export function Disclosure({
  summary,
  children,
  className,
  tone = "default",
}: {
  summary: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: "default" | "accent";
}) {
  return (
    <details className={cn("group", className)}>
      <summary
        className={cn(
          "flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-[0.8125rem] font-medium transition-colors duration-200",
          tone === "accent"
            ? "text-accent-ink hover:text-accent-strong"
            : "text-ink-3 hover:text-ink",
        )}
      >
        <svg
          viewBox="0 0 16 16"
          aria-hidden
          className="h-3.5 w-3.5 transition-transform duration-200 group-open:rotate-90"
        >
          <path
            d="M6 4l4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {summary}
      </summary>
      <div className="mt-5 animate-fade">{children}</div>
    </details>
  );
}
