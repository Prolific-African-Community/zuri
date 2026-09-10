"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

function SaveBar({ dirty, status }: { dirty: boolean; status: string }) {
  const { pending } = useFormStatus();

  return (
    <div className="sticky bottom-0 -mx-1 mt-6 flex flex-wrap items-center gap-3 border-t border-line bg-canvas/90 px-1 py-3 backdrop-blur">
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Save"}
      </Button>
      <span
        className={cn(
          "type-meta",
          pending ? "text-ink-3" : dirty ? "text-ink-2" : "text-ink-4",
        )}
      >
        {pending ? "Saving…" : dirty ? "Unsaved changes" : "Saved"}
      </span>
      <span className="type-meta ml-auto text-ink-4">
        {status.toLowerCase().replace(/_/g, " ")}
      </span>
    </div>
  );
}

/** A form that knows whether it has been touched since the last save. */
export function ArticleForm({
  action,
  status,
  children,
}: {
  action: (formData: FormData) => Promise<void>;
  status: string;
  children: ReactNode;
}) {
  const [dirty, setDirty] = useState(false);

  return (
    <form
      action={async (formData) => {
        await action(formData);
        setDirty(false);
      }}
      onInput={() => setDirty(true)}
      className="grid gap-5"
    >
      {children}
      <SaveBar dirty={dirty} status={status} />
    </form>
  );
}
