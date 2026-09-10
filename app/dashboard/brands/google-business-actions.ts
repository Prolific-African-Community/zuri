"use server";

import { getPrisma } from "@/lib/prisma";
import { requireSession } from "@/lib/session";
import { revalidatePath } from "next/cache";

/**
 * Stores the one location a brand posts to. The choice is always explicit:
 * Zuri lists what the account can reach and the reader picks.
 */
export async function setGoogleBusinessLocation(brandId: string, formData: FormData) {
  await requireSession();

  const value = String(formData.get("location") ?? "").trim();
  const prisma = getPrisma();

  if (!value) {
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        googleBusinessAccountId: null,
        googleBusinessLocationId: null,
        googleBusinessLocationName: null,
      },
    });
  } else {
    // "accounts/1|locations/2|Title" — the label is stored for display only.
    const [accountId, locationId, label] = value.split("|");
    if (!accountId || !locationId) throw new Error("Invalid location.");
    await prisma.brand.update({
      where: { id: brandId },
      data: {
        googleBusinessAccountId: accountId,
        googleBusinessLocationId: locationId,
        googleBusinessLocationName: label || locationId,
      },
    });
  }

  revalidatePath(`/dashboard/brands/${brandId}`);
  revalidatePath("/dashboard/content");
}
