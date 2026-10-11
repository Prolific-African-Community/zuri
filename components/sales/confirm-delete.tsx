"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";

/** Permanent deletion is always two steps. */
export function ConfirmDelete({
  action,
  label,
  question,
}: {
  action: () => Promise<void>;
  label: string;
  question: string;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-subtle p-4">
      <p className="type-body text-ink-2">{question}</p>
      <p className="type-meta mt-1">This cannot be undone.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <form action={action}>
          <Button type="submit" size="sm">
            Delete permanently
          </Button>
        </form>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
