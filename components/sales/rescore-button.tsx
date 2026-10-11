"use client";

import { rescoreProspectAction } from "@/app/dashboard/sales/intelligence-actions";
import { Button } from "@/components/ui/button";
import { useTransition } from "react";

/** Re-scores explicitly; the workflow itself skips it if nothing factual changed. */
export function RescoreButton({ prospectId }: { prospectId: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={pending}
      onClick={() => start(async () => void (await rescoreProspectAction(prospectId)))}
    >
      {pending ? "Re-scoring…" : "Re-score"}
    </Button>
  );
}
