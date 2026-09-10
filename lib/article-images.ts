/**
 * Where an article's images will live once published, and how they are
 * described to the image model. Nothing here writes to a repository: it only
 * computes the target paths that a later publishing step will honour.
 */

import type { ArticleImage } from "@/lib/publishing";

/** Panoramic banner, 3:1 — cropped from the widest size the provider offers. */
export const BANNER_WIDTH = 1536;
export const BANNER_HEIGHT = 512;

/**
 * The art direction for article covers and illustrations. Deliberately narrow:
 * the failure mode of image models is generic decoration, not a lack of ideas.
 */
export const ART_DIRECTION = [
  "Art direction: dark editorial, premium, restrained. The reference points are",
  "Apple, Medium and Tesla — not agency stock imagery.",
  "Palette: black, white and grey only, plus a single electric yellow accent",
  "#e8ff47 used sparingly, on one element at most.",
  "Composition: one strong idea, generous negative space, confident geometry.",
  "The image is a wide editorial banner: keep the subject centred and the top",
  "and bottom edges quiet, so a panoramic crop loses nothing.",
  "Forbidden: cyberpunk, neon cityscapes, cartoon or 3D mascots, smiling office",
  "stock photography, glowing brains, circuit boards, generic 'AI art' gradients,",
  "cluttered collages, watermarks, logos.",
  "No text in the image unless the concept is explicitly typographic.",
].join("\n");

function directory(publicRoute: string, slug: string) {
  const route = publicRoute.replace(/^\/+|\/+$/g, "");
  return route ? `${route}/${slug}` : slug;
}

/** `/blog/example-article/cover.png` — what the ArticlePackage carries. */
export function coverPublicPath(publicRoute: string, slug: string) {
  return `/${directory(publicRoute, slug)}/cover.png`;
}

/** `public/blog/example-article/cover.png` — where the file will be written. */
export function coverTargetPath(
  assetsDirectory: string,
  publicRoute: string,
  slug: string,
) {
  const assets = assetsDirectory.replace(/^\/+|\/+$/g, "");
  const route = publicRoute.replace(/^\/+|\/+$/g, "");
  // The assets directory already ends in the public route, e.g. `public/blog`.
  const base = assets.endsWith(`/${route}`) || assets === route
    ? assets
    : `${assets}/${route}`;
  return `${base}/${slug}/cover.png`;
}

export function inlineFileName(order: number) {
  return `illustration-${String(order).padStart(2, "0")}.png`;
}

export function inlinePublicPath(publicRoute: string, slug: string, order: number) {
  return `/${directory(publicRoute, slug)}/${inlineFileName(order)}`;
}

export function inlineTargetPath(
  assetsDirectory: string,
  publicRoute: string,
  slug: string,
  order: number,
) {
  return coverTargetPath(assetsDirectory, publicRoute, slug).replace(
    /cover\.png$/,
    inlineFileName(order),
  );
}

/** The Markdown a writer can paste into the body for an inline illustration. */
export function markdownFor(image: { alt: string; publicPath: string }) {
  return `![${image.alt}](${image.publicPath})`;
}

export type StoredImage = {
  kind: "COVER" | "INLINE";
  order: number;
  alt: string;
  blobUrl: string | null;
  publicPath: string;
};

/**
 * The ArticlePackage view of the stored images. Only rendered images count —
 * a suggestion without a file must never reach the package.
 */
export function toPackageImages(images: StoredImage[]) {
  const cover = images.find((image) => image.kind === "COVER" && image.blobUrl);
  const inline = images
    .filter((image) => image.kind === "INLINE" && image.blobUrl)
    .sort((a, b) => a.order - b.order);

  const shape = (image: StoredImage): ArticleImage => ({
    path: image.publicPath,
    alt: image.alt,
    ...(image.blobUrl ? { sourceUrl: image.blobUrl } : {}),
  });

  return {
    coverImage: cover ? shape(cover) : null,
    images: inline.map(shape),
  };
}
