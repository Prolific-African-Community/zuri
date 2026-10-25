import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { exemption, requireValue, type Snapshot } from "./domain";

const W = 595.28,
  H = 841.89,
  M = 42,
  BOTTOM = 66;
const ink = rgb(0.09, 0.12, 0.17),
  muted = rgb(0.38, 0.42, 0.47),
  accent = rgb(0.28, 0.19, 0.13),
  line = rgb(0.87, 0.89, 0.92);
// Measurement uses the embedded font, including long tokens and explicit newlines.
export function wrap(text: string, font: PDFFont, size: number, width: number) {
  const result: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    let row = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (row && font.widthOfTextAtSize(`${row} ${word}`, size) <= width) {
        row += ` ${word}`;
        continue;
      }
      if (row) {
        result.push(row);
        row = "";
      }
      for (const char of word) {
        if (row && font.widthOfTextAtSize(row + char, size) > width) {
          result.push(row);
          row = "";
        }
        row += char;
      }
    }
    result.push(row);
  }
  return result;
}
export async function renderPdf(snapshot: Snapshot, draft = false) {
  const { document: d, company: c, totals: t } = snapshot;
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(
    await readFile(
      path.join(process.cwd(), "lib/billing/fonts/NotoSans-Regular.ttf"),
    ),
    { subset: true },
  );
  const supported = new Set(font.getCharacterSet());
  const renderedValues = [
    snapshot.number,
    ...Object.entries(c)
      .filter(([key]) => !["logo", "logoBlobUrl", "legalForm"].includes(key))
      .map(([, value]) => value),
    ...Object.values(d.customer),
    d.subject,
    d.notes,
    d.reverseBasis,
    ...d.lines.flatMap((l) => Object.values(l)),
  ];
  requireValue(
    renderedValues.every((value) =>
      [...String(value)].every(
        (char) => /[\n\r\t]/.test(char) || supported.has(char.codePointAt(0)!),
      ),
    ),
    "Certains caractères ne sont pas couverts par la police PDF. Remplacez-les avant l’émission.",
  );
  const fixed = new Date(`${d.issueDate}T00:00:00Z`);
  pdf.setCreationDate(fixed);
  pdf.setModificationDate(fixed);
  pdf.setProducer("Zuri Billing v1");
  pdf.setCreator("Zuri");
  pdf.setTitle(
    `${d.type === "INVOICE" ? "Facture" : "Devis"} ${snapshot.number}`,
  );
  let page!: PDFPage;
  let y = 0;
  let contentStart = 94;
  const text = (s: string, x: number, top: number, size = 9, color = ink) =>
    page.drawText(s, { x, y: H - top - size, size, font, color });
  const right = (
    s: string,
    x: number,
    top: number,
    size = 9,
    maxWidth = 220,
  ) => {
    const fit = Math.min(size, maxWidth / font.widthOfTextAtSize(s, 1));
    text(s, x - font.widthOfTextAtSize(s, fit), top, fit);
  };
  const rule = (top: number) =>
    page.drawLine({
      start: { x: M, y: H - top },
      end: { x: W - M, y: H - top },
      color: line,
      thickness: 0.6,
    });
  const block = (
    s: string,
    x: number,
    top: number,
    width: number,
    size = 9,
  ) => {
    const rows = wrap(s, font, size, width);
    rows.forEach((r, i) => text(r, x, top + i * (size + 3), size));
    return rows.length * (size + 3);
  };
  let logo: Awaited<ReturnType<typeof pdf.embedPng>> | undefined;
  if (c.logo) {
    const bytes = Buffer.from(c.logo.split(",")[1], "base64");
    logo = c.logo.startsWith("data:image/png")
      ? await pdf.embedPng(bytes)
      : await pdf.embedJpg(bytes);
  }
  const newPage = () => {
    page = pdf.addPage([W, H]);
    page.drawRectangle({
      x: M,
      y: H - 32,
      width: 28,
      height: 3,
      color: accent,
    });
    text(d.type === "INVOICE" ? "FACTURE" : "DEVIS", M, 44, 25);
    const reference = snapshot.number === "BROUILLON" ? "" : snapshot.number;
    let referenceBottom = draft ? 56 : 48;
    if (draft) right("BROUILLON · NON ÉMIS", W - M, 39, 8);
    if (reference) {
      const rows = wrap(reference, font, 15, 220);
      rows.forEach((row, i) => right(row, W - M, referenceBottom + i * 18, 15));
      referenceBottom += rows.length * 18;
    }
    if (logo) {
      const scale = Math.min(65 / logo.width, 30 / logo.height);
      referenceBottom += 8;
      page.drawImage(logo, {
        x: W - M - logo.width * scale,
        y: H - referenceBottom - logo.height * scale,
        width: logo.width * scale,
        height: logo.height * scale,
      });
      referenceBottom += logo.height * scale;
    }
    y = Math.max(94, referenceBottom + 16);
    contentStart = y;
  };
  const tableHeader = () => {
    page.drawRectangle({
      x: M,
      y: H - y - 24,
      width: W - 2 * M,
      height: 24,
      color: rgb(0.95, 0.96, 0.98),
    });
    text("PRESTATION", M + 8, y + 6, 8, muted);
    right("QTÉ / UNITÉ", 350, y + 6, 7);
    right("P.U. HT", 423, y + 6, 7);
    right("TVA", 465, y + 6, 7);
    right("TOTAL HT", W - M - 8, y + 6, 7);
    y += 31;
  };
  newPage();
  const emitter = [
    c.name,
    c.address,
    c.country,
    c.rcs && `R.C.S. Luxembourg ${c.rcs}`,
    c.permit && `Autorisation : ${c.permit}`,
    c.vatNumber && `TVA : ${c.vatNumber}`,
    c.contact,
    c.email,
    c.phone,
    c.website,
  ]
    .filter(Boolean)
    .join("\n");
  const client = [
    d.customer.name,
    d.customer.address,
    d.customer.country,
    d.customer.vatNumber && `TVA : ${d.customer.vatNumber}`,
    d.customer.email,
    d.customer.phone,
  ]
    .filter(Boolean)
    .join("\n");
  text("ÉMETTEUR", M, y, 8, muted);
  text("CLIENT", 315, y, 8, muted);
  y += 16;
  const emitterRows = wrap(emitter, font, 9, 240),
    clientRows = wrap(client, font, 9, W - M - 315);
  requireValue(
    Math.max(emitterRows.length, clientRows.length) * 12 < 420 &&
      y + Math.max(emitterRows.length, clientRows.length) * 12 + 16 <=
        H - BOTTOM,
    "Les coordonnées sont trop longues pour l’en-tête A4. Raccourcissez les champs du profil ou du client.",
  );
  y +=
    Math.max(block(emitter, M, y, 240), block(client, 315, y, W - M - 315)) +
    16;
  const formatDate = (value: string) => value.split("-").reverse().join("/");
  const refs = `Émission : ${formatDate(d.issueDate)}${d.dueDate ? `    ${d.type === "QUOTE" ? "Validité" : "Échéance"} : ${formatDate(d.dueDate)}` : ""}`;
  const refsHeight = wrap(refs, font, 9, W - 2 * M).length * 12;
  if (y + refsHeight + 16 > H - BOTTOM) newPage();
  y += block(refs, M, y, W - 2 * M) + 16;
  if (d.subject) {
    const subjectHeight = wrap(d.subject, font, 10, W - 2 * M).length * 13;
    if (y + subjectHeight + 12 > H - BOTTOM) newPage();
    y += block(d.subject, M, y, W - 2 * M, 10) + 12;
  }
  let needsTableHeader = true;
  for (let i = 0; i < d.lines.length; i++) {
    const l = d.lines[i];
    const maxRowHeight = H - BOTTOM - contentStart - 31;
    let size = 9;
    let rows = wrap(l.description, font, size, 235);
    // Keep a service row atomic. A physically oversized row receives a useful
    // validation error instead of silently clipping or splitting it.
    if (rows.length * 13 + 20 > maxRowHeight) {
      size = 7;
      rows = wrap(l.description, font, size, 235);
    }
    const quantityRows = wrap(`${l.quantity} ${l.unit}`, font, 7, 60);
    const height = Math.max(
      35,
      rows.length * (size + 4) + 20,
      quantityRows.length * 11 + 20,
    );
    requireValue(
      height <= maxRowHeight,
      "Une description dépasse une page A4. Répartissez cette prestation en plusieurs lignes.",
    );
    if (y + height + (needsTableHeader ? 31 : 0) > H - BOTTOM) {
      newPage();
      needsTableHeader = true;
    }
    if (needsTableHeader) {
      tableHeader();
      needsTableHeader = false;
    }
    rows.forEach((r, n) => text(r, M + 8, y + 8 + n * (size + 4), size));
    quantityRows.forEach((r, n) => right(r, 350, y + 9 + n * 11, 7, 60));
    right(l.unitPrice, 423, y + 9, 8, 65);
    right(`${l.vatRate} %`, 465, y + 9, 8, 34);
    right(t.items[i].net, W - M - 8, y + 9, 8, 70);
    y += height;
    rule(y);
  }
  const taxMention =
    d.vatMode === "EXEMPT"
      ? exemption
      : d.vatMode === "REVERSE"
        ? `Autoliquidation — ${d.reverseBasis}`
        : "";
  const taxRows = taxMention ? wrap(taxMention, font, 8, W - 2 * M) : [];
  const paymentFields = [
    ["CONDITIONS", c.paymentTerms],
    ["BÉNÉFICIAIRE", c.name],
    ["IBAN", c.iban],
    ["BIC", c.bic],
    ["BANQUE", c.bank],
    ["ADRESSE BANQUE", c.bankAddress ?? ""],
  ]
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => {
      const rows = wrap(value, font, 9, W - 2 * M - 132);
      return { label, rows, height: Math.max(14, rows.length * 12) + 8 };
    });
  const paymentHeight =
    48 + paymentFields.reduce((sum, field) => sum + field.height, 0);
  const totalsHeight = 94 + t.taxes.length * 18 + taxRows.length * 11;
  const pageCapacity = H - BOTTOM - contentStart;
  requireValue(
    totalsHeight <= pageCapacity,
    "Le bloc de ventilation TVA dépasse une page A4. Regroupez les taux applicables avant l’émission.",
  );
  // Keep totals and payment together when both fit on one page.
  const reserved =
    totalsHeight + paymentHeight + 14 <= pageCapacity
      ? totalsHeight + paymentHeight + 14
      : totalsHeight;
  if (y + 18 + reserved > H - BOTTOM) newPage();
  else y += 18;
  text("Total HT", M, y);
  right(`${t.net} ${d.currency}`, W - M, y);
  y += 22;
  for (const g of t.taxes) {
    text(`TVA ${g.rate} % (base ${g.net})`, M, y, 8, muted);
    right(`${g.vat} ${d.currency}`, W - M, y, 8);
    y += 18;
  }
  for (const row of taxRows) {
    text(row, M, y, 8, muted);
    y += 11;
  }
  rule(y + 5);
  y += 19;
  text("TOTAL TTC", M, y, 11, accent);
  right(`${t.gross} ${d.currency}`, W - M, y, 17);
  y += 39;

  let fieldIndex = 0;
  while (fieldIndex < paymentFields.length) {
    if (y + 48 + paymentFields[fieldIndex].height > H - BOTTOM) newPage();
    let height = 48,
      end = fieldIndex;
    while (
      end < paymentFields.length &&
      y + height + paymentFields[end].height <= H - BOTTOM
    ) {
      height += paymentFields[end].height;
      end++;
    }
    requireValue(
      end > fieldIndex,
      "Les informations de paiement sont trop longues pour une page A4.",
    );
    page.drawRectangle({
      x: M,
      y: H - y - height,
      width: W - 2 * M,
      height,
      color: rgb(0.985, 0.978, 0.965),
      borderColor: rgb(0.88, 0.85, 0.81),
      borderWidth: 0.6,
    });
    text(
      fieldIndex === 0 ? "PAIEMENT" : "PAIEMENT · SUITE",
      M + 16,
      y + 13,
      9,
      accent,
    );
    let rowY = y + 36;
    for (const field of paymentFields.slice(fieldIndex, end)) {
      text(field.label, M + 16, rowY + 1, 7, muted);
      field.rows.forEach((row, n) => text(row, M + 116, rowY + n * 12, 9));
      rowY += field.height;
    }
    y += height + 16;
    fieldIndex = end;
    if (fieldIndex < paymentFields.length) newPage();
  }
  if (d.notes) {
    for (const row of wrap(d.notes, font, 8, W - 2 * M)) {
      if (y + 13 > H - BOTTOM) newPage();
      text(row, M, y, 8, muted);
      y += 12;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    page = p;
    rule(H - 48);
    right(`${i + 1} / ${pages.length}`, W - M, H - 36, 8);
  });
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}
