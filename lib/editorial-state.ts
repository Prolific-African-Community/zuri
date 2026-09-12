/**
 * The three orthogonal axes of an editorial record, read in one place.
 *
 * - archive     → `ContentAsset.archivedAt`
 * - publication → `ArticleDraft.publicationState`
 * - readiness   → `ArticleDraft.reviewStatus`
 *
 * Publication is never inferred from `publishedUrl`, `mergedAt`, `reviewStatus`
 * or `ContentAsset.status`: those stay workflow metadata.
 */

import { ArticlePublicationState } from "@/lib/generated/prisma/enums";

export function isArchived(asset: { archivedAt: Date | null }): boolean {
  return asset.archivedAt !== null;
}

export function isPublished(draft: {
  publicationState: ArticlePublicationState;
}): boolean {
  return draft.publicationState === ArticlePublicationState.PUBLISHED;
}

export function isUnpublished(draft: {
  publicationState: ArticlePublicationState;
}): boolean {
  return draft.publicationState === ArticlePublicationState.UNPUBLISHED;
}

/** True while a publish or unpublish PR is merged but not confirmed deployed. */
export function isPublicationInFlight(draft: {
  publicationState: ArticlePublicationState;
}): boolean {
  return (
    draft.publicationState === ArticlePublicationState.PUBLISHING ||
    draft.publicationState === ArticlePublicationState.UNPUBLISHING
  );
}
