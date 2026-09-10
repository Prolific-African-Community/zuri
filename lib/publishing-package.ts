/**
 * The final publishing package: the exact file that would be committed, the
 * exact assets that would go with it, and where all of it would land. It
 * decides nothing on its own — it assembles what the contract, the article and
 * the images already say, and reports what still blocks a review.
 */

import { createHash } from "node:crypto";

import { readImage, readImages, readLinks, toArticlePackage } from "@/lib/article";
import { coverPublicPath, inlinePublicPath } from "@/lib/article-images";
import {
  publishingConfig,
  validateArticlePackage,
  type ArticlePackage,
  type PublishingBrand,
} from "@/lib/publishing";

export type PackageImage = {
  kind: "COVER" | "INLINE";
  order: number;
  alt: string;
  caption: string | null;
  blobUrl: string | null;
  publicPath: string;
  targetPath: string;
};

export type PublishFile = {
  path: string;
  kind: "MDX" | "IMAGE";
  /** Where the bytes come from; the MDX file is generated, not fetched. */
  sourceUrl: string | null;
};

export type Destination = {
  brandName: string;
  repository: string;
  branch: string;
  contentPath: string;
  publicUrl: string;
};

export type PublishingPackage = {
  ready: boolean;
  errors: string[];
  article: ArticlePackage | null;
  mdx: string;
  files: PublishFile[];
  destination: Destination | null;
};

/* -------------------------------------------------------------------------- */
/* Serializer                                                                 */
/* -------------------------------------------------------------------------- */

function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Prolific Blog System v1 publishes dates as plain days. */
function isoDay(value: string) {
  return value.slice(0, 10);
}

/**
 * Produces the exact `content/blog/<slug>.mdx` file. Deterministic: the same
 * article always serializes byte for byte the same way.
 *
 * The frontmatter follows the brand's blog contract, which is not Zuri's:
 * `coverImage` is a path, `images` carry `src`/`alt`/`caption`, and
 * `internalLinks` are bare paths.
 */
export function serializeMdx(
  article: ArticlePackage,
  images: PackageImage[],
): string {
  const inline = images
    .filter((image) => image.kind === "INLINE" && image.blobUrl)
    .sort((a, b) => a.order - b.order);
  const cover = images.find((image) => image.kind === "COVER" && image.blobUrl);

  const lines: string[] = ["---"];
  lines.push(`title: ${quote(article.title)}`);
  lines.push(`slug: ${quote(article.slug)}`);
  lines.push(`excerpt: ${quote(article.excerpt)}`);
  lines.push(`author: ${quote(article.author)}`);
  lines.push(`publishedAt: ${quote(isoDay(article.publishedAt))}`);
  lines.push(`category: ${quote(article.category)}`);

  if (article.tags.length) {
    lines.push("tags:");
    for (const tag of article.tags) lines.push(`  - ${quote(tag)}`);
  } else {
    lines.push("tags: []");
  }

  lines.push(`targetKeyword: ${quote(article.targetKeyword)}`);
  lines.push(`metaTitle: ${quote(article.metaTitle)}`);
  lines.push(`metaDescription: ${quote(article.metaDescription)}`);
  lines.push(
    `canonicalUrl: ${article.canonicalUrl ? quote(article.canonicalUrl) : "null"}`,
  );
  lines.push(`coverImage: ${cover ? quote(cover.publicPath) : "null"}`);

  if (inline.length) {
    lines.push("images:");
    for (const image of inline) {
      lines.push(`  - src: ${quote(image.publicPath)}`);
      lines.push(`    alt: ${quote(image.alt)}`);
      if (image.caption) lines.push(`    caption: ${quote(image.caption)}`);
    }
  } else {
    lines.push("images: []");
  }

  if (article.internalLinks.length) {
    lines.push("internalLinks:");
    for (const link of article.internalLinks) lines.push(`  - ${quote(link.href)}`);
  } else {
    lines.push("internalLinks: []");
  }

  lines.push("---", "");

  return `${lines.join("\n")}\n${article.content.replace(/\r\n/g, "\n").trim()}\n`;
}

/* -------------------------------------------------------------------------- */
/* Package                                                                    */
/* -------------------------------------------------------------------------- */

