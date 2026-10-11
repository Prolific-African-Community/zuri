/**
 * Prospect research: public companies, public pages, verifiable statements.
 *
 * Pipeline (cheap stages first, expensive ones only on a shortlist):
 *   1. plan      — one small model call turns the campaign into localized queries
 *   2. discover  — DataForSEO organic results → company domains
 *   3. dedupe    — against this run and existing prospects (domain, name+country)
 *   4. prefilter — fetch each homepage, keep the ones that are relevant
 *   5. research  — fetch a few pages of the company's own site
 *   6. synthesize — one structured model call per shortlisted company
 *   7. verify    — the server keeps only what the fetched pages actually say
 *   8. score     — the same fit arithmetic as Prospect Intelligence
 *
 * The model never gets the last word on a fact: an excerpt it cannot find in a
 * page Zuri fetched does not become a FACT, a name it cannot find does not
 * become a contact, and an absence never becomes a negative fact.
 */

import { fetchMaps, fetchSerp } from "@/lib/dataforseo";
import { callOpenAi } from "@/lib/openai";
import { FRENCH_OUTPUT_RULE } from "@/lib/sales-intelligence";
import { applyGeographyCheck, checkGeography, searchAreas, type SearchArea } from "@/lib/geography";
import { isGenericEmail } from "@/lib/contactability";
import { findPhones, parsePhone, phoneKey, pickCompanyPhone, type PhoneFinding, type PhoneSource } from "@/lib/phone";
import {
  FIT_FACTORS_SCHEMA,
  SCORING_RULE,
  computeConfidence,
  scoreFitFactors,
  scoringRubric,
  type FitFactor,
  type IntelligenceInput,
} from "@/lib/sales-intelligence";

const USER_AGENT = "ZuriBot/1.0 (+https://zuri.app; public company research)";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_PAGE_CHARS = 7_000;
const MAX_EXTRA_PAGES = 5;
const MAPS_DEPTH = 60;
/** Member detail pages followed per listing page, to find each member's website. */
const MAX_DETAIL_PAGES = 60;

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/** "https://www.Transports-Bail.lu/fr/" → "transports-bail.lu" */
export function normalizeDomain(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\d?\./, "") || null;
  } catch {
    return null;
  }
}

const LEGAL_SUFFIXES =
  /\b(s\.?a\.?r\.?l\.?|s\.?a\.?s\.?u?|s\.?a\.?|s\.?c\.?s\.?|s\.?e\.?c\.?s\.?|gmbh|ag|kg|bv|b\.?v\.?|nv|n\.?v\.?|srl|sprl|ltd|limited|llc|inc|plc|sàrl|sarl|eurl|sas|sa|sc|scs)\b\.?/gi;

/** "Transports Bail S.à r.l." and "TRANSPORTS BAIL" are the same company. */
export function normalizeName(raw: string | null | undefined) {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/s\.?\s?a\.?\s?r\.?\s?l\.?/g, " ")
    .replace(LEGAL_SUFFIXES, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function identityKey(name: string | null | undefined, country: string | null | undefined) {
  const n = normalizeName(name);
  return n ? `${n}|${(country ?? "").trim().toLowerCase()}` : null;
}

/**
 * Directories, social networks, job boards, marketplaces and media: useful to
 * a human, never a company's own site, so never a candidate.
 */
const NOT_A_COMPANY =
  /(^|\.)(linkedin|facebook|instagram|twitter|x|youtube|tiktok|wikipedia|wikidata|google|bing|yahoo|apple|amazon|indeed|monster|stepstone|jobs|glassdoor|jooble|jobat|vdab|forem|actiris|adem|pole-emploi|francetravail|hellowork|adecco|randstad|tempo-team|startpeople|sofitex|manpower|synergie|proman|accentjobs|daoust|interim|jobteaser|welcometothejungle|ringtwice|zipmend|chronotruck|kompass|europages|pagesjaunes|pagesdor|goldenpages|editus|yellow|yelp|trustpilot|societe|infogreffe|pappers|verif|manageo|northdata|opencorporates|dnb|zoominfo|crunchbase|rocketreach|apollo|lusha|annuaire|annuaires|companyhouse|lbr|rcsl|gouvernement|public|guichet|transport-online|timocom|trans|cargopedia|freightquote|uber|blablacar|flixbus|reddit|quora|medium|lesechos|lequotidien|wort|paperjam|rtl|lessentiel|lalibre|lesoir|estrepublicain|republicain-lorrain|ouest-france|lefigaro|lemonde|francebleu|actu|mappy|viamichelin|waze|tripadvisor|booking|expedia)\./i;

function isCompanyDomain(domain: string) {
  if (!domain || !domain.includes(".")) return false;
  if (NOT_A_COMPANY.test(`${domain}.`)) return false;
  // Government and education sites are sources, not prospects.
  if (/(^|\.)(gov|gouv|fgov|edu|europa|public\.lu|wallonie\.be|vlaanderen\.be|brussels|bruxelles)(\.|$)/i.test(domain)) return false;
  // Directories and rankings describe many companies; none of them is one.
  if (/(annuaire|directory|gids|guide|top-?\d+|classement|ranking|listing)/i.test(domain)) return false;
  return true;
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

export type FetchedPage = {
  url: string;
  title: string | null;
  text: string;
  links: string[];
  /** Phone and fax numbers the page prints, classified by their label. */
  phoneFindings: PhoneFinding[];
  /** Phone numbers only (display form), for quick checks. */
  phones: string[];
  emails: string[];
};

const EMAIL_IN_TEXT = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;

/** Channels printed on the page — read, never guessed. */
function pageChannels(html: string, text: string, domain: string | null) {
  const phoneFindings = findPhones(html, text, domain);
  const emails = new Set<string>();
  for (const match of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)/gi)) {
    let value = match[1];
    try {
      value = decodeURIComponent(value);
    } catch {
      // Read as written.
    }
    value = value.trim().toLowerCase();
    if (/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(value)) emails.add(value);
  }
  for (const match of text.matchAll(EMAIL_IN_TEXT)) {
    if (!/\.(png|jpe?g|gif|svg|webp)$/i.test(match[0])) emails.add(match[0].toLowerCase());
  }
  return {
    phoneFindings,
    phones: [...new Set(phoneFindings.filter((finding) => finding.kind === "PHONE").map((finding) => finding.display))],
    emails: [...emails],
  };
}

export type CompanyChannelsFound = {
  companyPhone: string | null;
  companyPhoneSource: PhoneSource | null;
  companyPhoneSourceUrl: string | null;
  companyEmail: string | null;
  contactPageUrl: string | null;
};

const CONTACT_PATH = /(contact|kontakt|nous-contacter|contactez)/i;
const LEGAL_PATH = /(mentions-legales|mentions_legales|legal|impressum|imprint|colofon|disclaimer)/i;

/**
 * The company switchboard and generic inbox, from the official pages read.
 * Phone: tel: links, structured data and labelled numbers outweigh bare text;
 * a contact page counts double; a fax is never a switchboard; a named
 * person's own line is never promoted to company level. Email: a generic
 * address (info@, contact@…) on the company's own domain.
 */
export function companyChannels(pages: FetchedPage[], domain: string, personal: string[] = []): CompanyChannelsFound {
  const phone = pickCompanyPhone(
    pages.map((page) => ({
      url: page.url,
      findings: page.phoneFindings,
      isContactPage: CONTACT_PATH.test(new URL(page.url).pathname),
    })),
    personal.filter((value) => !value.includes("@")),
  );
  const emailVotes = new Map<string, number>();
  for (const page of pages) {
    const weight = CONTACT_PATH.test(new URL(page.url).pathname) ? 2 : 1;
    for (const email of page.emails) {
      if (personal.includes(email)) continue;
      emailVotes.set(email, (emailVotes.get(email) ?? 0) + weight);
    }
  }
  const bare = domain.replace(/^www\./, "");
  const emails = [...emailVotes.entries()].sort((a, b) => b[1] - a[1]).map(([email]) => email);
  const generic = emails.filter(isGenericEmail);
  const onDomain = (email: string) => {
    const host = email.split("@")[1] ?? "";
    return host === bare || host.endsWith(`.${bare}`);
  };
  const companyEmail = generic.find(onDomain) ?? (generic.length === 1 ? generic[0] : null);
  const contactPage = pages.find((page) => CONTACT_PATH.test(new URL(page.url).pathname));
  return {
    companyPhone: phone?.display ?? null,
    companyPhoneSource: phone?.source ?? null,
    companyPhoneSourceUrl: phone?.url ?? null,
    companyEmail,
    contactPageUrl: contactPage?.url ?? null,
  };
}

/** The official website stays the preferred source; a Maps listing phone fills only a gap. */
export function withMapsFallback(found: CompanyChannelsFound, mapsPhone: string | null): CompanyChannelsFound {
  if (found.companyPhone || !mapsPhone) return found;
  const parsed = parsePhone(mapsPhone, "MAPS");
  return parsed ? { ...found, companyPhone: parsed.display, companyPhoneSource: "MAPS", companyPhoneSourceUrl: null } : found;
}

/** Contact paths tried directly when a site does not link one — a short list, never a crawl. */
const CONTACT_FALLBACKS = ["/contact", "/contacts", "/contact-us", "/nous-contacter", "/contactez-nous"];

