import Decimal from "decimal.js";
Decimal.set({ precision: 40 });

export class BillingError extends Error {}
export type Party = {
  kind: "BUSINESS" | "PERSON";
  name: string;
  address: string;
  country: string;
  email: string;
  phone: string;
  vatNumber: string;
};
export type CompanyProfile = {
  name: string;
  legalForm: string;
  address: string;
  country: string;
  rcs: string;
  permit: string;
  vatStatus: "NORMAL" | "EXEMPT";
  vatNumber: string;
  contact: string;
  email: string;
  phone: string;
  website: string;
  iban: string;
  bic: string;
  bank: string;
  paymentTerms: string;
  logo: string;
  logoBlobUrl?: string;
};
export type Line = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: string;
};
export type Draft = {
  type: "INVOICE" | "QUOTE";
  brandId: string;
  companyId: string;
  customer: Party;
  issueDate: string;
  serviceDate: string;
  dueDate: string;
  currency: string;
  subject: string;
  reference: string;
  notes: string;
  vatMode: "NORMAL" | "EXEMPT" | "REVERSE";
  reverseBasis: string;
  reverseConfirmed: boolean;
  lines: Line[];
};
export type Snapshot = {
  version: 1;
  document: Draft;
  company: CompanyProfile;
  brand: { name: string; website: string };
  number: string;
  totals: ReturnType<typeof calculate>;
};
export const exemption =
  "TVA non applicable – Article 57bis de la loi modifiée du 12 février 1979";
