-- CreateEnum
CREATE TYPE "ArticleReviewStatus" AS ENUM ('DRAFT', 'READY_FOR_REVIEW');

-- AlterTable
ALTER TABLE "ArticleDraft" ADD COLUMN     "reviewStatus" "ArticleReviewStatus" NOT NULL DEFAULT 'DRAFT';