/** The site's contact page, linked or at a conventional path; null when there is none. */
export async function findContactPage(home: FetchedPage, alreadyRead: string[]) {
  if (alreadyRead.some((url) => CONTACT_PATH.test(new URL(url).pathname))) return null;
  const linked = home.links.find((link) => CONTACT_PATH.test(new URL(link).pathname));
  const origin = new URL(home.url).origin;
  for (const url of linked ? [linked] : CONTACT_FALLBACKS.map((path) => `${origin}${path}`)) {
    const page = await fetchPage(url);
    if (page && CONTACT_PATH.test(new URL(page.url).pathname)) return page;
  }
  return null;
}

/**
 * The pages where a company prints its phone: the contact page, and when
 * that still shows no number, the legal notice the site links to.
 */
export async function contactRelevantPages(home: FetchedPage, alreadyRead: FetchedPage[] = []) {
  const read = [home, ...alreadyRead.filter((page) => page.url !== home.url)];
  const contact = await findContactPage(home, read.map((page) => page.url)).catch(() => null);
  if (contact) read.push(contact);
  const hasPhone = read.some((page) => page.phoneFindings.some((finding) => finding.kind === "PHONE"));
  if (!hasPhone && !read.some((page) => LEGAL_PATH.test(new URL(page.url).pathname))) {
    const legal = home.links.find((link) => LEGAL_PATH.test(new URL(link).pathname));
    const page = legal ? await fetchPage(legal).catch(() => null) : null;
    if (page) read.push(page);
  }
  return read.slice(1 + alreadyRead.filter((page) => page.url !== home.url).length);
}

/**
 * Named HTML entities, as they appear on European company sites. Without them
 * "Basée" stays "Bas&eacute;e" in the page text and a faithful quote can never
 * be verified — which would silently turn true facts into inferences.
 */
const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„",
  laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·", deg: "°",
  euro: "€", pound: "£", copy: "©", reg: "®", trade: "™", sect: "§", para: "¶",
  times: "×", divide: "÷", shy: "", zwnj: "", zwj: "", thinsp: " ", ensp: " ", emsp: " ",
  iexcl: "¡", iquest: "¿", ordm: "º", ordf: "ª", sup2: "²", sup3: "³", frac12: "½",
  szlig: "ß", oelig: "œ", OElig: "Œ", aelig: "æ", AElig: "Æ",
  yuml: "ÿ", Yuml: "Ÿ", eth: "ð", ETH: "Ð", thorn: "þ", THORN: "Þ",
};
const ACCENTS: [string, string][] = [
  ["grave", "̀"], ["acute", "́"], ["circ", "̂"], ["tilde", "̃"],
  ["uml", "̈"], ["ring", "̊"], ["cedil", "̧"], ["caron", "̌"],
];

function decode(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (match, name: string) => {
      if (name in ENTITIES) return ENTITIES[name];
      // &eacute; &Egrave; &ccedil; &atilde; … : letter + accent, composed.
      for (const [suffix, mark] of ACCENTS) {
        if (name.length === suffix.length + 1 && name.endsWith(suffix)) {
          return `${name[0]}${mark}`.normalize("NFC");
        }
      }
      if (name === "oslash") return "ø";
      if (name === "Oslash") return "Ø";
      return match;
    });
}

/** Visible text only: no scripts, styles, navigation markup or tags. */
function visibleText(html: string) {
  return decode(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      // mailto/tel links keep their target visible so it can be verified.
      .replace(/<a\b[^>]*href\s*=\s*["'](mailto:|tel:)([^"'?]+)[^"']*["'][^>]*>/gi, " $2 ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function sameSiteLinks(html: string, base: string, domain: string) {
  const links = new Set<string>();
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], base);
      if (!/^https?:$/.test(url.protocol)) continue;
      if (normalizeDomain(url.hostname) !== domain) continue;
      if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?)$/i.test(url.pathname)) continue;
      url.hash = "";
      url.search = "";
      links.add(url.toString());
    } catch {
      // Malformed hrefs are simply not followed.
    }
  }
  return [...links];
}

type PageFetch = { page: FetchedPage | null; refused: boolean };

