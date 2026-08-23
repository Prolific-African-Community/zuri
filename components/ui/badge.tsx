import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type Tone = "neutral" | "accent" | "muted";

const tones: Record<Tone, string> = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent-ink",
  muted: "bg-transparent text-ink-4 ring-1 ring-line-strong ring-inset",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[0.6875rem] font-medium tracking-[0.02em] uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
