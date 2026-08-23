"use server";

import { optionalText, toSlug } from "@/lib/brands";
import { BrandStatus } from "@/lib/generated/prisma/enums";
import { getPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createBrand(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = toSlug(String(formData.get("slug") ?? name));
  if (!name || !slug) throw new Error("Name and slug are required.");

  const prisma = getPrisma();
  const workspace = await prisma.workspace.findFirst({ orderBy: { createdAt: "asc" } });
  if (!workspace) throw new Error("No workspace exists. Run the database seed first.");

  const mission = String(formData.get("mission") ?? "").trim();
  const brand = await prisma.brand.create({
    data: {
      workspaceId: workspace.id, name, slug,
      websiteUrl: optionalText(formData.get("websiteUrl")),
      description: optionalText(formData.get("description")),
      ...(mission ? { profile: { create: { mission, manifesto: "", positioning: "", valueProposition: "", voiceDescription: "", language: "en" } } } : {}),
    },
  });
  revalidatePath("/dashboard/brands");
  redirect(`/dashboard/brands/${brand.id}`);
}

export async function updateBrand(brandId: string, formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const slug = toSlug(String(formData.get("slug") ?? name));
  const rawStatus = String(formData.get("status") ?? "ACTIVE");
  if (!name || !slug || !Object.values(BrandStatus).includes(rawStatus as BrandStatus)) throw new Error("Invalid brand information.");

  const mission = String(formData.get("mission") ?? "").trim();
  await getPrisma().brand.update({
    where: { id: brandId },
    data: {
      name, slug, status: rawStatus as BrandStatus,
      websiteUrl: optionalText(formData.get("websiteUrl")), description: optionalText(formData.get("description")),
      ...(formData.has("mission")
        ? { profile: { upsert: { update: { mission }, create: { mission, manifesto: "", positioning: "", valueProposition: "", voiceDescription: "", language: "en" } } } }
        : {}),
    },
  });
  revalidatePath("/dashboard/brands");
  revalidatePath(`/dashboard/brands/${brandId}`);
}
