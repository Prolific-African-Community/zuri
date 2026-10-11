/**
 * Public phone numbers on official company pages: found, classified by the
 * label next to them, validated per market, and formatted for display.
 * Nothing here guesses a number — every result was printed on a page.
 */

export type PhoneSource = "TEL_LINK" | "STRUCTURED_DATA" | "LABELLED_TEXT" | "PLAIN_TEXT" | "MAPS";

export type PhoneFinding = {
  /** Readable display form, e.g. "03 87 01 54 90" or "+352 26 87 34 67". */
  display: string;
  /** Comparable key: the last 9 national digits. */
  key: string;
  source: PhoneSource;
  kind: "PHONE" | "FAX";
};

const SPACES = /[     ]/g;

/** Labels that make the following number a phone, a fax, or not a phone at all. */
const PHONE_LABEL = /(t[ée]l[ée]?(?:phone)?|tel|phone|telefoon|telefon|tél|gsm|mobile?|portable|standard|centrale|contact|appelez|call|t\s*\.)\s*[.:\-–]{0,2}\s*$/i;
const FAX_LABEL = /(fax|t[ée]l[ée]copie|telefax)\s*[.:\-–]{0,2}\s*$/i;
const NOT_PHONE_LABEL = /(tva|vat|btw|siret|siren|rcs|rc\s|n[°o]\s*(?:d'?)?entreprise|ondernemingsnummer|matricule|iban|bic|capital|code\s*postal|postcode|licen[cs]e|agr[ée]ment|num[ée]ro\s*(?:de\s*)?(?:tva|registre))\s*[.:\-–#]?\s*[a-z]{0,3}\s*$/i;

/** Candidate number shapes: international with a market prefix, or national. */
const CANDIDATE = /(?:(?:\+|00)\s?(?:33|32|352|49)(?:[\s.\-/]*\(0\))?(?:[\s.\-/()]*\d){6,11})|(?:\b0\d(?:[\s.\-/]?\d){7,9}\b)|(?:\b[2-9]\d{1,2}(?:[\s.\-]\d{2,3}){2,3}\b)/g;

const DATE_LIKE = /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/;

/** Market rules for the national digits of a number. */
function validate(raw: string): { digits: string; country: "FR" | "BE" | "LU" | "DE" } | null {
  const trimmed = raw.trim();
  if (DATE_LIKE.test(trimmed)) return null;
  let digits = trimmed.replace(/\(0\)/g, "").replace(/\D/g, "");
  let prefix: string | null = null;
  if (/^(\+|00)/.test(trimmed)) {
    digits = digits.replace(/^00/, "");
    prefix = ["352", "33", "32", "49"].find((code) => digits.startsWith(code)) ?? null;
    if (!prefix) return null;
    digits = digits.slice(prefix.length).replace(/^0/, "");
  }
  if (prefix === "33") return digits.length === 9 && /^[1-9]/.test(digits) ? { digits: `0${digits}`, country: "FR" } : null;
  if (prefix === "32") return digits.length >= 8 && digits.length <= 9 ? { digits: `0${digits}`, country: "BE" } : null;
  if (prefix === "352") return digits.length >= 5 && digits.length <= 11 ? { digits, country: "LU" } : null;
  if (prefix === "49") return digits.length >= 6 && digits.length <= 11 ? { digits: `0${digits}`, country: "DE" } : null;
  // National formats.
  if (/^0[1-9]\d{8}$/.test(digits) && !/^04\d{8}$/.test(digits)) return { digits, country: "FR" };
  if (/^04\d{8}$/.test(digits)) return { digits, country: "BE" };
  if (/^0[1-9]\d{7}$/.test(digits)) return { digits, country: "BE" };
  // Luxembourg numbers carry no trunk prefix: 6 to 8 digits, fixed lines from 2, mobiles 6x1.
  if (/^([2-5]\d{5,7}|6[2-9]1\d{6})$/.test(digits)) return { digits, country: "LU" };
  return null;
}

function group(digits: string, sizes: number[]) {
  const parts: string[] = [];
  let at = 0;
  for (const size of sizes) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  if (at < digits.length) parts.push(digits.slice(at));
  return parts.join(" ");
}

function format(digits: string, country: "FR" | "BE" | "LU" | "DE", international: boolean) {
  if (country === "FR") return international ? `+33 ${group(digits.slice(1), [1, 2, 2, 2, 2])}` : group(digits, [2, 2, 2, 2, 2]);
  if (country === "BE") {
    const national = /^04\d{8}$/.test(digits) ? group(digits, [4, 2, 2, 2]) : digits.length === 9 && /^0[2349]/.test(digits) ? group(digits, [2, 3, 2, 2]) : group(digits, [3, 2, 2, 2]);
    return international ? `+32 ${national.slice(1)}` : national;
  }
  if (country === "LU") {
    const sizes = digits.length === 9 ? [3, 3, 3] : digits.length === 7 ? [3, 2, 2] : [2, 2, 2, 2];
    return `+352 ${group(digits, sizes)}`;
  }
  return international ? `+49 ${digits.slice(1)}` : digits;
}

/** A validated finding from one raw number, or null when it is not a phone number. */
export function parsePhone(raw: string, source: PhoneSource, kind: PhoneFinding["kind"] = "PHONE"): PhoneFinding | null {
  // "(+352)371717" and "(0032) 69…": a bracketed country prefix is still a prefix.
  const cleaned = raw.replace(SPACES, " ").trim().replace(/^\(\s*((?:\+|00)\d{2,3})\s*\)\s*/, "$1 ");
  const valid = validate(cleaned);
  if (!valid) return null;
  return {
    display: format(valid.digits, valid.country, /^(\+|00)/.test(cleaned)),
    key: valid.digits.replace(/^0/, "").slice(-9),
    source,
    kind,
  };
}

/** Comparable key for any stored phone string. */
export function phoneKey(phone: string | null | undefined) {
  if (!phone) return null;
  const parsed = parsePhone(phone, "PLAIN_TEXT");
  if (parsed) return parsed.key;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-9) : null;
}

/**
 * Every phone and fax number a page prints. The label just before a number
 * decides what it is; a number after "Fax" or "TVA" never becomes a phone.
 * Unlabelled numbers are kept as plain text, with the lowest weight.
 */
/** Site credits: the web agency, host or designer, whose numbers are not the company's. */
const CREDIT_CONTEXT = /(h[ée]berg|hosting|hosted by|r[ée]alis[ée]? par|r[ée]alisation|conception|con[çc]u par|webmaster|agence (?:web|digitale|de communication)|web ?agency|site (?:internet|web) (?:r[ée]alis|cr[ée])|d[ée]velopp[ée] par|design(?:ed)? by|ovh|o2switch|ionos|gandi|infomaniak|raison sociale et h[ée]bergeur)/i;
const EMAIL_OR_URL = /(?:[a-z0-9._%+-]+@([a-z0-9.-]+\.[a-z]{2,}))|(?:https?:\/\/(?:www\.)?([a-z0-9.-]+\.[a-z]{2,}))/gi;

/** True when the lines just before a number belong to another organisation. */
function thirdPartyBlock(lines: string, ownDomain: string | null) {
  if (CREDIT_CONTEXT.test(lines)) return true;
  if (!ownDomain) return false;
  const own = ownDomain.replace(/^www\./, "").split(".").slice(-2).join(".");
  for (const match of lines.matchAll(EMAIL_OR_URL)) {
    const host = (match[1] ?? match[2] ?? "").toLowerCase();
    if (host && !host.endsWith(own)) return true;
  }
  return false;
}

export function findPhones(html: string, text: string, ownDomain: string | null = null): PhoneFinding[] {
  const found: PhoneFinding[] = [];

  for (const match of html.matchAll(/href\s*=\s*["']tel:([^"'?]+)/gi)) {
    let value = match[1];
    try {
      value = decodeURIComponent(value);
    } catch {
      // A malformed escape is read as written.
    }
    const parsed = parsePhone(value, "TEL_LINK");
    if (parsed) found.push(parsed);
  }

  for (const match of html.matchAll(/"telephone"\s*:\s*"([^"]+)"/gi)) {
    const parsed = parsePhone(match[1], "STRUCTURED_DATA");
    if (parsed) found.push(parsed);
  }
  for (const match of html.matchAll(/"faxNumber"\s*:\s*"([^"]+)"/gi)) {
    const parsed = parsePhone(match[1], "STRUCTURED_DATA", "FAX");
    if (parsed) found.push(parsed);
  }

  const normalized = text.replace(SPACES, " ");
  for (const match of normalized.matchAll(CANDIDATE)) {
    const before = normalized.slice(Math.max(0, match.index! - 40), match.index!);
    // Only the text on the same line counts as the label.
    const label = before.split(/\n/).pop() ?? "";
    if (NOT_PHONE_LABEL.test(label)) continue;
    // The few lines above the number: an agency, a host or another domain means it is theirs.
    const block = normalized.slice(Math.max(0, match.index! - 400), match.index!).split(/\n/).slice(-5).join("\n");
    const fax = FAX_LABEL.test(label);
    // A fax is always recorded, so the same number can never pass as a phone elsewhere.
    if (!fax && thirdPartyBlock(block, ownDomain)) continue;
    const labelled = PHONE_LABEL.test(label);
    // Bare Luxembourg-shaped digit groups are too ambiguous without a label.
    if (!labelled && !fax && !/^(\+|00|0)/.test(match[0].trim())) continue;
    const parsed = parsePhone(match[0], labelled ? "LABELLED_TEXT" : "PLAIN_TEXT", fax ? "FAX" : "PHONE");
    if (parsed) found.push(parsed);
  }
  return found;
}

const SOURCE_WEIGHT: Record<PhoneSource, number> = {
  TEL_LINK: 5,
  STRUCTURED_DATA: 4,
  LABELLED_TEXT: 4,
  PLAIN_TEXT: 1,
  MAPS: 0,
};

/**
 * The company switchboard across the pages read: the number with the most
 * weight (tel: links and labels over bare text, contact pages count double),
 * never a number any page labels as a fax, never a named person's line.
 */
export function pickCompanyPhone(
  pages: { url: string; findings: PhoneFinding[]; isContactPage: boolean }[],
  exclude: string[] = [],
): { display: string; source: PhoneSource; url: string } | null {
  const excluded = new Set(exclude.map(phoneKey).filter(Boolean));
  const faxes = new Set(pages.flatMap((page) => page.findings.filter((f) => f.kind === "FAX").map((f) => f.key)));
  const votes = new Map<string, { finding: PhoneFinding; url: string; weight: number; best: number }>();
  for (const page of pages) {
    for (const finding of page.findings) {
      if (finding.kind === "FAX" || faxes.has(finding.key) || excluded.has(finding.key)) continue;
      const weight = SOURCE_WEIGHT[finding.source] * (page.isContactPage ? 2 : 1);
      const entry = votes.get(finding.key);
      if (!entry) {
        votes.set(finding.key, { finding, url: page.url, weight, best: weight });
      } else {
        entry.weight += weight;
        if (weight > entry.best) Object.assign(entry, { finding, url: page.url, best: weight });
      }
    }
  }
  const best = [...votes.values()].sort((a, b) => b.weight - a.weight)[0];
  return best ? { display: best.finding.display, source: best.finding.source, url: best.url } : null;
}
