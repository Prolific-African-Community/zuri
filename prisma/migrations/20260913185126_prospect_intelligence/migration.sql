-- CreateTable
CREATE TABLE "ProspectIntelligence" (
    "id" TEXT NOT NULL,
    "prospectId" TEXT NOT NULL,
    "whyThisProspect" TEXT NOT NULL,
    "likelyPainPoints" JSONB NOT NULL,
    "qualificationPriorities" JSONB NOT NULL,
    "decisionMakers" JSONB NOT NULL,
    "recommendedContactId" TEXT,
    "entryPointRationale" TEXT NOT NULL,
    "commercialAngle" TEXT NOT NULL,
    "discoveryQuestions" JSONB NOT NULL,
    "gatekeeperScript" JSONB NOT NULL,
    "decisionMakerOpening" TEXT NOT NULL,
    "objections" JSONB NOT NULL,
    "negotiationLevers" JSONB NOT NULL,
    "estimatedTicketMin" INTEGER,
    "estimatedTicketMax" INTEGER,
    "estimatedTicketCurrency" TEXT,
    "estimatedTicketBasis" TEXT NOT NULL,
    "nextBestAction" TEXT NOT NULL,
    "nextBestActionRationale" TEXT NOT NULL,
    "fitScore" INTEGER NOT NULL,
    "fitConfidence" "SalesConfidence" NOT NULL,
    "fitExplanation" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProspectIntelligence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProspectIntelligence_prospectId_key" ON "ProspectIntelligence"("prospectId");

-- AddForeignKey
ALTER TABLE "ProspectIntelligence" ADD CONSTRAINT "ProspectIntelligence_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "Prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;
