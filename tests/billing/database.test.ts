import test from "node:test";
import assert from "node:assert/strict";
import { getPrisma } from "../../lib/prisma";
import {
  saveDraft,
  saveCompany,
  issueDocument,
  changeStatus,
  copyDocument,
  previewDocument,
} from "../../lib/billing/service";
import { company, draft } from "./fixtures";
import { parseDraft } from "../../lib/billing/domain";
const url = process.env.BILLING_TEST_DATABASE_URL;
const enabled = Boolean(
  url &&
  /^postgres(ql)?:\/\/[^@]+@(localhost|127\.0\.0\.1):\d+\/zuri_billing_qa(?:\?|$)/.test(
    url,
  ),
);
test(
  "PostgreSQL: isolation, numérotation concurrente, verrouillage, snapshot et conversion idempotente",
  { skip: !enabled },
  async () => {
    process.env.DATABASE_URL = url!;
    const db = getPrisma();
    try {
      const w = await db.workspace.create({
        data: { name: "Billing QA " + Date.now() },
      });
      const other = await db.workspace.create({ data: { name: "Other QA" } });
      const b = await db.brand.create({
        data: { workspaceId: w.id, name: "Atelier Exemple", slug: "qa" },
      });
      const outsider = await db.brand.create({
        data: { workspaceId: other.id, name: "Other brand", slug: "other" },
      });
      const c = await saveCompany(w.id, company, "FAC");
      const input = { ...draft, brandId: b.id, companyId: c.id };
      await assert.rejects(
        () => saveDraft(w.id, { ...input, brandId: outsider.id }),
        /inaccessible/,
      );
      await assert.rejects(() => saveDraft(other.id, input), /inaccessible/);
      const docs = await Promise.all(
        Array.from({ length: 5 }, () => saveDraft(w.id, input)),
      );
      await assert.rejects(
        () => issueDocument(other.id, docs[0].id, 0),
        /introuvable/,
      );
      const issued = await Promise.all(
        docs.map((d) => issueDocument(w.id, d.id, 0)),
      );
      assert.deepEqual(
        issued.map((d) => d.number).sort(),
        [1, 2, 3, 4, 5].map((n) => `FAC-${String(n).padStart(6, "0")}`),
      );
      await assert.rejects(
        () => issueDocument(w.id, docs[0].id, 0),
        /déjà émis/,
      );
      await assert.rejects(
        () => saveDraft(w.id, input, docs[0].id, 1),
        /verrouillée/,
      );
      await assert.rejects(() =>
        db.billingDocument.update({
          where: { id: docs[0].id },
          data: { customerName: "Tampered" },
        }),
      );
      await assert.rejects(() =>
        db.billingDocument.delete({ where: { id: docs[0].id } }),
      );
      const pdf = await previewDocument(w.id, docs[0].id);
      await saveCompany(
        w.id,
        { ...company, name: "Nouveau nom juridique" },
        "FAC",
        c.id,
        0,
      );
      assert.deepEqual(await previewDocument(w.id, docs[0].id), pdf);
      await changeStatus(w.id, docs[0].id, "PAID", 1);
      await assert.rejects(() => changeStatus(w.id, docs[0].id, "ISSUED", 2));
      await assert.rejects(
        () => saveCompany(w.id, company, "NEW", c.id, 1),
        /préfixe/,
      );
      const old = await saveDraft(w.id, input);
      await saveDraft(w.id, input, old.id, 0);
      await assert.rejects(() => saveDraft(w.id, input, old.id, 0), /changé/);
      const oversized = await saveDraft(w.id, {
        ...input,
        lines: [
          { ...input.lines[0], description: "Description ".repeat(1500) },
        ],
      });
      const beforeFailure = await db.billingCompany.findUniqueOrThrow({
        where: { id: c.id },
      });
      await assert.rejects(
        () => issueDocument(w.id, oversized.id, 0),
        /dépasse une page/,
      );
      assert.equal(
        (await db.billingCompany.findUniqueOrThrow({ where: { id: c.id } }))
          .nextInvoice,
        beforeFailure.nextInvoice,
      );
      assert.equal(
        (
          await db.billingDocument.findUniqueOrThrow({
            where: { id: oversized.id },
          })
        ).status,
        "DRAFT",
      );
      const same = await saveDraft(w.id, input);
      const competing = await Promise.allSettled([
        issueDocument(w.id, same.id, 0),
        issueDocument(w.id, same.id, 0),
      ]);
      assert.equal(competing.filter((r) => r.status === "fulfilled").length, 1);
      const q = await saveDraft(w.id, { ...input, type: "QUOTE" });
      await issueDocument(w.id, q.id, 0);
      await assert.rejects(() => copyDocument(w.id, q.id, true), /accepté/);
      await changeStatus(w.id, q.id, "ACCEPTED", 1);
      const converted = await Promise.all([
        copyDocument(w.id, q.id, true),
        copyDocument(w.id, q.id, true),
      ]);
      assert.equal(converted[0].id, converted[1].id);
      assert.equal(converted[0].status, "DRAFT");
      assert.equal(converted[0].type, "INVOICE");
      assert.deepEqual(
        converted[0].payload,
        parseDraft({
          ...input,
          type: "INVOICE",
          issueDate: new Date().toISOString().slice(0, 10),
          dueDate:
            input.dueDate < new Date().toISOString().slice(0, 10)
              ? new Date().toISOString().slice(0, 10)
              : input.dueDate,
        }),
      );
      const duplicate = await copyDocument(w.id, docs[0].id, false);
      assert.equal(duplicate.number, null);
      assert.equal(duplicate.status, "DRAFT");
      await assert.rejects(
        () => previewDocument(other.id, docs[0].id),
        /introuvable/,
      );
      // DB composite foreign keys also reject a cross-workspace brand.
      await assert.rejects(() =>
        db.billingDocument.create({
          data: {
            workspaceId: w.id,
            brandId: outsider.id,
            companyId: c.id,
            type: "INVOICE",
            status: "DRAFT",
            issueDate: draft.issueDate,
            customerName: "x",
            payload: input,
          },
        }),
      );
      console.log(
        "PostgreSQL QA: 5 factures concurrentes, isolation, verrouillage DB, snapshot stable et conversion concurrente vérifiés.",
      );
    } finally {
      await db.$disconnect();
    }
  },
);
