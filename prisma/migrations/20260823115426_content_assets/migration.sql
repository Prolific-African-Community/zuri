-- CreateEnum
CREATE TYPE "ContentChannel" AS ENUM ('LINKEDIN');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('SOCIAL_POST');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'APPROVED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ContentAsset" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "channel" "ContentChannel" NOT NULL DEFAULT 'LINKEDIN',
    "type" "ContentType" NOT NULL DEFAULT 'SOCIAL_POST',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentAsset_brandId_idx" ON "ContentAsset"("brandId");

-- CreateIndex
CREATE INDEX "ContentAsset_opportunityId_idx" ON "ContentAsset"("opportunityId");

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;
