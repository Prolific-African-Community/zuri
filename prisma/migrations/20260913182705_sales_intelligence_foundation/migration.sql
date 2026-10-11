-- CreateEnum
CREATE TYPE "SalesCampaignStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SalesConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ProspectPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('DISCOVERED', 'QUALIFIED', 'TO_CONTACT', 'CONTACTED', 'FOLLOW_UP', 'MEETING_BOOKED', 'DISCOVERY_COMPLETED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "ProspectResearchStatus" AS ENUM ('NOT_RESEARCHED', 'RESEARCHING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('FACT', 'INFERENCE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ContactDecisionRole" AS ENUM ('DECISION_MAKER', 'CHAMPION', 'USER', 'INFLUENCER', 'GATEKEEPER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('CALL', 'EMAIL', 'MEETING', 'LINKEDIN', 'NOTE', 'OTHER');

-- CreateTable
CREATE TABLE "SalesCampaign" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "offer" TEXT NOT NULL,
    "description" TEXT,
    "geography" TEXT[],
    "industries" TEXT[],
    "targetCompanySize" TEXT,
    "idealCustomerProfile" TEXT NOT NULL DEFAULT '',
    "painPoints" TEXT[],
    "valueProposition" TEXT NOT NULL DEFAULT '',
    "primaryAngle" TEXT NOT NULL DEFAULT '',
    "targetTicketMin" INTEGER,
    "targetTicketMax" INTEGER,
    "currency" TEXT,
    "preferredProfile" TEXT[],
    "exclusions" TEXT[],
    "scoringCriteria" JSONB NOT NULL DEFAULT '[]',
    "status" "SalesCampaignStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prospect" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "country" TEXT,
    "city" TEXT,
    "industry" TEXT,
    "description" TEXT,
    "employeeCount" INTEGER,
    "revenue" TEXT,
    "fleetSize" INTEGER,
    "activities" TEXT[],
    "locations" TEXT[],
    "linkedinUrl" TEXT,
    "digitalMaturityScore" INTEGER,
    "detectedTools" TEXT[],
    "tms" TEXT,
    "erp" TEXT,
    "crm" TEXT,
    "telematics" TEXT,
    "clientPortal" TEXT,
    "driverApp" TEXT,
    "visibleAutomations" TEXT[],
    "fitScore" INTEGER,
    "fitConfidence" "SalesConfidence" NOT NULL DEFAULT 'LOW',
    "fitExplanation" JSONB,
    "priority" "ProspectPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ProspectStatus" NOT NULL DEFAULT 'DISCOVERED',
    "lastContactAt" TIMESTAMP(3),
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "owner" TEXT,
    "notes" TEXT,
    "researchedAt" TIMESTAMP(3),
    "researchStatus" "ProspectResearchStatus" NOT NULL DEFAULT 'NOT_RESEARCHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Prospect_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectEvidence" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "category" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "evidenceExcerpt" TEXT,
    "observedAt" TIMESTAMP(3),
    "confidence" "SalesConfidence" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectContact" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "jobTitle" TEXT,
    "seniority" TEXT,
    "decisionRole" "ContactDecisionRole" NOT NULL DEFAULT 'UNKNOWN',
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "sourceUrl" TEXT,
    "sourceName" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "confidence" "SalesConfidence" NOT NULL DEFAULT 'MEDIUM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProspectInteraction" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "contactId" TEXT,
    "type" "InteractionType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "rawNote" TEXT NOT NULL,
    "structuredSummary" TEXT,
    "createdFacts" JSONB,
    "previousStatus" "ProspectStatus",
    "resultingStatus" "ProspectStatus",
    "nextAction" TEXT,
    "nextActionAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProspectInteraction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesCampaign_brandId_idx" ON "SalesCampaign"("brandId");

-- CreateIndex
CREATE INDEX "Prospect_brandId_idx" ON "Prospect"("brandId");

-- CreateIndex
CREATE INDEX "Prospect_campaignId_idx" ON "Prospect"("campaignId");

-- CreateIndex
CREATE INDEX "ProspectEvidence_prospectId_idx" ON "ProspectEvidence"("prospectId");

-- CreateIndex
CREATE INDEX "ProspectContact_prospectId_idx" ON "ProspectContact"("prospectId");

-- CreateIndex
CREATE INDEX "ProspectInteraction_prospectId_idx" ON "ProspectInteraction"("prospectId");

-- AddForeignKey
ALTER TABLE "SalesCampaign" ADD CONSTRAINT "SalesCampaign_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SalesCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prospect" ADD CONSTRAINT "Prospect_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectEvidence" ADD CONSTRAINT "ProspectEvidence_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectContact" ADD CONSTRAINT "ProspectContact_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectInteraction" ADD CONSTRAINT "ProspectInteraction_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProspectInteraction" ADD CONSTRAINT "ProspectInteraction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "ProspectContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
