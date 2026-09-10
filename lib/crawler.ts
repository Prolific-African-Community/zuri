/**
 * A deliberately small same-domain crawler. No queue, no workers, no parser
 * dependency: it fetches pages one at a time, up to a hard cap, and pulls the
 * handful of SEO fields Zuri stores.
 */

export const MAX_PAGES = 50;
const REQUEST_TIMEOUT_MS = 10_000;
const USER_AGENT = "ZuriBot/1.0 (+https://zuri.app)";

const SKIPPED_EXTENSIONS =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|txt|pdf|zip|gz|mp4|webm|mp3|wav|woff2?|ttf|eot)$/i;

export type CrawledPage = {
  url: string;
  statusCode: number | null;
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  canonicalUrl: string | null;
  wordCount: number | null;
};

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'");
}

function clean(value: string | null | undefined) {
  if (!value) return null;
  const text = decodeEntities(value).replace(/\s+/g, " ").trim();
  return text || null;
}

/** Strips the query and hash so the same page is not stored twice. */
export function normalizeUrl(raw: string, base: string) {
  try {
    const url = new URL(raw, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    url.search = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function sameSite(a: URL, b: URL) {
  const strip = (host: string) => host.replace(/^www\./i, "").toLowerCase();
  return strip(a.hostname) === strip(b.hostname);
}

function extractLinks(html: string, base: string, origin: URL) {
  const links = new Set<string>();
  const pattern = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi;

  for (const match of html.matchAll(pattern)) {
    const href = match[1].trim();
    if (
      !href ||
      href.startsWith("#") ||
      /^(mailto:|tel:|javascript:|data:)/i.test(href)
    ) {
      continue;
    }

    const normalized = normalizeUrl(href, base);
    if (!normalized) continue;

    const url = new URL(normalized);
    if (!sameSite(url, origin)) continue;
    if (SKIPPED_EXTENSIONS.test(url.pathname)) continue;

    links.add(normalized);
  }

  return [...links];
}

function textWordCount(html: string) {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ");

  const words = decodeEntities(text)
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

  return words.length;
}

function metaContent(html: string, name: string) {
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*\\bname\\s*=\\s*["']${name}["'][^>]*\\bcontent\\s*=\\s*["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta\\b[^>]*\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*\\bname\\s*=\\s*["']${name}["']`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return clean(match[1]);
  }
  return null;
}

function canonical(html: string, base: string) {
  const match =
    html.match(
      /<link\b[^>]*\brel\s*=\s*["']canonical["'][^>]*\bhref\s*=\s*["']([^"']+)["']/i,
    ) ??
    html.match(
      /<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\brel\s*=\s*["']canonical["']/i,
    );
  if (!match) return null;
  return normalizeUrl(match[1], base);
}

function parsePage(url: string, statusCode: number, html: string) {
  return {
    url,
    statusCode,
    title: clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
    metaDescription: metaContent(html, "description"),
    h1: clean(
      html
        .match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
        ?.replace(/<[^>]+>/g, " "),
    ),
    canonicalUrl: canonical(html, url),
    wordCount: textWordCount(html),
  } satisfies CrawledPage;
}

async function fetchPage(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "follow",
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") ?? "";
    const html = contentType.includes("text/html") ? await response.text() : "";
    return { status: response.status, html };
  } finally {
    clearTimeout(timer);
  }
}

/** Breadth-first walk from the homepage, capped at `MAX_PAGES`. */
export async function crawlSite(startUrl: string): Promise<CrawledPage[]> {
  const start = normalizeUrl(startUrl, startUrl);
  if (!start) throw new Error("The brand website URL is not a valid http(s) URL.");

  const origin = new URL(start);
  const queue = [start];
  const seen = new Set([start]);
  const pages: CrawledPage[] = [];

  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift()!;

    try {
      const { status, html } = await fetchPage(url);

      if (!html) {
        pages.push({
          url,
          statusCode: status,
          title: null,
          metaDescription: null,
          h1: null,
          canonicalUrl: null,
          wordCount: null,
        });
        continue;
      }

      pages.push(parsePage(url, status, html));

      if (status >= 200 && status < 300) {
        for (const link of extractLinks(html, url, origin)) {
          if (seen.size >= MAX_PAGES * 4) break;
          if (seen.has(link)) continue;
          seen.add(link);
          queue.push(link);
        }
      }
    } catch {
      // Unreachable page: record it so the audit shows the gap.
      pages.push({
        url,
        statusCode: null,
        title: null,
        metaDescription: null,
        h1: null,
        canonicalUrl: null,
        wordCount: null,
      });
    }
  }

  return pages;
}

export type PageIssues = {
  missingTitle: boolean;
  missingDescription: boolean;
  missingH1: boolean;
  duplicateTitle: boolean;
  badStatus: boolean;
};

/** Local, deterministic checks — no model involved. */
export function findIssues<T extends { title: string | null; metaDescription: string | null; h1: string | null; statusCode: number | null }>(
  pages: T[],
) {
  const titleCounts = new Map<string, number>();
  for (const page of pages) {
    const key = page.title?.trim().toLowerCase();
    if (key) titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  return pages.map((page) => {
    const key = page.title?.trim().toLowerCase();
    return {
      page,
      issues: {
        missingTitle: !page.title,
        missingDescription: !page.metaDescription,
        missingH1: !page.h1,
        duplicateTitle: Boolean(key && (titleCounts.get(key) ?? 0) > 1),
        badStatus: page.statusCode === null || page.statusCode >= 400,
      } satisfies PageIssues,
    };
  });
}
