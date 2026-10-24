import { company, draft } from "./fixtures";
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseDraft,
  parseCompany,
  calculate,
  validateTax,
  canEdit,
  nextStatus,
  conversionDraft,
} from "../../lib/billing/domain";
test("Decimal: centimes, arrondi commercial et ventilation multi-taux", () => {
  const t = calculate(
    [
      {
        description: "a",
        quantity: "3",
        unit: "u",
        unitPrice: "0.10",
        vatRate: "17",
      },
      {
        description: "b",
        quantity: "1",
        unit: "u",
        unitPrice: "0.335",
        vatRate: "3",
      },
    ],
    "NORMAL",
  );
  assert.equal(t.net, "0.64");
  assert.equal(t.vat, "0.06");
  assert.equal(t.gross, "0.70");
  assert.deepEqual(t.taxes, [
    { rate: "3", net: "0.34", vat: "0.01" },
    { rate: "17", net: "0.30", vat: "0.05" },
  ]);
});
test("franchise explicite et absence TVA ne suffisent pas", () => {
  assert.throws(() => parseCompany({ ...company, vatNumber: "" }));
  assert.throws(() => validateTax(draft, { ...company, vatStatus: "EXEMPT" }));
  assert.throws(() => parseDraft({ ...draft, vatMode: "EXEMPT" }));
  const exempt = parseDraft({
    ...draft,
    vatMode: "EXEMPT",
    lines: draft.lines.map((l) => ({ ...l, vatRate: "0" })),
  });
  validateTax(exempt, { ...company, vatStatus: "EXEMPT" });
  assert.equal(calculate(exempt.lines, exempt.vatMode).vat, "0.00");
});
test("autoliquidation exige décision explicite et justification", () => {
  const d = {
    ...draft,
    vatMode: "REVERSE",
    lines: draft.lines.map((l) => ({ ...l, vatRate: "0" })),
  };
  assert.throws(() => parseDraft(d));
  assert.throws(() =>
    parseDraft({
      ...d,
      reverseConfirmed: true,
      reverseBasis: "Prestation B2B",
      customer: { ...draft.customer, kind: "PERSON" },
    }),
  );
  assert.equal(
    parseDraft({
      ...d,
      reverseConfirmed: true,
      reverseBasis: "Prestation B2B transfrontalière vérifiée",
    }).vatMode,
    "REVERSE",
  );
});
test("validations et verrouillage des factures", () => {
  for (const patch of [
    { issueDate: "2026-02-30" },
    { dueDate: "2026-01-01" },
    { currency: "euro" },
    { lines: [] },
    { lines: [{ ...draft.lines[0], quantity: "-1" }] },
    { lines: [{ ...draft.lines[0], unitPrice: "NaN" }] },
  ])
    assert.throws(() => parseDraft({ ...draft, ...patch }));
  assert.equal(canEdit("INVOICE", "ISSUED"), false);
  assert.equal(canEdit("INVOICE", "PAID"), false);
  assert.equal(canEdit("QUOTE", "ACCEPTED"), true);
  assert.equal(nextStatus("INVOICE", "ISSUED", "PAID"), "PAID");
  assert.throws(() => nextStatus("INVOICE", "PAID", "DRAFT"));
  assert.throws(() => nextStatus("QUOTE", "DRAFT", "ACCEPTED"));
});
test("conversion conserve client et lignes et crée une facture brouillon", () => {
  const quote = { ...draft, type: "QUOTE" as const };
  const invoice = conversionDraft(quote);
  assert.equal(invoice.type, "INVOICE");
  assert.deepEqual(invoice.lines, quote.lines);
  assert.deepEqual(invoice.customer, quote.customer);
  assert.throws(() => conversionDraft(draft));
});
