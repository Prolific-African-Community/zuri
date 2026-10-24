import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { head, del } from "@vercel/blob";
import { PDFDocument, PDFName, PDFDict, PDFRawStream } from "pdf-lib";
import { getPrisma } from "../../lib/prisma";
import { saveCompanyForm } from "../../lib/billing/company-logo";
import {
  saveCompany,
  saveDraft,
  issueDocument,
  changeStatus,
  copyDocument,
  previewDocument,
} from "../../lib/billing/service";
import { parseCompany, parseDraft } from "../../lib/billing/domain";
import { company, draft } from "./fixtures";
const url = process.env.BILLING_TEST_DATABASE_URL;
const local = Boolean(
  url &&
  /^postgres(ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1):\d+\/zuri_billing_qa(?:\?|$)/.test(
    url,
  ),
);
async function image() {
  return sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120"><rect width="320" height="120" rx="16" fill="#4032b5"/><path d="M28 28h64L28 92h64" fill="none" stroke="white" stroke-width="12"/><text x="120" y="76" fill="white" font-family="sans-serif" font-size="32">QA LOGO</text></svg>',
    ),
  )
    .png()
    .toBuffer();
}
async function form(id?: string, revision = 0) {
  const f = new FormData();
  f.set("profile", JSON.stringify(company));
  f.set("prefix", "QA");
  f.set("id", id ?? "");
  f.set("revision", String(revision));
  f.set(
    "logo",
    new File([new Uint8Array(await image())], "qa-logo.png", {
      type: "image/png",
    }),
  );
  return f;
}
function countImages(bytes: Buffer) {
  return PDFDocument.load(bytes).then((pdf) =>
    pdf.getPages().map((page) => {
      const resources = page.node.Resources();
      const objects = resources?.lookup(PDFName.of("XObject"), PDFDict);
      return objects
        ? objects.entries().filter(([, ref]) => {
            const entry = pdf.context.lookup(ref);
            return (
              entry instanceof PDFRawStream &&
              entry.dict.get(PDFName.of("Subtype"))?.toString() === "/Image"
            );
          }).length
        : 0;
    }),
  );
}
test(
  "Logo: refus avant upload et nettoyage après conflit de sauvegarde",
  { skip: !local },
  async () => {
    process.env.DATABASE_URL = url!;
    const db = getPrisma();
    try {
      const w = await db.workspace.create({
        data: { name: "Logo regression QA" },
      });
      const other = await db.workspace.create({
        data: { name: "Other logo QA" },
      });
      const c = await saveCompany(w.id, company, "QA");
      let uploaded = 0,
        removed = 0;
      const storage = {
        upload: async () => {
          uploaded++;
          return { url: "https://qa.invalid/logo.png" };
        },
        remove: async () => {
          removed++;
        },
      };
      const invalid = await form();
      invalid.set("profile", JSON.stringify({ ...company, vatNumber: "" }));
      await assert.rejects(() => saveCompanyForm(w.id, invalid, storage));
      assert.equal(uploaded, 0);
      const foreignForm = await form(c.id);
      await assert.rejects(() =>
        saveCompanyForm(other.id, foreignForm, storage),
      );
      assert.equal(uploaded, 0);
      const malformed = await form();
      malformed.set(
        "logo",
        new File(["not an image"], "broken.png", { type: "image/png" }),
      );
      await assert.rejects(() => saveCompanyForm(w.id, malformed, storage));
      assert.equal(uploaded, 0);
      await assert.rejects(
        () => saveCompanyForm(w.id, formSync(c.id, 99), storage),
        /Profil modifié/,
      );
      assert.equal(uploaded, 0);
      const conflictForm = await form(c.id, 0);
      const concurrent2 = {
        upload: async () => {
          uploaded++;
          await saveCompany(
            w.id,
            { ...company, phone: "updated twice" },
            "QA",
            c.id,
            0,
          );
          return { url: "https://qa.invalid/logo.png" };
        },
        remove: storage.remove,
      };
      await assert.rejects(
        () => saveCompanyForm(w.id, conflictForm, concurrent2),
        /Profil modifié/,
      );
      assert.equal(uploaded, 1);
      assert.equal(removed, 1);
    } finally {
      await db.$disconnect();
    }
  },
);
function formSync(id: string, revision = 0) {
  const f = new FormData();
  f.set("profile", JSON.stringify(company));
  f.set("prefix", "QA");
  f.set("id", id);
  f.set("revision", String(revision));
  return f;
}
test(
  "Blob réel: société → client → devis avec logo → conversion → facture avec logo",
  { skip: !local || process.env.BILLING_LIVE_BLOB_TEST !== "1" },
  async () => {
    process.env.DATABASE_URL = url!;
    const db = getPrisma();
    let blobUrl: string | undefined;
    try {
      const w = await db.workspace.create({
        data: { name: "billing-validation-" + Date.now() },
      });
      const b = await db.brand.create({
        data: {
          workspaceId: w.id,
          name: "Validation locale",
          slug: "validation-locale",
        },
      });
      const c = await saveCompanyForm(w.id, await form());
      const profile = parseCompany(c.profile);
      blobUrl = profile.logoBlobUrl;
      assert.ok(blobUrl);
      const metadata = await head(blobUrl);
      assert.equal(metadata.contentType, "image/png");
      const stored = Buffer.from(await (await fetch(blobUrl)).arrayBuffer());
      assert.deepEqual(
        stored,
        Buffer.from(profile.logo.split(",")[1], "base64"),
      );
      const customer = await db.billingCustomer.create({
        data: {
          workspaceId: w.id,
          name: draft.customer.name,
          details: draft.customer,
        },
      });
      const q = await saveDraft(w.id, {
        ...draft,
        type: "QUOTE",
        brandId: b.id,
        companyId: c.id,
        customer: customer.details,
      });
      const sent = await issueDocument(w.id, q.id, 0);
      assert.equal(sent.number, "QA-DEV-000001");
      const quotePdf = await previewDocument(w.id, q.id);
      assert.ok((await countImages(quotePdf)).every((n) => n === 1));
      await changeStatus(w.id, q.id, "ACCEPTED", 1);
      const invoice = await copyDocument(w.id, q.id, true);
      const final = await issueDocument(w.id, invoice.id, 0);
      assert.equal(final.number, "QA-000001");
      const invoicePdf = await previewDocument(w.id, invoice.id);
      assert.ok((await countImages(invoicePdf)).every((n) => n === 1));
      assert.deepEqual(
        parseDraft(invoice.payload).lines,
        parseDraft(q.payload).lines,
      );
      await mkdir("tmp/billing-qa/pdfs", { recursive: true });
      await writeFile("tmp/billing-qa/pdfs/live-logo-quote.pdf", quotePdf);
      await writeFile("tmp/billing-qa/pdfs/live-logo-invoice.pdf", invoicePdf);
      await del(blobUrl);
      await assert.rejects(() => head(blobUrl!));
      blobUrl = undefined;
      assert.deepEqual(await previewDocument(w.id, invoice.id), invoicePdf);
      console.log(
        "LIVE_BLOB_QA_PASS: upload/readback exact, PNG metadata, logo PDF devis et facture, conversion et PDF stable après suppression Blob.",
      );
    } finally {
      if (blobUrl) await del(blobUrl);
      await db.$disconnect();
    }
  },
);
