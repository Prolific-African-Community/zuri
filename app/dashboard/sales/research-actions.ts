"use server";

import { getPrisma } from "@/lib/prisma";
import { STALE_RUN_MS, executeResearchRun } from "@/lib/prospect-research-run";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { after } from "next/server";

export type ResearchState = { status: "idle" | "done" | "error"; message: string };

const MAX_REQUESTED = 20;

/**
 * Starts a research run and returns at once; the work continues after the
 * response. One run per campaign at a time.
 */
export async function startProspectResearch(
  campaignId: string,
  _prevState: ResearchState,
  formData: FormData,
): Promise<ResearchState> {
  await requireSession();

  const requested = Number.parseInt(String(formData.get("requestedCount") ?? "10"), 10);
  if (!Number.isFinite(requested) || requested < 1 || requested > MAX_REQUESTED) {
    return { status: "error", message: `Request between 1 and ${MAX_REQUESTED} prospects.` };
  }
  const geography = String(formData.get("geography") ?? "").trim() || null;
  const industry = String(formData.get("industry") ?? "").trim() || null;

  const prisma = getPrisma();
  const campaign = await prisma.salesCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { status: "error", message: "Campaign not found." };
  if (campaign.status === "ARCHIVED") {
    return { status: "error", message: "This campaign is archived. Restore it first." };
  }

  // A run that has been "running" for too long died with its process.
  await prisma.salesResearchRun.updateMany({
    where: {
      campaignId,
      status: "RUNNING",
      startedAt: { lt: new Date(Date.now() - STALE_RUN_MS) },
    },
    data: {
      status: "FAILED",
      stage: "Failed",
      error: "The run stopped before finishing.",
      completedAt: new Date(),
    },
  });
  const running = await prisma.salesResearchRun.findFirst({
    where: { campaignId, status: "RUNNING" },
  });
  if (running) {
    return { status: "error", message: "A research run is already in progress for this campaign." };
  }

  const run = await prisma.salesResearchRun.create({
    data: {
      campaignId,
      requestedCount: requested,
      geographyOverride: geography,
      industryOverride: industry,
      stage: "Queued",
    },
  });

  after(async () => {
    await executeResearchRun(run.id);
    revalidatePath(`/dashboard/sales/campaigns/${campaignId}`);
    revalidatePath("/dashboard/sales/prospects");
  });

  revalidatePath(`/dashboard/sales/campaigns/${campaignId}`);
  return { status: "done", message: "Research started." };
}
