/**
 * The publishing contract. One shape for an article, whatever the brand, and
 * one place that says whether a brand can receive it. Nothing here writes
 * anywhere — it only describes and validates.
 */

import type { ContentFormat, PublishingMode } from "@/lib/generated/prisma/enums";

/* -------------------------------------------------------------------------- */
/* The package                                                                */
/* -------------------------------------------------------------------------- */

export type ArticleImage = {
  /** Where the file will live once published, relative to the public route. */
  path: string;
  alt: string;
  /** Absolute URL of the source file, when it still lives outside the repo. */
  sourceUrl?: string;
};

export type InternalLink = {
  /** Site-relative path, e.g. "/blog/automate-financial-reporting". */
  href: string;
  anchor: string;
};

export type ArticlePackage = {
  title: string;
  slug: string;
  excerpt: string;
  /** The body, in the brand's `contentFormat`. Front matter is added later. */
  content: string;
  author: string;
  publishedAt: string;
  category: string;
  tags: string[];
  targetKeyword: string;
  metaTitle: string;
  metaDescription: string;
  canonicalUrl: string | null;
  coverImage: ArticleImage | null;
  images: ArticleImage[];
  internalLinks: InternalLink[];
};

/* -------------------------------------------------------------------------- */
/* Brand configuration                                                        */
/* -------------------------------------------------------------------------- */

export type PublishingBrand = {
  githubOwner: string | null;
  githubRepo: string | null;
  githubBranch: string | null;
  contentFormat: ContentFormat;
  contentDirectory: string | null;
  publicRoute: string | null;
  assetsDirectory: string | null;
  defaultBranch: string | null;
  publishingMode: PublishingMode;
};

export type PublishingConfig = {
  owner: string;
  repo: string;
  /** `defaultBranch` wins; `githubBranch` stays the fallback it always was. */
  baseBranch: string | null;
  format: ContentFormat;
  extension: "mdx" | "md";
  contentDirectory: string;
  publicRoute: string;
  assetsDirectory: string;
  mode: PublishingMode;
};

/** Trailing and leading slashes are noise — every path is stored normalized. */
export function normalizeDirectory(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

export function normalizeRoute(value: string) {
  const trimmed = normalizeDirectory(value);
  return trimmed ? `/${trimmed}` : "/";
}

/**
 * Everything a publisher needs, or a list of what the brand is still missing.
 * A brand is only publishable once all of it is set.
 */
export function publishingConfig(
  brand: PublishingBrand,
): { ok: true; config: PublishingConfig } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  if (!brand.githubOwner) missing.push("GitHub owner");
  if (!brand.githubRepo) missing.push("GitHub repo");
  if (!brand.contentDirectory) missing.push("content directory");
  if (!brand.publicRoute) missing.push("public route");
  if (!brand.assetsDirectory) missing.push("assets directory");
  if (missing.length) return { ok: false, missing };

  return {
    ok: true,
    config: {
      owner: brand.githubOwner!,
      repo: brand.githubRepo!,
      baseBranch: brand.defaultBranch ?? brand.githubBranch,
      format: brand.contentFormat,
      extension: brand.contentFormat === "MARKDOWN" ? "md" : "mdx",
      contentDirectory: normalizeDirectory(brand.contentDirectory!),
      publicRoute: normalizeRoute(brand.publicRoute!),
      assetsDirectory: normalizeDirectory(brand.assetsDirectory!),
      mode: brand.publishingMode,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+Z?)?$/;

/** Google truncates beyond roughly these lengths, so they are hard limits. */
export const META_TITLE_MAX = 70;
export const META_DESCRIPTION_MAX = 165;

export type ValidationResult =
  | { ok: true; article: ArticlePackage }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Strict on purpose: an article that fails here must never reach a repository,
 * because a broken front matter breaks the whole site build.
 */
export function validateArticlePackage(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, errors: ["The article is not an object."] };
  }

  const required = {
    title: str(input.title),
    slug: str(input.slug),
    excerpt: str(input.excerpt),
    content: typeof input.content === "string" ? input.content : "",
    author: str(input.author),
    publishedAt: str(input.publishedAt),
    category: str(input.category),
    targetKeyword: str(input.targetKeyword),
    metaTitle: str(input.metaTitle),
    metaDescription: str(input.metaDescription),
  };

  for (const [field, value] of Object.entries(required)) {
    if (!value.trim()) errors.push(`${field} is required.`);
  }

  if (required.slug && !SLUG.test(required.slug)) {
    errors.push("slug must be lowercase words separated by single dashes.");
  }
  if (required.publishedAt && !ISO_DATE.test(required.publishedAt)) {
    errors.push("publishedAt must be an ISO date.");
  }
  if (required.metaTitle.length > META_TITLE_MAX) {
    errors.push(`metaTitle must be at most ${META_TITLE_MAX} characters.`);
  }
  if (required.metaDescription.length > META_DESCRIPTION_MAX) {
    errors.push(
      `metaDescription must be at most ${META_DESCRIPTION_MAX} characters.`,
    );
  }
  if (required.content && required.content.trim().length < 200) {
    errors.push("content is too short to be an article.");
  }

  const tags = Array.isArray(input.tags) ? input.tags.map(str) : null;
  if (!tags || !tags.length || tags.some((tag) => !tag)) {
    errors.push("tags must be a non-empty array of non-empty strings.");
  }

  const canonicalUrl = input.canonicalUrl == null ? null : str(input.canonicalUrl);
  if (canonicalUrl !== null && !/^https?:\/\//.test(canonicalUrl)) {
    errors.push("canonicalUrl must be an absolute URL or null.");
  }

  function image(value: unknown, field: string): ArticleImage | null {
    if (!isRecord(value)) {
      errors.push(`${field} must be an object.`);
      return null;
    }
    const path = str(value.path);
    const alt = str(value.alt);
    if (!path) errors.push(`${field}.path is required.`);
    if (!alt) errors.push(`${field}.alt is required — images are never unlabelled.`);
    const sourceUrl = value.sourceUrl == null ? undefined : str(value.sourceUrl);
    if (sourceUrl !== undefined && !/^https?:\/\//.test(sourceUrl)) {
      errors.push(`${field}.sourceUrl must be an absolute URL.`);
    }
    return { path, alt, ...(sourceUrl ? { sourceUrl } : {}) };
  }

  const coverImage =
    input.coverImage == null ? null : image(input.coverImage, "coverImage");

  const rawImages = Array.isArray(input.images) ? input.images : null;
  if (!rawImages) errors.push("images must be an array.");
  const images = (rawImages ?? [])
    .map((value, index) => image(value, `images[${index}]`))
    .filter((value): value is ArticleImage => value !== null);

  const rawLinks = Array.isArray(input.internalLinks) ? input.internalLinks : null;
  if (!rawLinks) errors.push("internalLinks must be an array.");
  const internalLinks: InternalLink[] = [];
  for (const [index, value] of (rawLinks ?? []).entries()) {
    if (!isRecord(value)) {
      errors.push(`internalLinks[${index}] must be an object.`);
      continue;
    }
    const href = str(value.href);
    const anchor = str(value.anchor);
    if (!href.startsWith("/")) {
      errors.push(`internalLinks[${index}].href must be a site-relative path.`);
    }
    if (!anchor) errors.push(`internalLinks[${index}].anchor is required.`);
    internalLinks.push({ href, anchor });
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    article: {
      ...required,
      tags: tags!,
      canonicalUrl,
      coverImage,
      images,
      internalLinks,
    },
  };
}
