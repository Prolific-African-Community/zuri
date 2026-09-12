"use client";

import { cn } from "@/lib/cn";
import { useFormStatus } from "react-dom";

function Cross({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      title={label}
      aria-label={label}
      disabled={pending}
      className={cn(
        "-my-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[0.9375rem] leading-none transition-colors duration-200",
        pending
          ? "text-ink-4"
          : "text-ink-4 hover:bg-sunken hover:text-ink-2",
      )}
    >
      {pending ? "·" : "×"}
    </button>
  );
}

/**
 * One click, one archive. Deliberately quiet: archiving is reversible, so it
 * does not deserve a confirmation dialog — only a small cross that gets the
 * card out of the way.
 */
export function ArchiveCross({
  action,
  label = "Archive",
}: {
  action: () => Promise<void>;
  label?: string;
}) {
  return (
    <form action={action}>
      <Cross label={label} />
    </form>
  );
}
