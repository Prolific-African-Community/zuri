-- CreateTable
CREATE TABLE "SeoBrief" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "targetKeyword" TEXT,
    "searchIntent" TEXT,
    "recommendedAction" "SeoActionType" NOT NULL,
    "actionJustification" TEXT,
    "recommendedTitle" TEXT,
    "recommendedMetaDescription" TEXT,
    "outline" TEXT[],
    "keyQuestions" TEXT[],
    "internalLinks" TEXT[],
    "competitorInsights" TEXT[],
    "evidenceNeeded" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeoBrief_opportunityId_key" ON "SeoBrief"("opportunityId");

-- CreateIndex
CREATE INDEX "SeoBrief_brandId_idx" ON "SeoBrief"("brandId");

-- AddForeignKey
ALTER TABLE "SeoBrief" ADD CONSTRAINT "SeoBrief_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoBrief" ADD CONSTRAINT "SeoBrief_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
