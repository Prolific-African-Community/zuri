-- Drop the legacy ARCHIVED values. Both had zero rows and zero code readers:
-- archiving is `ContentAsset.archivedAt`, publication is `publicationState`.
-- PostgreSQL cannot remove an enum value in place, so each type is rewritten.

ALTER TYPE "ContentStatus" RENAME TO "ContentStatus_old";
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'APPROVED');
ALTER TABLE "ContentAsset" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ContentAsset" ALTER COLUMN "status" TYPE "ContentStatus" USING ("status"::text::"ContentStatus");
ALTER TABLE "ContentAsset" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
DROP TYPE "ContentStatus_old";

ALTER TYPE "ArticleReviewStatus" RENAME TO "ArticleReviewStatus_old";
CREATE TYPE "ArticleReviewStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW', 'PR_OPENED', 'PUBLISHED', 'NEEDS_UPDATE');
ALTER TABLE "ArticleDraft" ALTER COLUMN "reviewStatus" DROP DEFAULT;
ALTER TABLE "ArticleDraft" ALTER COLUMN "reviewStatus" TYPE "ArticleReviewStatus" USING ("reviewStatus"::text::"ArticleReviewStatus");
ALTER TABLE "ArticleDraft" ALTER COLUMN "reviewStatus" SET DEFAULT 'DRAFT';
DROP TYPE "ArticleReviewStatus_old";