async function fetchOnce(url: string): Promise<PageFetch> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
      signal: controller.signal,
    });
    // A challenge page or a refusal is respected, never worked around.
    if (!response.ok) return { page: null, refused: true };
    if (!(response.headers.get("content-type") ?? "").includes("text/html")) return { page: null, refused: true };
    // Decoded in the page's own charset: a Latin-1 "Tél." must stay readable as a label.
    const bytes = await response.arrayBuffer();
    const head = new TextDecoder("latin1").decode(bytes.slice(0, 4096));
    const charset =
      (response.headers.get("content-type") ?? "").match(/charset=([\w-]+)/i)?.[1] ??
      head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
      "utf-8";
    let html: string;
    try {
      html = new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      html = new TextDecoder("utf-8").decode(bytes);
    }
    const finalUrl = response.url || url;
    const domain = normalizeDomain(finalUrl) ?? "";
    const text = visibleText(html);
    return {
      refused: false,
      page: {
        url: finalUrl,
        title: decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim() || null,
        text: text.slice(0, MAX_PAGE_CHARS),
        links: sameSiteLinks(html, finalUrl, domain),
        ...pageChannels(html, text, domain),
      },
    };
  } catch {
    // Timeouts and connection errors, not refusals.
    return { page: null, refused: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPage(url: string): Promise<FetchedPage | null> {
  const first = await fetchOnce(url);
  if (first.page || first.refused) return first.page;

  // A slow apex redirect or a host that only answers on www or plain http is
  // not unreachable: try the same site's other address once. A site that
  // answered with a refusal is never retried.
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const variants = [`https://www.${host}${parsed.pathname}`, `http://${parsed.hostname}${parsed.pathname}`].filter(
      (variant) => variant.replace(/\/$/, "") !== url.replace(/\/$/, ""),
    );
    for (const variant of variants) {
      const retry = await fetchOnce(variant);
      if (retry.page || retry.refused) return retry.page;
    }
  } catch {
    // An unparsable URL has no variants.
  }
  return null;
}

/** Pages worth reading for company facts and named people, best first. */
const PAGE_HINTS: [RegExp, number][] = [
  [/(equipe|team|management|direction|dirigeant|organigram|about-us\/team|notre-equipe|leadership)/i, 10],
  [/(contact|kontakt|nous-contacter)/i, 9],
  [/(qui-sommes|about|a-propos|apropos|entreprise|societe|company|histoire|history|ueber-uns|uber-uns|presentation)/i, 8],
  [/(flotte|fleet|parc|materiel|equipment|vehicule|vehicle|camion)/i, 7],
  [/(mentions-legales|legal|impressum|imprint|cgv)/i, 6],
  [/(services|metiers|activites|activities|solutions|prestations|logistique|transport)/i, 5],
  [/(suivi|tracking|track|portail|portal|espace-client|client-login|extranet)/i, 5],
  [/(implantation|sites|agences|locations|depots)/i, 4],
];

function pickPages(links: string[], home: string) {
  return links
    .filter((link) => link.replace(/\/$/, "") !== home.replace(/\/$/, ""))
    .map((link) => {
      const path = new URL(link).pathname;
      const score = PAGE_HINTS.reduce(
        (best, [pattern, weight]) => (pattern.test(path) ? Math.max(best, weight) : best),
        0,
      );
      // Shallow pages are the canonical ones; deep blog posts are not.
      return { link, score: score - path.split("/").filter(Boolean).length * 0.5 };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_EXTRA_PAGES)
    .map((entry) => entry.link);
}

/** Whitespace-, case- and accent-insensitive, so a faithful excerpt matches. */
function squash(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the excerpt (or a substantial leading part of it) is on the page. */
function excerptOnPage(excerpt: string, page: FetchedPage | undefined) {
  if (!page) return false;
  const needle = squash(excerpt).replace(/^["'.…\s]+|["'.…\s]+$/g, "");
  if (needle.length < 8) return false;
  const haystack = squash(page.text);
  if (haystack.includes(needle)) return true;
  // Models trim or re-punctuate long quotes: accept a faithful 60-char prefix.
  return needle.length > 60 && haystack.includes(needle.slice(0, 60));
}

/* -------------------------------------------------------------------------- */
/* Stage 1–4: plan, discover, dedupe, prefilter                                */
/* -------------------------------------------------------------------------- */

export type CampaignForResearch = IntelligenceInput["campaign"] & { brandName: string };

export const STRATEGIES = ["GENERIC", "REGIONAL", "DIRECTORY", "SIGNAL", "RELATED"] as const;
export type Strategy = (typeof STRATEGIES)[number];

export const STRATEGY_LABELS: Record<Strategy, string> = {
  GENERIC: "Generic",
  REGIONAL: "Regional",
  DIRECTORY: "Directory",
  SIGNAL: "Operational signals",
  RELATED: "Related",
};

export type PlannedQuery = {
  query: string;
  strategy: Strategy;
  location: string;
  language: string;
  geography: string;
  intent: string;
  expectedSignal: string;
  /** Where the query runs. */
  channels: QueryChannel[];
  /** COVERAGE: derived from the geography, always run. PLANNER: added by the model. */
  source: "COVERAGE" | "PLANNER";
};

export type QueryChannel = "ORGANIC" | "MAPS";

export type QueryPlan = {
  queries: PlannedQuery[];
  relevanceKeywords: string[];
  /** Places and areas whose mention on a homepage suggests the right territory. */
  geographyTerms: string[];
};

const PLAN_PROMPT = [
  "You plan web searches that discover real operating companies for a B2B sales campaign. Discovery only: nothing you plan becomes a fact.",
  "",
  "Every area in coveredAreas is ALREADY searched on Google Maps with a basic operator query, and each geography entry once on the web: coveredQueries lists them. You ADD strategy on top; never repeat those areas with the same kind of query.",
  "Return 6 to 8 queries spread across these strategies:",
  "- GENERIC (1-2): sector noun + company intent + market, e.g. 'société de transport routier Luxembourg'.",
  "- REGIONAL (0-2): only towns, arrondissements or industrial zones NOT already in coveredAreas, e.g. 'transporteur Bastogne'. These also run on Google Maps: operator noun + place, nothing else.",
  "- DIRECTORY (2-3): pages that LIST companies: professional associations and federations of the sector with a members page, carrier directories, regional business associations, e.g. 'membres association transporteurs Luxembourg', 'membres fédération transport Wallonie'. These pages are only used to find company names and websites.",
  "- SIGNAL (2-3): operational signals of fit rather than the sector word: fleet, trailers, dispatch, warehousing + transport, multiple sites, international road freight, specialised or exceptional transport, e.g. 'transport exceptionnel Belgique', 'transport frigorifique Luxembourg'. Keep them short and category-like: they also run on Google Maps.",
  "- RELATED (0-2): companies similar to or near the knownCompanies given (same town, same industrial zone, regional competitors), e.g. 'transporteur zone industrielle Bettembourg'. Never put a known company's own name in a query. Return none if knownCompanies is empty.",
  "",
  "Queries are SHORT (2 to 6 words) and phrased the way a buyer looks for a supplier, never a job seeker. Never stack many keywords. Write each query in the language companies in that market use.",
  "Each query has: strategy; location (a DataForSEO country name in English: 'Luxembourg', 'Belgium', 'France', 'Germany'); language ('French', 'German', 'Dutch', 'English'); geography (the campaign area it targets); intent (what kind of company it should surface); expectedSignal (what should make a result relevant).",
  "relevanceKeywords: 10 to 18 short lowercase stems, in every relevant language, that a matching company's homepage would contain (e.g. 'transport', 'logisti', 'camion', 'vrachtwagen').",
  "geographyTerms: 10 to 30 lowercase place names (countries, regions, provinces, main towns, industrial zones) of the campaign geography and its immediate surroundings, as they would appear on a company homepage.",
].join("\n");

const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["queries", "relevanceKeywords", "geographyTerms"],
  properties: {
    queries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["query", "strategy", "location", "language", "geography", "intent", "expectedSignal"],
        properties: {
          query: { type: "string" },
          strategy: { type: "string", enum: [...STRATEGIES] },
          location: { type: "string" },
          language: { type: "string" },
          geography: { type: "string" },
          intent: { type: "string" },
          expectedSignal: { type: "string" },
        },
      },
    },
    relevanceKeywords: { type: "array", items: { type: "string" } },
    geographyTerms: { type: "array", items: { type: "string" } },
  },
} as const;

/** Operator and logistics nouns per language, for sectors this table knows. */
const SECTOR_TERMS: { match: RegExp; terms: Record<SearchArea["language"], { operator: string; logistics: string }> }[] = [
  {
    match: /(transport|logisti|freight|haulage|fret|vervoer|spedition|trucking)/i,
    terms: {
      French: { operator: "transporteur", logistics: "transport logistique" },
      Dutch: { operator: "transportbedrijf", logistics: "transport logistiek" },
      German: { operator: "Spedition", logistics: "Transport Logistik" },
      English: { operator: "haulage company", logistics: "transport logistics" },
    },
  },
];

/** Deterministic Maps searches never run above this, so the cost stays bounded. */
const MAX_COVERAGE_QUERIES = 26;
/** Planner queries added on top of coverage. */
const MAX_PLANNER_QUERIES = 8;
/** Every search task (one query on one channel) of a run, all sources together. */
export const MAX_SEARCH_TASKS = 36;

/**
 * The coverage set: for every search area of the geography, one Maps
 * local-business query (operator noun + area) — where small local operators
 * are listed with website and phone. The web is searched once per geography
 * entry (country or major region), not per area. Built without a model, so
 * every run searches every area whatever the planner decides.
 */
export function coverageQueries(geography: string[], industries: string[]): { areas: SearchArea[]; queries: PlannedQuery[] } {
  const areas = searchAreas(geography);
  const sector = SECTOR_TERMS.find((entry) => industries.some((industry) => entry.match.test(industry)));
  const queries: PlannedQuery[] = [];
  const industry = industries[0] ?? "";
  for (const area of areas) {
    const terms = sector?.terms[area.language];
    const base = {
      strategy: "REGIONAL" as Strategy,
      location: area.country,
      language: area.language,
      geography: area.from,
      source: "COVERAGE" as const,
    };
    queries.push({
      ...base,
      query: `${terms?.operator ?? industry} ${area.name}`.trim(),
      intent: "Local operators listed on Google Maps",
      expectedSignal: "Operator business category and a website",
      channels: ["MAPS"],
    });
  }
  const web: PlannedQuery[] = [];
  for (const entry of [...new Set(areas.map((area) => area.from))]) {
    const area = areas.find((candidate) => candidate.from === entry)!;
    const terms = sector?.terms[area.language];
    web.push({
      strategy: "GENERIC",
      location: area.country,
      language: area.language,
      geography: entry,
      source: "COVERAGE",
      query: `${terms?.logistics ?? `${industry} entreprise`} ${entry}`.trim(),
      intent: "Operators ranking organically in the market",
      expectedSignal: "Operator homepage in the market",
      channels: ["ORGANIC"],
    });
  }
  return { areas, queries: [...queries.slice(0, MAX_COVERAGE_QUERIES), ...web] };
}

const queryKey = (query: PlannedQuery, channel: QueryChannel) =>
  `${squash(query.query)}|${squash(query.location)}|${channel}`;

/**
 * Coverage first, then planner queries; a channel already run for the same
 * normalized query is dropped. Then the task budget: planner queries lose
 * their Maps channel first, then the last planner queries are dropped.
 * Coverage is never cut.
 */
export function mergeQueries(coverage: PlannedQuery[], planned: PlannedQuery[]): PlannedQuery[] {
  const seen = new Set<string>();
  const merged: PlannedQuery[] = [];
  for (const query of [...coverage, ...planned]) {
    const channels = query.channels.filter((channel) => !seen.has(queryKey(query, channel)));
    if (!channels.length) continue;
    channels.forEach((channel) => seen.add(queryKey(query, channel)));
    merged.push({ ...query, channels });
  }
  const tasks = () => merged.reduce((sum, query) => sum + query.channels.length, 0);
  for (let i = merged.length - 1; i >= 0 && tasks() > MAX_SEARCH_TASKS; i--) {
    const query = merged[i];
    if (query.source === "PLANNER" && query.channels.length > 1) merged[i] = { ...query, channels: ["ORGANIC"] };
  }
  while (tasks() > MAX_SEARCH_TASKS) {
    const last = merged.map((query) => query.source).lastIndexOf("PLANNER");
    if (last < 0) break;
    merged.splice(last, 1);
  }
  return merged;
}

export async function planQueries(
  campaign: CampaignForResearch,
  overrides: { geography: string | null; industry: string | null },
  knownCompanies: { name: string; city: string | null; country: string | null }[],
): Promise<QueryPlan & { areas: SearchArea[] }> {
  const geography = overrides.geography ? [overrides.geography] : campaign.geography;
  const industries = overrides.industry ? [overrides.industry] : campaign.industries;
  const coverage = coverageQueries(geography, industries);
  const raw = (await callOpenAi(
    PLAN_PROMPT,
    {
      offer: campaign.offer,
      industries,
      geography,
      coveredAreas: coverage.areas.map((area) => `${area.name} (${area.country})`),
      coveredQueries: coverage.queries.map((query) => query.query),
      targetCompanySize: campaign.targetCompanySize,
      idealCustomerProfile: campaign.idealCustomerProfile,
      preferredProfile: campaign.preferredProfile,
      exclusions: campaign.exclusions,
      knownCompanies: knownCompanies.slice(0, 8),
    },
    "research_query_plan",
    PLAN_SCHEMA,
  )) as { queries?: unknown; relevanceKeywords?: unknown; geographyTerms?: unknown };

  const text = (value: unknown) => String(value ?? "").trim();
  const queries = (Array.isArray(raw.queries) ? raw.queries : [])
    .map((entry) => entry as Record<string, unknown>)
    .map((entry) => ({
      query: text(entry.query),
      strategy: ((STRATEGIES as readonly string[]).includes(text(entry.strategy)) ? text(entry.strategy) : "GENERIC") as Strategy,
      location: text(entry.location),
      language: text(entry.language),
      geography: text(entry.geography),
      intent: text(entry.intent),
      expectedSignal: text(entry.expectedSignal),
      source: "PLANNER" as const,
    }))
    // No keyword stuffing: an over-long query is dropped, not trimmed.
    .filter((entry) => entry.query && entry.location && entry.query.split(/\s+/).length <= 8)
    .slice(0, MAX_PLANNER_QUERIES)
    .map((entry): PlannedQuery => ({
      ...entry,
      // Regional and signal queries are category-like: they also run on Maps.
      channels: entry.strategy === "REGIONAL" || entry.strategy === "SIGNAL" ? ["ORGANIC", "MAPS"] : ["ORGANIC"],
    }));

  const stems = (value: unknown, max: number) =>
    (Array.isArray(value) ? value : [])
      .map((word) => squash(String(word ?? "")))
      .filter((word) => word.length >= 3)
      .slice(0, max);

  const merged = mergeQueries(coverage.queries, queries);
  if (!merged.length) throw new Error("No search queries could be planned for this campaign.");
  return {
    areas: coverage.areas,
    queries: merged,
    relevanceKeywords: stems(raw.relevanceKeywords, 18),
    geographyTerms: stems(raw.geographyTerms, 30),
  };
}

/* ---- domains -------------------------------------------------------------- */

export type DomainKind = "COMPANY" | "DIRECTORY" | "BLOCKED";

/**
 * What a result domain is. Directories and federations can list companies, so
 * they are read as discovery inputs — but they are never candidates themselves.
 */
export function classifyDomain(domain: string, title: string | null): DomainKind {
  if (!isCompanyDomain(domain)) {
    const listing = /(annuaire|directory|gids|kompass|europages|pagesjaunes|pagesdor|goldenpages|editus|federation|federatie|febetra|uptr|flf|clc|cluster|chambre|chamber|kamer|business|entreprises|companies|bedrijven|membres|members|leden|groupement|union|confederation|verband|vereniging)/i;
    return listing.test(`${domain} ${title ?? ""}`) ? "DIRECTORY" : "BLOCKED";
  }
  if (/(federation|fédération|federatie|association|groupement|union|confédération|confederation|chambre|chamber|kamer|verband|vereniging|cluster|annuaire|directory|liste des|list of|member list|membres|members|leden|mitglieder|top \d+|classement)/i.test(title ?? "")) {
    return "DIRECTORY";
  }
  return "COMPANY";
}

export type Candidate = {
  domain: string;
  url: string;
  title: string | null;
  hits: number;
  bestPosition: number;
  /** Markets the domain ranked in. A local company ranks in one or two. */
  locations: Set<string>;
  /** Every strategy that surfaced it, and the queries (by index). */
  strategies: Set<Strategy>;
  queryIndexes: Set<number>;
  /** Directory pages it was listed on, when it came from one. */
  listedOn: Set<string>;
  /** Where it was found: organic results, Google Maps, or a listing page. */
  channels: Set<"ORGANIC" | "MAPS" | "LISTING">;
  /** The Google Maps business category, when it came from Maps. */
  category: string | null;
  /** A public business phone shown on the Maps listing. */
  phone: string | null;
};

const OPERATOR_WORDS = /(transport|logisti|fret|freight|spedition|expedition|camion|truck|cargo|vervoer|convoi|trucking|haulage)/i;
const OPERATOR_CATEGORY = /(transport|trucking|logisti|freight|haulage|vervoer|spedition|expedi|courier|messagerie|moving|demenag)/i;

/**
 * Orders the pool before any homepage is read, from what the search already
 * returned: operator words in the domain or name, a transport-like Maps
 * category, a sector listing, several strategies. Aggregators go last.
 * A pool-ordering signal only — it never reaches the fit score.
 */
export function prePoolScore(candidate: Candidate) {
  return (
    (OPERATOR_WORDS.test(candidate.domain) ? 12 : 0) +
    (OPERATOR_WORDS.test(candidate.title ?? "") ? 8 : 0) +
    (candidate.category && OPERATOR_CATEGORY.test(candidate.category) ? 10 : 0) +
    (candidate.listedOn.size ? 6 : 0) +
    (candidate.phone ? 3 : 0) +
    (candidate.strategies.size - 1) * 4 -
    (candidate.locations.size >= 3 ? 15 : 0) -
    Math.min(candidate.bestPosition, 60) * 0.2
  );
}

export type QueryDiagnostic = {
  query: string;
  strategy: Strategy;
  source: PlannedQuery["source"];
  channels: QueryChannel[];
  location: string;
  results: number;
  uniqueDomains: number;
  filtered: number;
  directoryPages: number;
  /** Google Maps results with a website, for queries that also ran there. */
  mapsResults: number;
  mapsUnique: number;
  error: string | null;
};

/** Job and interim results crowd out companies for any sector + place query. */
const JOB_EXCLUSIONS = "-emploi -offre -jobs -job -vacature -vacatures -interim -intérim -recrutement";

/**
 * Runs every query and pools the company domains that come back, keeping per
 * query what it contributed. Directory pages are set aside as discovery inputs.
 * A query that fails is recorded and skipped; only a total failure is fatal.
 */
export async function discoverCandidates(plan: QueryPlan) {
  const byDomain = new Map<string, Candidate>();
  const directoryPages = new Map<string, { url: string; title: string | null; queryIndex: number }>();
  const diagnostics: QueryDiagnostic[] = [];
  let raw = 0;
  let succeeded = 0;
  let failed = 0;
  // Out of credit: every later call would fail the same way, so none is made.
  let exhausted: string | null = null;
  const OUT_OF_CREDIT = /\b402\b|payment required/i;
  const attempt = async <T,>(call: () => Promise<T>) => {
    if (exhausted) throw new Error(exhausted);
    try {
      return await call();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (OUT_OF_CREDIT.test(message)) {
        exhausted = "Search provider credit exhausted (402 Payment Required).";
        throw new Error(exhausted);
      }
      // One retry: the provider has intermittent internal errors.
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return call();
    }
  };

  for (const [index, query] of plan.queries.entries()) {
    const diagnostic: QueryDiagnostic = {
      query: query.query,
      strategy: query.strategy,
      source: query.source,
      channels: query.channels,
      location: query.location,
      results: 0,
      uniqueDomains: 0,
      filtered: 0,
      directoryPages: 0,
      mapsResults: 0,
      mapsUnique: 0,
      error: null,
    };
    diagnostics.push(diagnostic);
    if (query.channels.includes("ORGANIC")) try {
      // Directory queries look for listing pages: job exclusions would not hurt, but
      // company-intent operators would, so they run as planned.
      const keyword = query.strategy === "DIRECTORY" ? query.query : `${query.query} ${JOB_EXCLUSIONS}`;
      const results = await attempt(() => fetchSerp(keyword, 20, { location: query.location, language: query.language }));
      succeeded++;
      diagnostic.results = results.length;
      raw += results.length;

      for (const result of results) {
        const domain = normalizeDomain(result.domain);
        if (!domain) continue;
        const kind = classifyDomain(domain, result.title);
        if (kind === "DIRECTORY") {
          if (result.url && !directoryPages.has(result.url)) {
            directoryPages.set(result.url, { url: result.url, title: result.title, queryIndex: index });
            diagnostic.directoryPages++;
          }
          continue;
        }
        if (kind === "BLOCKED") {
          diagnostic.filtered++;
          continue;
        }
        const existing = byDomain.get(domain);
        if (existing) {
          existing.hits++;
          existing.bestPosition = Math.min(existing.bestPosition, result.position);
          existing.locations.add(query.location);
          existing.strategies.add(query.strategy);
          existing.queryIndexes.add(index);
          existing.channels.add("ORGANIC");
        } else {
          diagnostic.uniqueDomains++;
          byDomain.set(domain, {
            domain,
            // The homepage, not the deep page that happened to rank.
            url: `https://${result.domain}`,
            title: result.title,
            hits: 1,
            bestPosition: result.position,
            locations: new Set([query.location]),
            strategies: new Set([query.strategy]),
            queryIndexes: new Set([index]),
            listedOn: new Set(),
            channels: new Set(["ORGANIC"]),
            category: null,
            phone: null,
          });
        }
      }
    } catch (error) {
      failed++;
      diagnostic.error = error instanceof Error ? error.message.slice(0, 160) : "search failed";
    }

    // Google Maps lists small local operators that never rank organically.
    if (query.channels.includes("MAPS")) {
      try {
        const maps = await attempt(() => fetchMaps(query.query, MAPS_DEPTH, { location: query.location, language: query.language }));
        succeeded++;
        for (const [position, place] of maps.entries()) {
          const domain = normalizeDomain(place.domain ?? place.url);
          // No website, nothing to verify: a map pin alone is never a candidate.
          if (!domain || classifyDomain(domain, place.title) !== "COMPANY") continue;
          diagnostic.mapsResults++;
          raw++;
          const existing = byDomain.get(domain);
          if (existing) {
            existing.hits++;
            existing.strategies.add(query.strategy);
            existing.queryIndexes.add(index);
            existing.channels.add("MAPS");
            existing.locations.add(query.location);
            existing.category = existing.category ?? place.category;
            existing.phone = existing.phone ?? place.phone;
          } else {
            diagnostic.mapsUnique++;
            byDomain.set(domain, {
              domain,
              url: `https://${place.domain ?? domain}`,
              title: place.title,
              hits: 1,
              bestPosition: position + 1,
              locations: new Set([query.location]),
              strategies: new Set([query.strategy]),
              queryIndexes: new Set([index]),
              listedOn: new Set(),
              channels: new Set(["MAPS"]),
              category: place.category,
              phone: place.phone,
            });
          }
        }
      } catch (error) {
        failed++;
        diagnostic.error = diagnostic.error ?? `maps: ${error instanceof Error ? error.message.slice(0, 140) : "failed"}`;
      }
    }
  }

  const health = { planned: succeeded + failed, succeeded, failed };
  if (!succeeded) {
    throw Object.assign(
      new Error(`Search provider failed for every query. ${diagnostics.find((d) => d.error)?.error ?? ""}`.trim()),
      { health },
    );
  }

  return { byDomain, directoryPages: [...directoryPages.values()], diagnostics, raw, health };
}

/* ---- directories ----------------------------------------------------------- */

export type DirectoryListing = { name: string; website: string | null; domain: string | null; location: string | null };

/**
 * Reads a listing page for the companies it names — deterministically, from
 * its outbound links. A listing is a lead, never a fact: every company found
 * here is verified on its own website before anything is saved.
 */
export async function extractDirectoryListings(url: string): Promise<{ listings: DirectoryListing[]; readable: boolean; detailPagesRead: number }> {
  const read = async (target: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(target, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        redirect: "follow",
        signal: controller.signal,
      });
      // A refusal or a challenge is respected, never worked around.
      if (!response.ok || !(response.headers.get("content-type") ?? "").includes("text/html")) return null;
      return { html: await response.text(), url: response.url || target };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
  const anchors = (html: string, base: string) =>
    [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
      .map((match) => {
        try {
          const target = new URL(match[1], base);
          if (!/^https?:$/.test(target.protocol)) return null;
          const label = decode(match[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
          return { target, label };
        } catch {
          return null;
        }
      })
      .filter((entry): entry is { target: URL; label: string } => Boolean(entry));

  const page = await read(url);
  if (!page) return { listings: [], readable: false, detailPagesRead: 0 };
  const pageDomain = normalizeDomain(page.url);
  const listings = new Map<string, DirectoryListing>();
  const companyLink = (target: URL) => {
    const domain = normalizeDomain(target.hostname);
    if (!domain || domain === pageDomain || classifyDomain(domain, null) !== "COMPANY") return null;
    return domain;
  };

  // 0. An association homepage often shows a few members and links to the
  //    full list: read that members index too (one extra page).
  let links = anchors(page.html, page.url);
  const index = links.find(
    ({ target, label }) =>
      normalizeDomain(target.hostname) === pageDomain &&
      /(membres|members|leden|mitglieder|adherents|annuaire|directory|liste)/i.test(`${target.pathname} ${label}`) &&
      !/(devenir|become|word lid|join|adhesion|carte|map)/i.test(`${target.pathname} ${label}`) &&
      target.toString().replace(/\/$/, "") !== page.url.replace(/\/$/, ""),
  );
  if (index) {
    const indexPage = await read(index.target.toString());
    if (indexPage) {
      const indexLinks = anchors(indexPage.html, indexPage.url);
      // A paginated members list: follow a few numbered pages of the same list.
      const base = indexPage.url.replace(/[?#].*$/, "").replace(/\/$/, "");
      const pages = [
        ...new Set(
          indexLinks
            .filter(({ target, label }) => {
              const href = target.toString();
              return (
                normalizeDomain(target.hostname) === pageDomain &&
                /^\d{1,2}$/.test(label) &&
                (href.startsWith(`${base}/`) || /[?&](page|p|start|limitstart)=\d+/i.test(href))
              );
            })
            .map(({ target }) => target.toString()),
        ),
      ].slice(0, 4);
      const more = await Promise.all(pages.map((pageUrl) => read(pageUrl)));
      links = [
        ...indexLinks,
        ...more.flatMap((extra) => (extra ? anchors(extra.html, extra.url) : [])),
        ...links,
      ];
    }
  }

  // 1. Companies linked straight from the listing.
  for (const { target, label } of links) {
    const domain = companyLink(target);
    if (!domain || listings.has(domain)) continue;
    listings.set(domain, {
      name: label && label.length <= 80 && !/^https?:|^www\./i.test(label) ? label : domain,
      website: `https://${target.hostname}`,
      domain,
      location: null,
    });
  }

  // 2. Member pages one hop away: a named entry on the listing's own site,
  //    whose page links to the member's website.
  const NAV = /^(home|accueil|contact|news|actualit|a propos|about|login|connexion|fr|de|en|nl|lu|plus|more|voir|lire|read|carte|map|devenir membre|membres|members|formations?|publications?|missions?)$/i;
  const detailLinks = new Map<string, string>();
  for (const { target, label } of links) {
    if (normalizeDomain(target.hostname) !== pageDomain) continue;
    const path = target.pathname.toLowerCase();
    const looksLikeEntry =
      /\/(item|items|member|members|membre|membres|lid|leden|entreprise|entreprises|company|companies|fiche|profil|profile|adherent|adherents)\//.test(path) ||
      path.split("/").filter(Boolean).length >= 3;
    const looksLikeName = label.length >= 3 && label.length <= 70 && /[a-z]{3}/i.test(label) && !NAV.test(label);
    if (looksLikeEntry && looksLikeName && !detailLinks.has(target.toString())) {
      target.hash = "";
      detailLinks.set(target.toString(), label);
    }
  }
  let detailPagesRead = 0;
  // Within the budget, entries whose name already says what the sector does
  // are read first: a long member list is mostly operators, but not only.
  const operatorName = /(transport|logisti|trans\b|fret|freight|spedition|expedition|camion|truck|cargo|shipping|convoi)/i;
  const entries = [...detailLinks.entries()]
    .sort((a, b) => Number(operatorName.test(b[1])) - Number(operatorName.test(a[1])))
    .slice(0, MAX_DETAIL_PAGES);
  for (let index = 0; index < entries.length; index += 5) {
    const batch = await Promise.all(
      entries.slice(index, index + 5).map(async ([detailUrl, label]) => {
        const detail = await read(detailUrl);
        if (!detail) return null;
        detailPagesRead++;
        const website = anchors(detail.html, detail.url).find(({ target }) => companyLink(target));
        return website ? { label, target: website.target } : null;
      }),
    );
    for (const found of batch) {
      if (!found) continue;
      const domain = companyLink(found.target)!;
      if (!listings.has(domain)) {
        listings.set(domain, { name: found.label, website: `https://${found.target.hostname}`, domain, location: null });
      }
    }
  }

  return { listings: [...listings.values()].slice(0, 80), readable: true, detailPagesRead };
}

/* ---- discovery score -------------------------------------------------------- */

export type DiscoveryScore = {
  score: number;
  relevant: boolean;
  /** Why a homepage was set aside, in the log's own categories. */
  rejection: "IRRELEVANT" | "NON_OPERATOR" | "MICRO_CARRIER" | null;
  signals: string[];
};

const OPERATOR_SIGNALS: [string, RegExp][] = [
  ["fleet", /\b(flotte|fleet|wagenpark|fuhrpark|parc de vehicules|parc camions|nos camions|our trucks|vrachtwagens)\b/],
  ["trailers", /\b(remorques?|semi-remorques?|trailers?|opleggers?|auflieger|tautliners?|frigorifiques?)\b/],
  ["dispatch", /\b(dispatch|affretement|exploitation|planning|disposition)\b/],
  ["warehousing", /\b(entrepot|entreposage|stockage|warehous\w*|opslag|lager)\b/],
  ["international", /\b(international|europe|european|europeen|grensoverschrijdend)\b/],
  ["specialised", /\b(exceptionnel|exceptional|convoi|citerne|tank|adr|vrac|bulk|conteneur|container)\b/],
  ["sites", /\b(nos sites|our sites|agences|depots|vestigingen|niederlassungen|implantations)\b/],
];

/**
 * A cheap score that decides what is worth researching. It is a discovery
 * signal only — it never becomes, or feeds, the fit score.
 */
export function discoveryScore(page: FetchedPage, plan: QueryPlan, candidate: Candidate): DiscoveryScore {
  const haystack = squash(`${page.title ?? ""} ${page.text}`);
  const matched = plan.relevanceKeywords.filter((word) => haystack.includes(word));
  const places = plan.geographyTerms.filter((word) => haystack.includes(word));
  const signals = OPERATOR_SIGNALS.filter(([, pattern]) => pattern.test(haystack)).map(([name]) => name);

  // Federations, vendors and staffing agencies talk about the sector without being in it.
  const notAnOperator = [
    /\b(federation|federatie|beroepsfederatie|association professionnelle|beroepsvereniging)\b/,
    /\b(nos membres|onze leden|our members|devenir membre|lid worden|become a member)\b/,
    /\b(request a demo|demander une demo|demo aanvragen|free trial|essai gratuit|gratis proberen)\b/,
    /\b(saas|pricing plans|nos tarifs logiciel)\b/,
    /\b(travail temporaire|uitzendbureau|uitzendkracht|agence d'interim|agence interim|interimkantoor|staffing agency|agence de placement)\b/,
  ].filter((pattern) => pattern.test(haystack)).length;

  // "5 camions", "flotte de 4 véhicules": a visible clue, not a verdict.
  const fleetNumbers = [...haystack.matchAll(/\b(\d{1,4})\s+(camions|vehicules|trucks|vrachtwagens|tracteurs|lkw|poids lourds|semi-remorques)\b/g)]
    .map((match) => Number(match[1]))
    .filter((n) => n > 0);
  const microClue = fleetNumbers.length > 0 && Math.max(...fleetNumbers) < 10;

  if (page.text.length <= 300 || matched.length < 2) {
    return { score: 0, relevant: false, rejection: "IRRELEVANT", signals };
  }
  if (notAnOperator >= 2) return { score: 0, relevant: false, rejection: "NON_OPERATOR", signals };
  if (microClue) return { score: 5, relevant: false, rejection: "MICRO_CARRIER", signals };

  const score =
    Math.min(matched.length, 6) * 4 +
    Math.min(places.length, 4) * 5 +
    signals.length * 6 +
    Math.min(candidate.strategies.size, 3) * 4 +
    (candidate.listedOn.size ? 6 : 0) -
    // Ranking in three or more countries is what aggregators do.
    (candidate.locations.size >= 3 ? 15 : 0) -
    Math.min(candidate.bestPosition, 20) * 0.3;

  return { score: Math.round(score), relevant: true, rejection: null, signals };
}

/* -------------------------------------------------------------------------- */
/* Stage 5–7: research, synthesize, verify                                     */
/* -------------------------------------------------------------------------- */

const RESEARCH_PROMPT = [
  "You extract verifiable facts about ONE company from pages of its own website, for a B2B sales campaign. You do not browse. You know nothing beyond the pages given.",
  "",
  "Every page has an id (P1, P2…) and its URL. Page text is raw and may be noisy.",
  "",
  "RULES — these override everything:",
  "1. isTargetCompany is false when the site is not a single operating company matching the campaign industries (a directory, a marketplace, a software vendor, a public body, a job site, an association, a news site, an unrelated business). Then explain in rejectionReason, set rejectionKind (NON_OPERATOR for directories, federations, vendors, agencies, marketplaces and public bodies; IRRELEVANT for an unrelated business; MICRO_CARRIER when the pages state a fleet or company far too small for the campaign) and keep the rest minimal. For a matching company, rejectionKind is NONE.",
  "2. A FACT must quote an exact excerpt copied character for character from the cited page, 8 to 200 characters, and cite that page id. If you cannot quote it, it is not a FACT.",
  "3. An INFERENCE is your reasoning from the facts, phrased as a hypothesis. It may cite the pages it rests on.",
  "4. An UNKNOWN is commercially important information the pages do not give. Focus on sales qualification: current TMS, dispatch organisation, number of dispatchers, planning tools, manual re-entry, integration needs, budget authority, timing. Only list unknowns that genuinely matter.",
  "5. ABSENCE IS NEVER A FACT. If a page does not mention a TMS, ERP or any software, that is an UNKNOWN (e.g. 'Current TMS not identified'). Never write that the company has no software, does not use a tool, or works on paper or Excel.",
  "6. Visible software IS a fact when quoted: a customer tracking portal, a client login, a named telematics provider, an app on the site.",
  "7. Structured company fields (employeeCount, fleetSize, revenue, city, country, activities, locations, linkedinUrl) are filled ONLY when a page states them, with the page id and the exact excerpt. Otherwise leave value empty / null. Never estimate a number.",
  "8. Contacts: only real people named on a page, with their role stated on that page. Quote the excerpt that shows the name and role. Email and phone only if printed on that same page for that person — never a company switchboard as a personal line, never a guessed address. If no person is named, return no contacts.",
  "9. Fit factors, using the scoringRubric: " + SCORING_RULE,
  "10. strongestReason: one sentence, the single most concrete reason this company fits the campaign, grounded in a fact.",
  "",
  "Aim for 3 to 8 facts, 1 to 4 inferences and 2 to 6 unknowns — only when justified.",
  FRENCH_OUTPUT_RULE,
  "In French: statements, description, industry, activities, strongestReason, rejectionReason, fit factor labels and rationales. Excerpts stay in the page's original language, character for character. Country names stay in English (France, Belgium, Luxembourg, Germany).",
].join("\n");

const FIELD = {
  type: "object",
  additionalProperties: false,
  required: ["value", "pageId", "excerpt"],
  properties: {
    value: { type: "string" },
    pageId: { type: "string" },
    excerpt: { type: "string" },
  },
} as const;
const CONF = { type: "string", enum: ["LOW", "MEDIUM", "HIGH"] } as const;

const RESEARCH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isTargetCompany",
    "rejectionReason",
    "rejectionKind",
    "officialName",
    "industry",
    "description",
    "fields",
    "evidence",
    "contacts",
    "fitFactors",
    "strongestReason",
  ],
  properties: {
    isTargetCompany: { type: "boolean" },
    rejectionReason: { type: "string" },
    rejectionKind: { type: "string", enum: ["NONE", "NON_OPERATOR", "IRRELEVANT", "MICRO_CARRIER"] },
    officialName: FIELD,
    industry: { type: "string" },
    description: { type: "string" },
    fields: {
      type: "object",
      additionalProperties: false,
      required: [
        "country",
        "city",
        "employeeCount",
        "fleetSize",
        "revenue",
        "linkedinUrl",
        "activities",
        "locations",
      ],
      properties: {
        country: FIELD,
        city: FIELD,
        employeeCount: FIELD,
        fleetSize: FIELD,
        revenue: FIELD,
        linkedinUrl: FIELD,
        activities: { type: "array", items: FIELD },
        locations: { type: "array", items: FIELD },
      },
    },
    evidence: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ref", "type", "category", "statement", "pageId", "excerpt", "confidence"],
        properties: {
          ref: { type: "string" },
          type: { type: "string", enum: ["FACT", "INFERENCE", "UNKNOWN"] },
          category: { type: "string" },
          statement: { type: "string" },
          pageId: { type: "string" },
          excerpt: { type: "string" },
          confidence: CONF,
        },
      },
    },
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "firstName",
          "lastName",
          "jobTitle",
          "decisionRole",
          "pageId",
          "excerpt",
          "email",
          "phone",
        ],
        properties: {
          firstName: { type: "string" },
          lastName: { type: "string" },
          jobTitle: { type: "string" },
          decisionRole: {
            type: "string",
            enum: ["DECISION_MAKER", "CHAMPION", "USER", "INFLUENCER", "GATEKEEPER", "UNKNOWN"],
          },
          pageId: { type: "string" },
          excerpt: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
        },
      },
    },
    fitFactors: FIT_FACTORS_SCHEMA,
    strongestReason: { type: "string" },
  },
} as const;

export type VerifiedEvidence = {
  type: "FACT" | "INFERENCE" | "UNKNOWN";
  category: string;
  statement: string;
  sourceUrl: string | null;
  sourceName: string | null;
  evidenceExcerpt: string | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  sourceQuality: "HIGH" | "MEDIUM" | "LOW" | null;
  note: string | null;
};

export type VerifiedContact = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  decisionRole: string;
  email: string | null;
  phone: string | null;
  sourceUrl: string;
  sourceName: string;
};

