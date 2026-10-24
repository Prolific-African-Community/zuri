"use server";
import { billingWorkspace } from "@/lib/billing/access";
import {
  saveDraft,
  issueDocument,
  copyDocument,
  changeStatus,
  safeError,
} from "@/lib/billing/service";
import {
  parseParty,
  parseCompany,
  type CompanyProfile,
} from "@/lib/billing/domain";
import { saveCompanyForm } from "@/lib/billing/company-logo";
import { getPrisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type Result = {
  id?: string;
  error?: string;
  message?: string;
  profile?: CompanyProfile;
};
export async function saveDocumentAction(
  input: unknown,
  id?: string,
  revision?: number,
): Promise<Result> {
  const w = await billingWorkspace();
  try {
    const d = await saveDraft(w.id, input, id, revision);
    revalidatePath("/dashboard/billing");
    return { id: d.id, message: "Brouillon enregistré." };
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function documentAction(
  id: string,
  action: string,
  revision: number,
): Promise<Result> {
  const w = await billingWorkspace();
  try {
    const d =
      action === "ISSUE"
        ? await issueDocument(w.id, id, revision)
        : action === "DUPLICATE" || action === "CONVERT"
          ? await copyDocument(w.id, id, action === "CONVERT")
          : await changeStatus(w.id, id, action, revision);
    revalidatePath("/dashboard/billing");
    return { id: d.id, message: "Document mis à jour." };
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function companyAction(form: FormData): Promise<Result> {
  const w = await billingWorkspace();
  try {
    const c = await saveCompanyForm(w.id, form);
    revalidatePath("/dashboard/billing");
    return {
      id: c.id,
      message: "Profil de facturation enregistré.",
      profile: parseCompany(c.profile),
    };
  } catch (e) {
    return { error: safeError(e) };
  }
}
export async function customerAction(input: unknown): Promise<Result> {
  const w = await billingWorkspace();
  try {
    const details = parseParty(input);
    const c = await getPrisma().billingCustomer.create({
      data: { workspaceId: w.id, name: details.name, details },
    });
    revalidatePath("/dashboard/billing");
    return { id: c.id, message: "Client enregistré." };
  } catch (e) {
    return { error: safeError(e) };
  }
}
