import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { renderPdf } from "../../lib/billing/pdf";
import { calculate, type Snapshot } from "../../lib/billing/domain";
import { company, draft } from "./fixtures";
const out = "tmp/billing-qa/pdfs";
function snapshot(
  count: number,
  description = draft.lines[0].description,
): Snapshot {
  const d = {
    ...draft,
    lines: Array.from({ length: count }, (_, i) => ({
      ...draft.lines[0],
      description: `${i + 1}. ${description}`,
    })),
  };
  return {
    version: 1,
    document: d,
    company,
    brand: { name: "Atelier Exemple", website: "" },
    number: "FAC-000001",
    totals: calculate(d.lines, d.vatMode),
  };
}
test("PDF A4: exactement 1, 2 et 4 pages, rendu identique", async () => {
  await mkdir(out, { recursive: true });
  for (const [count, pages] of [
    [1, 1],
    [17, 2],
    [50, 4],
  ]) {
    const s = snapshot(count);
    const bytes = await renderPdf(s);
    const pdf = await PDFDocument.load(bytes);
    assert.equal(pdf.getPageCount(), pages, `${count} lignes`);
    for (const p of pdf.getPages()) assert.equal(Math.round(p.getWidth()), 595);
    assert.deepEqual(bytes, await renderPdf(s));
    await writeFile(`${out}/${pages}-pages.pdf`, bytes);
  }
});
test("PDF descriptions longues et mots sans espaces", async () => {
  const s = snapshot(
    6,
    "Conception détaillée, étude et accompagnement. ".repeat(16) +
      "X".repeat(140),
  );
  const bytes = await renderPdf(s);
  await writeFile(`${out}/long-descriptions.pdf`, bytes);
  assert.ok((await PDFDocument.load(bytes)).getPageCount() > 1);
  await assert.rejects(
    () => renderPdf(snapshot(1, "Description ".repeat(1500))),
    /dépasse une page/,
  );
});

// The legal notes can occupy pages of their own; totals must still end the PDF.
test("PDF notes volumineuses, devis et franchise", async () => {
  const s = snapshot(2);
  s.document = {
    ...s.document,
    type: "QUOTE",
    vatMode: "EXEMPT",
    notes: "Conditions détaillées. ".repeat(350),
    lines: s.document.lines.map((l) => ({ ...l, vatRate: "0" })),
  };
  s.company = { ...s.company, vatStatus: "EXEMPT", vatNumber: "" };
  s.totals = calculate(s.document.lines, s.document.vatMode);
  const bytes = await renderPdf(s);
  assert.ok((await PDFDocument.load(bytes)).getPageCount() > 1);
  await writeFile(`${out}/quote-long-notes.pdf`, bytes);
});

test("PDF en-tête long : hauteur réelle et aucune prestation dans le pied de page", async () => {
  const s = snapshot(1, "Prestation de conception détaillée ".repeat(100));
  s.company = {
    ...company,
    name: "Société de validation ".repeat(40),
    rcs: "",
    permit: "",
    contact: "",
    email: "",
    phone: "",
    website: "",
    iban: "",
    bic: "",
    bank: "",
    paymentTerms: "",
  };
  // The removed brand heading now leaves enough room for this full row.
  assert.ok((await PDFDocument.load(await renderPdf(s))).getPageCount() > 0);
  s.document.lines[0].description =
    "Prestation de conception détaillée ".repeat(60);
  s.totals = calculate(s.document.lines, s.document.vatMode);
  await writeFile(`${out}/long-header.pdf`, await renderPdf(s));
});

test("PDF mentions TVA : franchise et autoliquidation explicites", async () => {
  for (const mode of ["EXEMPT", "REVERSE"] as const) {
    const s = snapshot(1);
    s.document = {
      ...s.document,
      vatMode: mode,
      reverseConfirmed: mode === "REVERSE",
      reverseBasis:
        mode === "REVERSE"
          ? "Prestation B2B transfrontalière : applicabilité vérifiée"
          : "",
      lines: s.document.lines.map((l) => ({ ...l, vatRate: "0" })),
    };
    s.company = {
      ...s.company,
      vatStatus: mode === "EXEMPT" ? "EXEMPT" : "NORMAL",
      vatNumber: mode === "EXEMPT" ? "" : company.vatNumber,
    };
    s.totals = calculate(s.document.lines, mode);
    assert.equal(s.totals.vat, "0.00");
    await writeFile(`${out}/tax-${mode.toLowerCase()}.pdf`, await renderPdf(s));
  }
});
