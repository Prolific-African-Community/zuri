-- AlterTable
ALTER TABLE "ArticleDraft" ADD COLUMN     "unpublishBranch" TEXT,
ADD COLUMN     "unpublishPrNumber" INTEGER,
ADD COLUMN     "unpublishPrUrl" TEXT,
ADD COLUMN     "unpublishRequestedAt" TIMESTAMP(3),
ADD COLUMN     "unpublishUrlStatus" INTEGER,
ADD COLUMN     "unpublishedAt" TIMESTAMP(3);
