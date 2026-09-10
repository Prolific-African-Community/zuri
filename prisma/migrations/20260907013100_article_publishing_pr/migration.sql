-- AlterEnum
ALTER TYPE "ArticleReviewStatus" ADD VALUE 'PR_OPENED';

-- AlterTable
ALTER TABLE "ArticleDraft" ADD COLUMN     "prNumber" INTEGER,
ADD COLUMN     "prOpenedAt" TIMESTAMP(3),
ADD COLUMN     "prPackageHash" TEXT,
ADD COLUMN     "prUrl" TEXT,
ADD COLUMN     "publishingBranch" TEXT;
