import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { BillingError } from "./domain";

// The existing cookie authenticates one installation administrator, not a user
// membership. Never accept a workspace id supplied by a form or URL.
export async function billingWorkspace() {
  await requireSession();
  const db = getPrisma();
  const configured = process.env.BILLING_WORKSPACE_ID?.trim();
  if (configured) {
    const workspace = await db.workspace.findUnique({
      where: { id: configured },
    });
    if (!workspace)
      throw new BillingError(
        "BILLING_WORKSPACE_ID ne correspond à aucun workspace.",
      );
    return workspace;
  }
  const workspaces = await db.workspace.findMany({
    take: 2,
    orderBy: { createdAt: "asc" },
  });
  if (workspaces.length !== 1)
    throw new BillingError(
      "Configurez BILLING_WORKSPACE_ID pour définir le workspace autorisé à facturer.",
    );
  return workspaces[0];
}
