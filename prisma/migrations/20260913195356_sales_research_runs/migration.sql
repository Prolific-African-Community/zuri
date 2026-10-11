-- CreateEnum
CREATE TYPE "SourceQuality" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "SalesResearchRunStatus" AS ENUM ('RUNNING', 'COMPLETE', 'FAILED');

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "normalizedDomain" TEXT,
ADD COLUMN     "researchRunId" TEXT;

-- AlterTable
ALTER TABLE "ProspectEvidence" ADD COLUMN     "sourceQuality" "SourceQuality";

-- CreateTable
CREATE TABLE "SalesResearchRun" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "requestedCount" INTEGER NOT NULL,
    "geographyOverride" TEXT,
    "industryOverride" TEXT,
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "researchedCount" INTEGER NOT NULL DEFAULT 0,
    "savedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SalesResearchRunStatus" NOT NULL DEFAULT 'RUNNING',
    "stage" TEXT NOT NULL DEFAULT 'Starting',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "summary" JSONB,

    CONSTRAINT "SalesResearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesResearchRun_campaignId_idx" ON "SalesResearchRun"("campaignId");

-- CreateIndex
CREATE INDEX "Prospect_normalizedDomain_idx" ON "Prospect"("normalizedDomain");

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "SalesResearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesResearchRun" ADD CONSTRAINT "SalesResearchRun_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
