-- CreateEnum
CREATE TYPE "AdsLevel" AS ENUM ('CAMPAIGN', 'AD_GROUP', 'KEYWORD', 'SEARCH_TERM');

-- CreateTable
CREATE TABLE "AdsSync" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "costMicros" BIGINT NOT NULL,
    "conversions" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdsSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdsRow" (
    "id" TEXT NOT NULL,
    "syncId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "level" "AdsLevel" NOT NULL,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "adGroupId" TEXT,
    "adGroupName" TEXT,
    "text" TEXT,
    "matchType" TEXT,
    "status" TEXT,
    "impressions" INTEGER NOT NULL,
    "clicks" INTEGER NOT NULL,
    "costMicros" BIGINT NOT NULL,
    "conversions" DOUBLE PRECISION NOT NULL,
    "keywordId" TEXT,

    CONSTRAINT "AdsRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdsSync_brandId_idx" ON "AdsSync"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "AdsSync_brandId_customerId_startDate_endDate_key" ON "AdsSync"("brandId", "customerId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "AdsRow_syncId_idx" ON "AdsRow"("syncId");

-- CreateIndex
CREATE INDEX "AdsRow_brandId_idx" ON "AdsRow"("brandId");

-- CreateIndex
CREATE INDEX "AdsRow_level_idx" ON "AdsRow"("level");

-- AddForeignKey
ALTER TABLE "AdsSync" ADD CONSTRAINT "AdsSync_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdsRow" ADD CONSTRAINT "AdsRow_syncId_fkey" FOREIGN KEY ("syncId") REFERENCES "AdsSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdsRow" ADD CONSTRAINT "AdsRow_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdsRow" ADD CONSTRAINT "AdsRow_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;
