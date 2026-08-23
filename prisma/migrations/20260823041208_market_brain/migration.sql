-- CreateEnum
CREATE TYPE "MarketSignalType" AS ENUM ('NEWS', 'COMPETITOR', 'SEARCH', 'MARKET', 'INTERNAL');

-- CreateEnum
CREATE TYPE "MarketSignalStatus" AS ENUM ('NEW', 'REVIEWED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "OpportunitySource" AS ENUM ('MANUAL', 'OBSERVATION', 'SIGNAL', 'COMPETITOR');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketSignal" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "type" "MarketSignalType" NOT NULL DEFAULT 'MARKET',
    "status" "MarketSignalStatus" NOT NULL DEFAULT 'NEW',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketSignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "source" "OpportunitySource" NOT NULL DEFAULT 'MANUAL',
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competitor_brandId_idx" ON "Competitor"("brandId");

-- CreateIndex
CREATE INDEX "MarketSignal_brandId_idx" ON "MarketSignal"("brandId");

-- CreateIndex
CREATE INDEX "Opportunity_brandId_idx" ON "Opportunity"("brandId");

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketSignal" ADD CONSTRAINT "MarketSignal_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
