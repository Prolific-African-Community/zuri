-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ArticleReviewStatus" ADD VALUE 'PUBLISHED';
ALTER TYPE "ArticleReviewStatus" ADD VALUE 'NEEDS_UPDATE';
ALTER TYPE "ArticleReviewStatus" ADD VALUE 'ARCHIVED';

-- AlterTable
ALTER TABLE "ArticleDraft" ADD COLUMN     "mergedAt" TIMESTAMP(3),
ADD COLUMN     "prClosedWithoutMerge" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publishedPackageHash" TEXT,
ADD COLUMN     "publishedUrl" TEXT;
