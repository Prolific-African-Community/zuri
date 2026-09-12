-- CreateEnum
CREATE TYPE "ArticlePublicationState" AS ENUM ('NEVER_PUBLISHED', 'PUBLISHING', 'PUBLISHED', 'UNPUBLISHING', 'UNPUBLISHED');

-- AlterTable
ALTER TABLE "ArticleDraft" ADD COLUMN     "lastPublishMergeCommitSha" TEXT,
ADD COLUMN     "lastUnpublishMergeCommitSha" TEXT,
ADD COLUMN     "publicationState" "ArticlePublicationState" NOT NULL DEFAULT 'NEVER_PUBLISHED';

-- AlterTable
ALTER TABLE "ContentAsset" ADD COLUMN     "archivedAt" TIMESTAMP(3);

-- Backfill: publication state, in the deterministic order unpublished > published > never.
UPDATE "ArticleDraft" SET "publicationState" = 'UNPUBLISHED'
WHERE "unpublishedAt" IS NOT NULL;

UPDATE "ArticleDraft" SET "publicationState" = 'PUBLISHED'
WHERE "unpublishedAt" IS NULL
  AND ("publishedUrl" IS NOT NULL
       OR ("mergedAt" IS NOT NULL AND "reviewStatus" IN ('PUBLISHED', 'NEEDS_UPDATE')));

-- Backfill: split the single mergeCommitSha by which merge wrote it last.
UPDATE "ArticleDraft" SET "lastUnpublishMergeCommitSha" = "mergeCommitSha"
WHERE "mergeCommitSha" IS NOT NULL AND "unpublishRequestedAt" IS NOT NULL;

UPDATE "ArticleDraft" SET "lastPublishMergeCommitSha" = "mergeCommitSha"
WHERE "mergeCommitSha" IS NOT NULL AND "unpublishRequestedAt" IS NULL;

-- Backfill: archive shelf. `status` is deliberately left as-is, so no previous
-- editorial status is guessed; the archive actions stop writing it in a later run.
UPDATE "ContentAsset" SET "archivedAt" = "updatedAt"
WHERE "status" = 'ARCHIVED' AND "archivedAt" IS NULL;