export type PackageInput = {
  brand: PublishingBrand & { name: string; websiteUrl: string | null };
  asset: { title: string | null; content: string };
  draft: Parameters<typeof toArticlePackage>[1];
  images: {
    kind: "COVER" | "INLINE";
    order: number;
    alt: string;
    caption: string | null;
    blobUrl: string | null;
    targetPath: string;
  }[];
};

export function buildPublishingPackage(input: PackageInput): PublishingPackage {
  const errors: string[] = [];

  const config = publishingConfig(input.brand);
  if (!config.ok) {
    return {
      ready: false,
      errors: config.missing.map(
        (item) => `${input.brand.name} has no ${item} configured.`,
      ),
      article: null,
      mdx: "",
      files: [],
      destination: null,
    };
  }

  const { owner, repo, baseBranch, contentDirectory, publicRoute, extension } =
    config.config;
  const { slug } = input.draft;

  const validation = validateArticlePackage(toArticlePackage(input.asset, input.draft));
  if (!validation.ok) errors.push(...validation.errors);

  // Articles carry a banner and nothing else. Inline illustrations left in the
  // database by earlier versions are ignored rather than deleted.
  const images: PackageImage[] = input.images
    .filter((image) => image.kind === "COVER")
    .map((image) => ({
    kind: image.kind,
    order: image.order,
    alt: image.alt,
    caption: image.caption,
    blobUrl: image.blobUrl,
    publicPath:
      image.kind === "COVER"
        ? coverPublicPath(publicRoute, slug)
        : inlinePublicPath(publicRoute, slug, image.order),
    targetPath: image.targetPath,
  }));

  for (const image of images) {
    const label = image.kind === "COVER" ? "The cover" : `Illustration ${image.order}`;
    if (!image.blobUrl) errors.push(`${label} has been proposed but never rendered.`);
    if (!image.targetPath) errors.push(`${label} has no target path.`);
    if (!image.alt.trim()) errors.push(`${label} has no alt text.`);
  }

  const contentPath = `${contentDirectory}/${slug}.${extension}`;

  const files: PublishFile[] = [
    { path: contentPath, kind: "MDX", sourceUrl: null },
    ...images
      .filter((image) => image.blobUrl)
      .map<PublishFile>((image) => ({
        path: image.targetPath,
        kind: "IMAGE",
        sourceUrl: image.blobUrl,
      })),
  ];

  // Two files fighting over one path would silently overwrite each other.
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.path)) errors.push(`Two files target ${file.path}.`);
    seen.add(file.path);
  }

  const article = validation.ok ? validation.article : null;
  let mdx = "";
  if (article) {
    try {
      mdx = serializeMdx(article, images);
    } catch {
      errors.push("The article could not be serialized to MDX.");
    }
  }

  const site = (input.brand.websiteUrl ?? "").replace(/\/+$/, "");
  const destination: Destination = {
    brandName: input.brand.name,
    repository: `${owner}/${repo}`,
    branch: baseBranch ?? "the repository default",
    contentPath,
    publicUrl: `${site}${publicRoute === "/" ? "" : publicRoute}/${slug}`,
  };

  return { ready: errors.length === 0, errors, article, mdx, files, destination };
}

/** Re-exported so callers read image and link shapes from one place. */
export { readImage, readImages, readLinks };

/* -------------------------------------------------------------------------- */
/* Publishing safety and identity                                             */
/* -------------------------------------------------------------------------- */

/**
 * A path is only writable when it sits inside one of the two directories the
 * brand declared. Anything else - traversal, absolute paths, a stray config
 * file - is refused before a single byte reaches GitHub.
 */
export function isWritablePublishPath(
  path: string,
  contentDirectory: string,
  assetsDirectory: string,
) {
  if (!path || path.startsWith("/") || path.includes("..")) return false;
  if (path.includes("\\")) return false;
  return (
    path.startsWith(`${contentDirectory}/`) || path.startsWith(`${assetsDirectory}/`)
  );
}

/**
 * Fingerprints exactly what would be published. Comparing it to the value
 * stored when the PR was opened is how "changed since the PR" is known.
 */
export function packageFingerprint(pkg: PublishingPackage) {
  return createHash("sha256")
    .update(pkg.mdx)
    .update(
      pkg.files
        .map((file) => `${file.path}:${file.sourceUrl ?? ""}`)
        .sort()
        .join("|"),
    )
    .digest("hex");
}
