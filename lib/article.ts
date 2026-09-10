/**
 * Bridges a stored draft and the publishing contract: assembles the
 * `ArticlePackage`, and parses the plain-text shapes the editor uses for the
 * list fields. The contract itself is not touched here.
 */

import type { ArticleImage, InternalLink } from "@/lib/publishing";

export type ArticleDraftLike = {
  slug: string;
  excerpt: string;
  author: string;
  publishedAt: Date | null;
  category: string;
  tags: string[];
  targetKeyword: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string | null;
  coverImage: unknown;
  images: unknown;
  internalLinks: unknown;
};

export type ArticleAssetLike = { title: string | null; content: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readImage(value: unknown): ArticleImage | null {
  if (!isRecord(value)) return null;
  const path = typeof value.path === "string" ? value.path : "";
  const alt = typeof value.alt === "string" ? value.alt : "";
  const sourceUrl = typeof value.sourceUrl === "string" ? value.sourceUrl : "";
  return { path, alt, ...(sourceUrl ? { sourceUrl } : {}) };
}

export function readImages(value: unknown): ArticleImage[] {
  return Array.isArray(value)
    ? value.map(readImage).filter((image): image is ArticleImage => image !== null)
    : [];
}

export function readLinks(value: unknown): InternalLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((entry) => ({
    href: typeof entry.href === "string" ? entry.href : "",
    anchor: typeof entry.anchor === "string" ? entry.anchor : "",
  }));
}

/** Shaped for `validateArticlePackage`, which decides whether it is valid. */
export function toArticlePackage(
  asset: ArticleAssetLike,
  draft: ArticleDraftLike,
) {
  return {
    title: asset.title ?? "",
    slug: draft.slug,
    excerpt: draft.excerpt,
    content: asset.content,
    author: draft.author,
    publishedAt: draft.publishedAt ? draft.publishedAt.toISOString() : "",
    category: draft.category,
    tags: draft.tags,
    targetKeyword: draft.targetKeyword,
    metaTitle: draft.metaTitle,
    metaDescription: draft.metaDescription,
    canonicalUrl: draft.canonicalUrl,
    coverImage: draft.coverImage == null ? null : readImage(draft.coverImage),
    images: readImages(draft.images),
    internalLinks: readLinks(draft.internalLinks),
  };
}

/* -------------------------------------------------------------------------- */
/* Editor text formats — one entry per line, fields separated by a pipe        */
/* -------------------------------------------------------------------------- */

function cells(line: string) {
  return line.split("|").map((cell) => cell.trim());
}

function lines(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

/** `path | alt | source url` — the source URL is optional. */
export function parseImage(value: string): ArticleImage | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const [path = "", alt = "", sourceUrl = ""] = cells(trimmed);
  return { path, alt, ...(sourceUrl ? { sourceUrl } : {}) };
}

export function parseImages(value: string): ArticleImage[] {
  return lines(value)
    .map(parseImage)
    .filter((image): image is ArticleImage => image !== null);
}

/** `/path | anchor text` */
export function parseLinks(value: string): InternalLink[] {
  return lines(value).map((line) => {
    const [href = "", anchor = ""] = cells(line);
    return { href, anchor };
  });
}

export function formatImage(image: ArticleImage | null) {
  if (!image) return "";
  return [image.path, image.alt, image.sourceUrl].filter(Boolean).join(" | ");
}

export function formatImages(images: ArticleImage[]) {
  return images.map(formatImage).join("\n");
}

export function formatLinks(links: InternalLink[]) {
  return links.map((link) => `${link.href} | ${link.anchor}`).join("\n");
}

/** `<input type="datetime-local">` wants a local, second-less value. */
export function toDateTimeLocal(date: Date | null) {
  if (!date) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
