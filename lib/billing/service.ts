import { getPrisma } from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  calculate,
  canEdit,
  conversionDraft,
  nextStatus,
  parseCompany,
  parseDraft,
  requireValue,
  validateTax,
  type Snapshot,
  BillingError,
} from "./domain";
import { renderPdf } from "./pdf";

type Tx = Prisma.TransactionClient;
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
export async function transaction<T>(fn: (tx: Tx) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getPrisma().$transaction(fn, {
        isolationLevel: "Serializable",
        timeout: 60000,
        maxWait: 10000,
      });
    } catch (e) {
      const meta =
        e instanceof Prisma.PrismaClientKnownRequestError
          ? (e.meta as
              | {
                  code?: string;
                  driverAdapterError?: { cause?: { originalCode?: string } };
                }
              | undefined)
          : undefined;
      const retryable =
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === "P2034" ||
          (e.code === "P2010" &&
            ["40001", "40P01"].includes(
              String(
                meta?.code ?? meta?.driverAdapterError?.cause?.originalCode,
              ),
            )));
      if (attempt < 12 && retryable) {
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
}
async function documentLock(tx: Tx, id: string, workspaceId: string) {
  await tx.$queryRaw`SELECT id FROM "BillingDocument" WHERE id=${id} AND "workspaceId"=${workspaceId} FOR UPDATE`;
  const doc = await tx.billingDocument.findFirst({
    where: { id, workspaceId },
  });
  requireValue(doc, "Document introuvable.");
  return doc;
}
async function context(
  tx: Tx,
  workspaceId: string,
  d: ReturnType<typeof parseDraft>,
) {
  const [company, brand] = await Promise.all([
    tx.billingCompany.findFirst({ where: { id: d.companyId, workspaceId } }),
    tx.brand.findFirst({ where: { id: d.brandId, workspaceId } }),
  ]);
  requireValue(
    company && brand,
    "Société ou marque inaccessible dans ce workspace.",
  );
  const profile = parseCompany(company.profile);
  validateTax(d, profile);
  return { company, brand, profile };
}
export async function saveDraft(
  workspaceId: string,
  input: unknown,
  id?: string,
  revision?: number,
) {
  const d = parseDraft(input);
  return transaction(async (tx) => {
    const { company } = await context(tx, workspaceId, d);
    if (id) {
      const old = await documentLock(tx, id, workspaceId);
      requireValue(
        canEdit(old.type, old.status),
        "Cette facture émise est verrouillée.",
      );
      requireValue(
        old.revision === revision,
        "Ce document a changé. Rechargez la page.",
      );
      requireValue(
        old.type === d.type,
        "Le type d’un document existant ne peut pas changer.",
      );
      requireValue(
        !old.number || old.companyId === company.id,
        "Un document numéroté ne peut pas changer de société.",
      );
      return tx.billingDocument.update({
        where: { id },
        data: {
          brandId: d.brandId,
          companyId: d.companyId,
          issueDate: d.issueDate,
          customerName: d.customer.name,
          payload: json(d),
          status: "DRAFT",
          snapshot: Prisma.DbNull,
          pdfBytes: null,
          issuedAt: null,
          revision: { increment: 1 },
        },
      });
    }
    return tx.billingDocument.create({
      data: {
        workspaceId,
        brandId: d.brandId,
        companyId: d.companyId,
        type: d.type,
        issueDate: d.issueDate,
        customerName: d.customer.name,
        payload: json(d),
      },
    });
  });
}
export async function issueDocument(
  workspaceId: string,
  id: string,
  revision: number,
) {
  return transaction(async (tx) => {
    const doc = await documentLock(tx, id, workspaceId);
    requireValue(
      doc.status === "DRAFT" && doc.revision === revision,
      "Document déjà émis ou modifié. Rechargez la page.",
    );
    const d = parseDraft(doc.payload);
    await tx.$queryRaw`SELECT id FROM "BillingCompany" WHERE id=${d.companyId} AND "workspaceId"=${workspaceId} FOR UPDATE`;
    const { company, brand, profile } = await context(tx, workspaceId, d);
    const last = await tx.billingDocument.findFirst({
      where: { companyId: company.id, type: d.type, issuedAt: { not: null } },
      orderBy: { issueDate: "desc" },
    });
    requireValue(
      !last || d.issueDate >= last.issueDate,
      "La date d’émission précède le dernier document émis dans cette série.",
    );
    const counter = d.type === "INVOICE" ? "nextInvoice" : "nextQuote";
    const number =
      doc.number ??
      `${company.prefix}-${d.type === "QUOTE" ? "DEV-" : ""}${String(company[counter]).padStart(6, "0")}`;
    const snapshot: Snapshot = {
      version: 1,
      document: d,
      company: profile,
      brand: { name: brand.name, website: brand.websiteUrl ?? "" },
      number,
      totals: calculate(d.lines, d.vatMode),
    };
    const bytes = await renderPdf(snapshot);
    if (!doc.number)
      await tx.billingCompany.update({
        where: { id: company.id },
        data: { [counter]: { increment: 1 } },
      });
    return tx.billingDocument.update({
      where: { id },
      data: {
        number,
        snapshot: json(snapshot),
        pdfBytes: bytes,
        issuedAt: new Date(),
        status: d.type === "INVOICE" ? "ISSUED" : "SENT",
        revision: { increment: 1 },
      },
    });
  });
}
export async function copyDocument(
  workspaceId: string,
  id: string,
  convert: boolean,
) {
  return transaction(async (tx) => {
    const source = await documentLock(tx, id, workspaceId);
    if (convert) {
      requireValue(
        source.type === "QUOTE" && source.status === "ACCEPTED",
        "Seul un devis accepté peut être converti.",
      );
      const existing = await tx.billingDocument.findFirst({
        where: { sourceQuoteId: id, workspaceId },
      });
      if (existing) return existing;
    }
    const draft = parseDraft(source.payload);
    const d = convert ? conversionDraft(draft) : draft;
    await context(tx, workspaceId, d);
    // A write on the locked quote forces concurrent Serializable snapshots to
    // retry, so the second conversion observes and returns the first invoice.
    if (convert)
      await tx.billingDocument.update({
        where: { id },
        data: { revision: { increment: 1 } },
      });
    return tx.billingDocument.create({
      data: {
        workspaceId,
        brandId: d.brandId,
        companyId: d.companyId,
        type: d.type,
        issueDate: d.issueDate,
        customerName: d.customer.name,
        payload: json(d),
        sourceQuoteId: convert ? id : null,
      },
    });
  });
}
export async function changeStatus(
  workspaceId: string,
  id: string,
  target: string,
  revision: number,
) {
  return transaction(async (tx) => {
    const doc = await documentLock(tx, id, workspaceId);
    requireValue(
      doc.revision === revision,
      "Le document a changé. Rechargez la page.",
    );
    return tx.billingDocument.update({
      where: { id },
      data: {
        status: nextStatus(doc.type, doc.status, target),
        revision: { increment: 1 },
      },
    });
  });
}
export async function previewDocument(workspaceId: string, id: string) {
  const db = getPrisma();
  const doc = await db.billingDocument.findFirst({
    where: { id, workspaceId },
  });
  requireValue(doc, "Document introuvable.");
  if (doc.pdfBytes && doc.status !== "DRAFT") return Buffer.from(doc.pdfBytes);
  const d = parseDraft(doc.payload);
  const { profile, brand } = await context(db, workspaceId, d);
  return renderPdf(
    {
      version: 1,
      document: d,
      company: profile,
      brand: { name: brand.name, website: brand.websiteUrl ?? "" },
      number: doc.number ?? "BROUILLON",
      totals: calculate(d.lines, d.vatMode),
    },
    true,
  );
}
function validateExistingCompany(
  old: {
    revision: number;
    prefix: string;
    nextInvoice: number;
    nextQuote: number;
  } | null,
  prefix: string,
  revision?: number,
) {
  requireValue(old, "Société inaccessible.");
  requireValue(old.revision === revision, "Profil modifié. Rechargez la page.");
  requireValue(
    old.prefix === prefix || (old.nextInvoice === 1 && old.nextQuote === 1),
    "Le préfixe est verrouillé après la première émission.",
  );
}
export async function validateCompanyWrite(
  workspaceId: string,
  input: unknown,
  prefix: string,
  id?: string,
  revision?: number,
) {
  const profile = parseCompany(input);
  requireValue(
    /^[A-Z0-9]{1,12}$/.test(prefix),
    "Préfixe : 1 à 12 lettres majuscules ou chiffres.",
  );
  if (id)
    validateExistingCompany(
      await getPrisma().billingCompany.findFirst({
        where: { id, workspaceId },
      }),
      prefix,
      revision,
    );
  return profile;
}
export async function saveCompany(
  workspaceId: string,
  input: unknown,
  prefix: string,
  id?: string,
  revision?: number,
) {
  const profile = parseCompany(input);
  requireValue(
    /^[A-Z0-9]{1,12}$/.test(prefix),
    "Préfixe : 1 à 12 lettres majuscules ou chiffres.",
  );
  return transaction(async (tx) => {
    if (id) {
      await tx.$queryRaw`SELECT id FROM "BillingCompany" WHERE id=${id} AND "workspaceId"=${workspaceId} FOR UPDATE`;
      const old = await tx.billingCompany.findFirst({
        where: { id, workspaceId },
      });
      validateExistingCompany(old, prefix, revision);
      return tx.billingCompany.update({
        where: { id },
        data: {
          name: profile.name,
          profile: json(profile),
          prefix,
          revision: { increment: 1 },
        },
      });
    }
    return tx.billingCompany.create({
      data: { workspaceId, name: profile.name, profile: json(profile), prefix },
    });
  });
}
export function safeError(e: unknown) {
  return e instanceof BillingError
    ? e.message
    : "L’opération a échoué. Réessayez ou contactez l’administrateur.";
}