export type ResearchResult = {
  domain: string;
  website: string;
  isTargetCompany: boolean;
  rejectionReason: string;
  rejectionKind: "NONE" | "NON_OPERATOR" | "IRRELEVANT" | "MICRO_CARRIER";
  name: string;
  industry: string | null;
  description: string | null;
  country: string | null;
  city: string | null;
  employeeCount: number | null;
  fleetSize: number | null;
  revenue: string | null;
  linkedinUrl: string | null;
  companyPhone: string | null;
  companyPhoneSource: PhoneSource | null;
  companyPhoneSourceUrl: string | null;
  companyEmail: string | null;
  contactPageUrl: string | null;
  activities: string[];
  locations: string[];
  evidence: VerifiedEvidence[];
  contacts: VerifiedContact[];
  factors: FitFactor[];
  fitScore: number;
  /** Share of the rubric the evidence could speak to, 0–1. */
  coverage: number;
  fitConfidence: "LOW" | "MEDIUM" | "HIGH";
  confidenceNotes: string[];
  strongestReason: string;
  pagesRead: string[];
  rejectedClaims: number;
  /** What verification refused, and why — kept for the run log. */
  rejections: string[];
};

const ABSENCE_CLAIM =
  /\b(no|not|without|lacks?|absence|none|aucun|aucune|pas de|pas d'|sans|n'utilise|manual|manuel|paper|papier|excel)\b/i;
