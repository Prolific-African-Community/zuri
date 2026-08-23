-- CreateEnum
CREATE TYPE "VisualType" AS ENUM ('NONE', 'STATEMENT', 'FAKE_DOCUMENT', 'EDITORIAL');

-- CreateEnum
CREATE TYPE "VisualStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "VisualAsset" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "contentAssetId" TEXT,
    "type" "VisualType" NOT NULL DEFAULT 'NONE',
    "status" "VisualStatus" NOT NULL DEFAULT 'DRAFT',
    "reason" TEXT,
    "concept" TEXT,
    "prompt" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisualAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VisualAsset_contentAssetId_key" ON "VisualAsset"("contentAssetId");

-- CreateIndex
CREATE INDEX "VisualAsset_brandId_idx" ON "VisualAsset"("brandId");

-- AddForeignKey
ALTER TABLE "VisualAsset" ADD CONSTRAINT "VisualAsset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualAsset" ADD CONSTRAINT "VisualAsset_contentAssetId_fkey" FOREIGN KEY ("contentAssetId") REFERENCES "ContentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
