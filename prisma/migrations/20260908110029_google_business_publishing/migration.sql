-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "googleBusinessAccountId" TEXT,
ADD COLUMN     "googleBusinessLocationId" TEXT,
ADD COLUMN     "googleBusinessLocationName" TEXT;

-- AlterTable
ALTER TABLE "ContentAsset" ADD COLUMN     "googleBusinessError" TEXT,
ADD COLUMN     "googleBusinessPostName" TEXT,
ADD COLUMN     "googleBusinessPublishedAt" TIMESTAMP(3);