const SOFTWARE_WORD = /\b(tms|erp|crm|software|logiciel|system|systeme|système|tool|outil|digital|app)\b/i;

/** The first integer in an excerpt, only if the claimed value is that number. */
function verifiedNumber(value: string, excerpt: string) {
  const n = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  const digits = excerpt.replace(/[\s.  ]/g, "");
  return digits.includes(String(n)) ? n : null;
}

function roleRank(title: string) {
  const t = squash(title);
  if (/(exploitation|operations?|operationnel|dispatch|affr[eè]t|planning|transport manager|responsable transport|fleet|flotte|parc)/.test(t)) return 0;
  if (/(coo|directeur des operations|directeur operationnel)/.test(t)) return 1;
  if (/(it|informatique|digital|numerique|systemes? d'information|dsi|cio|cto)/.test(t)) return 2;
  if (/(gerant|managing director|directeur general|ceo|administrateur delegue|pdg|owner|fondateur|founder)/.test(t)) return 3;
  return 4;
}

export async function researchCompany(
  candidate: Candidate,
  home: FetchedPage,
  campaign: CampaignForResearch,
): Promise<ResearchResult> {
  /* ---- read a handful of the company's own pages -------------------------- */
  const pages: FetchedPage[] = [home];
  for (const link of pickPages(home.links, home.url)) {
    const page = await fetchPage(link);
    if (page && page.text.length > 150) pages.push(page);
  }
  // The contact page (and, failing a number there, the legal notice) is always read: it carries the switchboard.
  pages.push(...(await contactRelevantPages(home, pages.slice(1)).catch(() => [])));
  const pageById = new Map(pages.map((page, index) => [`P${index + 1}`, page]));
  // The source is the site itself, named so a reader can recognise it.
  const siteName = `${normalizeDomain(home.url) ?? candidate.domain} (official website)`;

  const raw = (await callOpenAi(
    RESEARCH_PROMPT,
    {
      campaign: {
        offer: campaign.offer,
        industries: campaign.industries,
        geography: campaign.geography,
        targetCompanySize: campaign.targetCompanySize,
        preferredProfile: campaign.preferredProfile,
        exclusions: campaign.exclusions,
      },
      scoringRubric: scoringRubric(campaign),
      company: { domain: candidate.domain },
      pages: [...pageById.entries()].map(([id, page]) => ({
        id,
        url: page.url,
        title: page.title,
        text: page.text,
      })),
    },
    "prospect_research",
    RESEARCH_SCHEMA,
  )) as Record<string, unknown>;

  const text = (value: unknown) => String(value ?? "").trim();
  // Page ids (P1, P2…) are for citations only; they never belong in prose.
  const prose = (value: unknown) =>
    text(value)
      .replace(/\s*\((?:\s*P\d+\s*,?)+\)/g, "")
      .replace(/\s+([.,;:])/g, "$1")
      .trim();
  let rejectedClaims = 0;
  const rejections: string[] = [];
  const reject = (what: string, excerpt: string, pageId: string) => {
    rejectedClaims++;
    if (rejections.length < 12) {
      rejections.push(`${what} — ${pageId || "no page"} — “${excerpt.slice(0, 90)}”`);
    }
  };

  /** A structured field survives only with its excerpt on the cited page. */
  const field = (value: unknown) => {
    const item = (value ?? {}) as Record<string, unknown>;
    const page = pageById.get(text(item.pageId));
    const claimed = text(item.value);
    if (!claimed) return null;
    if (!excerptOnPage(text(item.excerpt), page)) {
      reject(`field “${claimed.slice(0, 40)}”`, text(item.excerpt), text(item.pageId));
      return null;
    }
    return { value: claimed, excerpt: text(item.excerpt), page: page! };
  };

  const fields = (raw.fields ?? {}) as Record<string, unknown>;
  const officialName = field(raw.officialName);
  const employee = field(fields.employeeCount);
  const fleet = field(fields.fleetSize);
  const linkedin = field(fields.linkedinUrl);

  /* ---- evidence: verified, downgraded, or dropped ------------------------- */
  const evidence: (VerifiedEvidence & { ref: string })[] = [];
  for (const entry of Array.isArray(raw.evidence) ? raw.evidence : []) {
    const item = entry as Record<string, unknown>;
    const statement = prose(item.statement);
    if (!statement) continue;
    const page = pageById.get(text(item.pageId));
    const excerpt = text(item.excerpt);
    const confidence = (["LOW", "MEDIUM", "HIGH"].includes(text(item.confidence))
      ? text(item.confidence)
      : "MEDIUM") as VerifiedEvidence["confidence"];
    let type = (["FACT", "INFERENCE", "UNKNOWN"].includes(text(item.type))
      ? text(item.type)
      : "INFERENCE") as VerifiedEvidence["type"];
    let note: string | null = null;

    if (type === "FACT" && ABSENCE_CLAIM.test(statement) && SOFTWARE_WORD.test(statement)) {
      // "No TMS" is never observable on a website: it is a gap, not a fact.
      type = "UNKNOWN";
      note = "Absence d’information enregistrée comme inconnue, pas comme un fait.";
    }

    const verified = type === "FACT" && excerptOnPage(excerpt, page);
    if (type === "FACT" && !verified) {
      type = "INFERENCE";
      note = "L’extrait cité est introuvable sur la page ; conservé comme inférence.";
      reject(`fact “${statement.slice(0, 50)}”`, excerpt, text(item.pageId));
    }

    evidence.push({
      ref: text(item.ref) || `E${evidence.length + 1}`,
      type,
      category: text(item.category) || "general",
      statement,
      sourceUrl: type === "UNKNOWN" ? null : (page?.url ?? null),
      sourceName: type === "UNKNOWN" || !page ? null : siteName,
      evidenceExcerpt: verified ? excerpt : null,
      // A downgraded claim cannot keep the confidence of a verified one.
      confidence: verified ? confidence : type === "UNKNOWN" ? confidence : "LOW",
      // Source quality describes a source, so only a verified fact carries it.
      // Only the company's own site is read, which is an official source.
      sourceQuality: verified ? "HIGH" : null,
      note,
    });
  }

  const capped = [
    ...evidence.filter((item) => item.type === "FACT").slice(0, 8),
    ...evidence.filter((item) => item.type === "INFERENCE").slice(0, 4),
    ...evidence.filter((item) => item.type === "UNKNOWN").slice(0, 6),
  ];

  /* ---- contacts: named on the page, with the role on the page ------------- */
  const contacts: VerifiedContact[] = [];
  for (const entry of Array.isArray(raw.contacts) ? raw.contacts : []) {
    const item = entry as Record<string, unknown>;
    const page = pageById.get(text(item.pageId));
    const firstName = text(item.firstName);
    const lastName = text(item.lastName);
    const jobTitle = text(item.jobTitle);
    if (!page || !firstName || !lastName || !jobTitle) continue;
    const onPage = squash(page.text);
    if (!onPage.includes(squash(lastName)) || !onPage.includes(squash(firstName))) {
      reject(`contact ${firstName} ${lastName} (name not on page)`, text(item.excerpt), text(item.pageId));
      continue;
    }
    if (!excerptOnPage(text(item.excerpt), page)) {
      reject(`contact ${firstName} ${lastName} (excerpt)`, text(item.excerpt), text(item.pageId));
      continue;
    }
    const email = text(item.email).toLowerCase();
    const phone = text(item.phone);
    const phoneDigits = phone.replace(/\D/g, "");
    contacts.push({
      firstName,
      lastName,
      jobTitle,
      decisionRole: text(item.decisionRole) || "UNKNOWN",
      // Printed on that page, or not stored. Never guessed.
      email: email && page.text.toLowerCase().includes(email) ? email : null,
      phone:
        phoneDigits.length >= 8 && page.text.replace(/\D/g, "").includes(phoneDigits)
          ? phone
          : null,
      sourceUrl: page.url,
      sourceName: siteName,
    });
  }
  contacts.sort((a, b) => roleRank(a.jobTitle) - roleRank(b.jobTitle));

  /* ---- fit and confidence: the same arithmetic as intelligence ----------- */
  const evidenceRef = new Map(capped.map((item) => [item.ref, item]));

  const activities = (Array.isArray(fields.activities) ? fields.activities : [])
    .map(field)
    .filter((item): item is NonNullable<ReturnType<typeof field>> => Boolean(item))
    .map((item) => item.value)
    .slice(0, 8);
  const locations = (Array.isArray(fields.locations) ? fields.locations : [])
    .map(field)
    .filter((item): item is NonNullable<ReturnType<typeof field>> => Boolean(item))
    .map((item) => item.value)
    .slice(0, 8);

  // The same data-decided geography gate as scoring: a verified country outside
  // the campaign settles the criterion, whatever the model concluded.
  const rubric = scoringRubric(campaign);
  const geography = checkGeography(campaign.geography, {
    country: field(fields.country)?.value ?? null,
    city: field(fields.city)?.value ?? null,
    locations,
  });
  const { factors, fitScore, coverage } = scoreFitFactors(applyGeographyCheck(raw.fitFactors, rubric, geography), evidenceRef, rubric, {
    fields: {
      country: field(fields.country)?.value ?? null,
      city: field(fields.city)?.value ?? null,
      industry: text(raw.industry) || null,
      description: text(raw.description) || null,
      employeeCount: employee ? verifiedNumber(employee.value, employee.excerpt) : null,
      fleetSize: fleet ? verifiedNumber(fleet.value, fleet.excerpt) : null,
      revenue: field(fields.revenue)?.value ?? null,
      activities,
      locations,
    },
  });

  const result: ResearchResult = {
    domain: candidate.domain,
    website: `https://${new URL(home.url).hostname}`,
    isTargetCompany: raw.isTargetCompany === true,
    rejectionReason: prose(raw.rejectionReason),
    rejectionKind: (["NON_OPERATOR", "IRRELEVANT", "MICRO_CARRIER"].includes(text(raw.rejectionKind))
      ? text(raw.rejectionKind)
      : "NONE") as ResearchResult["rejectionKind"],
    name: officialName?.value || home.title?.split(/[|–—-]/)[0]?.trim() || candidate.domain,
    industry: text(raw.industry) || null,
    description: prose(raw.description) || null,
    country: field(fields.country)?.value ?? null,
    city: field(fields.city)?.value ?? null,
    employeeCount: employee ? verifiedNumber(employee.value, employee.excerpt) : null,
    fleetSize: fleet ? verifiedNumber(fleet.value, fleet.excerpt) : null,
    revenue: field(fields.revenue)?.value ?? null,
    linkedinUrl: linkedin && /linkedin\.com\/company\//i.test(linkedin.value) ? linkedin.value : null,
    ...withMapsFallback(
      companyChannels(
        pages,
        candidate.domain,
        contacts.flatMap((contact) => [contact.phone, contact.email].filter((value): value is string => Boolean(value))),
      ),
      candidate.phone,
    ),
    activities,
    locations,
    evidence: capped.map(({ ref: _ref, ...item }) => item),
    contacts: contacts.slice(0, 4),
    factors,
    fitScore,
    coverage,
    fitConfidence: "LOW",
    confidenceNotes: [],
    strongestReason: prose(raw.strongestReason),
    pagesRead: pages.map((page) => page.url),
    rejectedClaims,
    rejections,
  };

  // A switchboard the model attached to a person is the company line, not their direct phone.
  const switchboard = phoneKey(result.companyPhone);
  if (switchboard) {
    result.contacts = result.contacts.map((contact) =>
      phoneKey(contact.phone) === switchboard ? { ...contact, phone: null } : contact,
    );
  }

  const confidence = computeConfidence(
    {
    brand: { name: campaign.brandName, language: "", positioning: "", valueProposition: "", voiceDescription: "", voiceRules: [] },
    campaign,
    prospect: {
      name: result.name,
      website: result.website,
      country: result.country,
      city: result.city,
      industry: result.industry,
      description: result.description,
      employeeCount: result.employeeCount,
      revenue: result.revenue,
      fleetSize: result.fleetSize,
      activities: result.activities,
      locations: result.locations,
      digitalMaturityScore: null,
      detectedTools: [],
      tms: null,
      erp: null,
      crm: null,
      telematics: null,
      clientPortal: null,
      driverApp: null,
      visibleAutomations: [],
      priority: "MEDIUM",
      status: "DISCOVERED",
      nextAction: null,
      nextActionAt: null,
      lastContactAt: null,
      notes: null,
    },
    evidence: result.evidence.map((item, index) => ({
      id: `e${index}`,
      type: item.type,
      category: item.category,
      statement: item.statement,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      confidence: item.confidence,
    })),
    contacts: result.contacts.map((contact, index) => ({
      id: `c${index}`,
      firstName: contact.firstName,
      lastName: contact.lastName,
      jobTitle: contact.jobTitle,
      seniority: null,
      decisionRole: contact.decisionRole,
      isPrimary: index === 0,
      hasEmail: Boolean(contact.email),
      hasPhone: Boolean(contact.phone),
    })),
    interactions: [],
    },
    coverage,
  );
  result.fitConfidence = confidence.level;
  result.confidenceNotes = confidence.notes;
  return result;
}

export type QualificationInput = {
  fitScore: number;
  fitConfidence: string;
  coverage: number;
  factors: FitFactor[];
  hasFact: boolean;
  strongestReason: string;
};

/**
 * Why a prospect does or does not qualify for its campaign, under the current
 * rules. Research uses it to decide what to save; re-scoring uses it to flag
 * prospects that no longer pass.
 */
export function qualificationVerdict(input: QualificationInput): { passes: boolean; reason: string } {
  if (!input.hasFact) return { passes: false, reason: "Aucun fait vérifié." };
  const geographyFailed = input.factors.some(
    (factor) =>
      factor.assessment === "NOT_MET" &&
      factor.criterion?.startsWith("Operates in the target geography"),
  );
  // Geography is a gate for a territorial campaign, not a preference.
  if (geographyFailed) return { passes: false, reason: "Basé hors de la zone géographique de la campagne." };
  // Fit is relative to what could be assessed: too little of the rubric is not enough.
  if (input.coverage < 0.4) {
    return { passes: false, reason: `Seulement ${Math.round(input.coverage * 100)} % des critères ont pu être évalués.` };
  }
  if (input.fitScore >= 65) return { passes: true, reason: `Fit ${input.fitScore}.` };
  if (input.fitScore >= 55 && input.fitConfidence !== "LOW" && input.strongestReason.length > 20) {
    return { passes: true, reason: `Fit ${input.fitScore}, confiance ${({ HIGH: "élevée", MEDIUM: "moyenne", LOW: "faible" } as Record<string, string>)[input.fitConfidence] ?? input.fitConfidence.toLowerCase()}.` };
  }
  return { passes: false, reason: `Fit ${input.fitScore} sous le seuil.` };
}

export type DecisionGroup = "KEEP" | "REVIEW" | "REMOVE";

export type ReviewFlag = "OVERSIZED" | "FREIGHT_FORWARDER" | "LOW_COVERAGE_HIGH_SCORE" | "DIGITAL_STACK";

export const REVIEW_FLAG_LABELS: Record<ReviewFlag, string> = {
  OVERSIZED: "Oversized operator",
  FREIGHT_FORWARDER: "Freight forwarder",
  LOW_COVERAGE_HIGH_SCORE: "High score on low coverage",
  DIGITAL_STACK: "Digital-stack exclusion",
};

const FORWARDER = /(forward|commission|chartering|affr[eè]te|transitaire|spedition|expediteur|expéditeur|transport organi[sz]ation|organisation de transport)/i;
const DIGITAL = /(tms|tooling|digit|stack|software|logiciel)/i;

/**
 * Flags that call for a person's look, read from recorded data only. They never
 * change the score or the save threshold; a flagged prospect is suggested for
 * review, never removed.
 */
export function reviewFlags(input: {
  targetCompanySize: string | null;
  fleetSize: number | null;
  employeeCount: number | null;
  industry: string | null;
  activities: string[];
  fitScore: number;
  coverage: number;
  factors: FitFactor[];
}): { flag: ReviewFlag; reason: string }[] {
  const flags: { flag: ReviewFlag; reason: string }[] = [];
  // The largest number in the target size ("30–200 vehicles") bounds the fleet.
  const bounds = (input.targetCompanySize ?? "").match(/\d+/g)?.map(Number) ?? [];
  const maxFleet = bounds.length ? Math.max(...bounds) : null;
  if (maxFleet && input.fleetSize !== null && input.fleetSize > maxFleet * 1.5) {
    flags.push({ flag: "OVERSIZED", reason: `${input.fleetSize} véhicules pour une cible de ${input.targetCompanySize}.` });
  } else if (input.employeeCount !== null && input.employeeCount > 1000) {
    flags.push({ flag: "OVERSIZED", reason: `${input.employeeCount} salariés.` });
  }
  // Forwarding as the primary activity, not one service among own transport.
  const primary = [input.industry ?? "", input.activities[0] ?? ""].join(" ");
  if (FORWARDER.test(primary)) {
    flags.push({ flag: "FREIGHT_FORWARDER", reason: `Activité principale : ${input.activities[0] ?? input.industry}.` });
  }
  if (input.fitScore >= 95 && input.coverage < 0.6) {
    flags.push({
      flag: "LOW_COVERAGE_HIGH_SCORE",
      reason: `Fit ${input.fitScore} fondé sur ${Math.round(input.coverage * 100)} % des critères.`,
    });
  }
  const stack = input.factors.find(
    (factor) =>
      factor.assessment === "NOT_MET" &&
      ((factor.criterion && DIGITAL.test(factor.criterion)) || (!factor.criterion && DIGITAL.test(factor.label ?? ""))),
  );
  if (stack) flags.push({ flag: "DIGITAL_STACK", reason: stack.rationale || "Un outillage couvrant déjà le flux est mentionné." });
  return flags;
}

/**
 * The keep / review / remove group the rules suggest. A person confirms it:
 * it is never applied over a group someone chose.
 */
export function suggestDecisionGroup(input: {
  verdict: { passes: boolean; reason: string };
  coverage: number;
  fitConfidence: string;
  factors: FitFactor[];
  flags?: { flag: ReviewFlag; reason: string }[];
}): { group: DecisionGroup; reason: string } {
  const notMet = input.factors.filter((factor) => factor.criterion && factor.assessment === "NOT_MET");
  if (notMet.some((factor) => factor.criterion!.startsWith("Operates in the target geography"))) {
    return { group: "REMOVE", reason: "Basé hors de la zone géographique de la campagne." };
  }
  if (!input.verdict.passes) return { group: "REVIEW", reason: input.verdict.reason };
  if (input.flags?.length) {
    return { group: "REVIEW", reason: input.flags.map((entry) => `${REVIEW_FLAG_LABELS[entry.flag]}: ${entry.reason}`).join(" ") };
  }
  if (notMet.length) {
    return { group: "REVIEW", reason: `Critère non atteint : ${notMet.map((factor) => `« ${factor.criterion} »`).join(", ")}.` };
  }
  if (input.coverage < 0.7) {
    return { group: "REVIEW", reason: `Qualifié, mais sur ${Math.round(input.coverage * 100)} % des critères seulement.` };
  }
  if (input.fitConfidence === "LOW") return { group: "REVIEW", reason: "Confiance faible." };
  return { group: "KEEP", reason: "Qualifié, la plupart des critères évalués." };
}

/** Strong enough to be worth a salesperson's time; never padding. */
export function meetsThreshold(result: ResearchResult) {
  if (!result.isTargetCompany) return false;
  return qualificationVerdict({
    fitScore: result.fitScore,
    fitConfidence: result.fitConfidence,
    coverage: result.coverage,
    factors: result.factors,
    hasFact: result.evidence.some((item) => item.type === "FACT"),
    strongestReason: result.strongestReason,
  }).passes;
}