export function requireValue(ok: unknown, message: string): asserts ok {
  if (!ok) throw new BillingError(message);
}
function object(v: unknown): Record<string, unknown> {
  requireValue(
    v && typeof v === "object" && !Array.isArray(v),
    "Données invalides.",
  );
  return v as Record<string, unknown>;
}
function str(v: unknown, max = 300): string {
  requireValue(
    typeof v === "string" &&
      v.length <= max &&
      !/[\u0000-\u0008\u000b-\u001f]/.test(v),
    "Texte invalide ou trop long.",
  );
  return v.trim();
}
function required(v: unknown, label: string, max = 300) {
  const s = str(v, max);
  requireValue(s, `${label} obligatoire.`);
  return s;
}
function date(v: unknown) {
  const s = str(v);
  const value = new Date(s);
  requireValue(
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
      Number.isFinite(value.getTime()) &&
      value.toISOString().slice(0, 10) === s,
    "Date invalide.",
  );
  return s;
}
function decimal(v: unknown, label: string, places: number, positive = false) {
  const s = str(v);
  requireValue(/^\d{1,10}(\.\d+)?$/.test(s), `${label} invalide.`);
  const n = new Decimal(s);
  requireValue(
    n.decimalPlaces() <= places && (!positive || n.gt(0)),
    `${label} invalide (précision ou valeur).`,
  );
  return n.toString();
}
export function parseParty(value: unknown): Party {
  const p = object(value);
  requireValue(
    p.kind === "BUSINESS" || p.kind === "PERSON",
    "Type de client invalide.",
  );
  const email = str(p.email);
  requireValue(
    !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    "Email invalide.",
  );
  return {
    kind: p.kind,
    name: required(p.name, "Nom"),
    address: required(p.address, "Adresse", 1200),
    country: required(p.country, "Pays"),
    email,
    phone: str(p.phone),
    vatNumber: str(p.vatNumber),
  };
}
export function parseCompany(value: unknown): CompanyProfile {
  const p = object(value);
  requireValue(
    p.vatStatus === "NORMAL" || p.vatStatus === "EXEMPT",
    "Statut TVA obligatoire.",
  );
  const profile = Object.fromEntries(
    [
      "name",
      "legalForm",
      "address",
      "country",
      "rcs",
      "permit",
      "vatNumber",
      "contact",
      "email",
      "phone",
      "website",
      "iban",
      "bic",
      "bank",
      "paymentTerms",
      "logo",
    ].map((k) => [
      k,
      str(
        k === "legalForm" ? (p[k] ?? "") : p[k],
        k === "logo" ? 3000000 : 1200,
      ),
    ]),
  ) as Omit<CompanyProfile, "vatStatus">;
  for (const k of ["name", "address", "country"] as const)
    requireValue(profile[k], `${k} obligatoire.`);
  requireValue(
    p.vatStatus !== "NORMAL" || profile.vatNumber,
    "Le régime normal exige un numéro TVA.",
  );
  requireValue(
    !profile.logo ||
      /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(profile.logo),
    "Logo PNG ou JPEG invalide.",
  );
  return {
    ...profile,
    logoBlobUrl:
      typeof p.logoBlobUrl === "string" ? str(p.logoBlobUrl, 1200) : "",
    vatStatus: p.vatStatus,
  };
}
export function parseDraft(value: unknown): Draft {
  const p = object(value);
  requireValue(
    p.type === "INVOICE" || p.type === "QUOTE",
    "Type de document invalide.",
  );
  requireValue(
    ["NORMAL", "EXEMPT", "REVERSE"].includes(String(p.vatMode)),
    "Régime TVA invalide.",
  );
  requireValue(
    Array.isArray(p.lines) && p.lines.length > 0,
    "Ajoutez une prestation.",
  );
  const lines = p.lines.map((value) => {
    const l = object(value);
    const vatRate = decimal(l.vatRate, "Taux TVA", 2);
    requireValue(new Decimal(vatRate).lte(100), "Taux TVA invalide.");
    requireValue(
      p.vatMode === "NORMAL" || new Decimal(vatRate).isZero(),
      "Aucune TVA ne peut être facturée sous ce régime.",
    );
    return {
      description: required(l.description, "Description", 20000),
      quantity: decimal(l.quantity, "Quantité", 4, true),
      unit: required(l.unit, "Unité", 30),
      unitPrice: decimal(l.unitPrice, "Prix", 4),
      vatRate,
    };
  });
  const currency = str(p.currency);
  requireValue(
    Intl.supportedValuesOf("currency").includes(currency) &&
      new Intl.NumberFormat("fr", {
        style: "currency",
        currency,
      }).resolvedOptions().maximumFractionDigits === 2,
    "Choisissez une devise ISO à deux décimales (EUR, USD, GBP, CHF…).",
  );
  const d: Draft = {
    type: p.type,
    brandId: required(p.brandId, "Marque"),
    companyId: required(p.companyId, "Société"),
    customer: parseParty(p.customer),
    issueDate: date(p.issueDate),
    serviceDate: date(p.serviceDate ?? p.issueDate),
    dueDate: date(p.dueDate),
    currency,
    subject: str(p.subject, 1200),
    reference: str(p.reference),
    notes: str(p.notes, 10000),
    vatMode: p.vatMode as Draft["vatMode"],
    reverseBasis: str(p.reverseBasis, 1200),
    reverseConfirmed: p.reverseConfirmed === true,
    lines,
  };
  requireValue(
    d.dueDate >= d.issueDate,
    "L’échéance doit suivre la date d’émission.",
  );
  requireValue(
    d.vatMode !== "NORMAL" ||
      !d.lines.some((l) => new Decimal(l.vatRate).isZero()) ||
      d.notes,
    "Indiquez dans les notes le fondement légal d’une prestation au taux zéro.",
  );
  if (d.vatMode === "REVERSE")
    requireValue(
      d.reverseConfirmed &&
        d.reverseBasis &&
        d.customer.kind === "BUSINESS" &&
        d.customer.vatNumber,
      "Autoliquidation : client assujetti, numéro TVA, fondement et confirmation d’applicabilité requis.",
    );
  return d;
}
export function validateTax(d: Draft, c: CompanyProfile) {
  requireValue(
    c.vatStatus === "EXEMPT" ? d.vatMode === "EXEMPT" : d.vatMode !== "EXEMPT",
    "Le régime du document doit correspondre au statut TVA de la société.",
  );
  requireValue(
    d.vatMode !== "EXEMPT" ||
      ["luxembourg", "lu"].includes(c.country.toLowerCase()),
    "La franchise luxembourgeoise exige une société établie au Luxembourg.",
  );
}
export function calculate(lines: Line[], mode: Draft["vatMode"]) {
  let net = new Decimal(0);
  const groups = new Map<string, { net: Decimal; vat: Decimal }>();
  const items = lines.map((l) => {
    const amount = new Decimal(l.quantity)
      .mul(l.unitPrice)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const rate = mode === "NORMAL" ? new Decimal(l.vatRate).toString() : "0";
    const vat = amount
      .mul(rate)
      .div(100)
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    net = net.plus(amount);
    const g = groups.get(rate) ?? { net: new Decimal(0), vat: new Decimal(0) };
    groups.set(rate, { net: g.net.plus(amount), vat: g.vat.plus(vat) });
    return { net: amount.toFixed(2), vat: vat.toFixed(2) };
  });
  const taxes = [...groups]
    .sort((a, b) => new Decimal(a[0]).cmp(b[0]))
    .map(([rate, g]) => ({
      rate,
      net: g.net.toFixed(2),
      vat: g.vat.toFixed(2),
    }));
  const vat = taxes.reduce((sum, g) => sum.plus(g.vat), new Decimal(0));
  return {
    items,
    taxes,
    net: net.toFixed(2),
    vat: vat.toFixed(2),
    gross: net.plus(vat).toFixed(2),
  };
}
export function canEdit(type: string, status: string) {
  return type === "QUOTE" || status === "DRAFT";
}
export function nextStatus(type: string, status: string, target: string) {
  const allowed =
    type === "INVOICE"
      ? status === "ISSUED" && target === "PAID"
      : status === "SENT" && ["ACCEPTED", "REFUSED"].includes(target);
  requireValue(allowed, "Transition de statut interdite.");
  return target;
}
export function conversionDraft(d: Draft): Draft {
  requireValue(d.type === "QUOTE", "Seul un devis peut être converti.");
  const today = new Date().toISOString().slice(0, 10);
  return {
    ...d,
    type: "INVOICE",
    issueDate: today,
    dueDate: d.dueDate < today ? today : d.dueDate,
  };
}
