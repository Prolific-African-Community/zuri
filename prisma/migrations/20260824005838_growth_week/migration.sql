-- CreateTable
CREATE TABLE "GrowthWeekPlan" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthWeekPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthWeekItem" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "opportunityId" TEXT,
    "contentAssetId" TEXT,

    CONSTRAINT "GrowthWeekItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GrowthWeekPlan_brandId_idx" ON "GrowthWeekPlan"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthWeekPlan_brandId_weekStart_key" ON "GrowthWeekPlan"("brandId", "weekStart");

-- CreateIndex
CREATE INDEX "GrowthWeekItem_planId_idx" ON "GrowthWeekItem"("planId");

-- AddForeignKey
ALTER TABLE "GrowthWeekPlan" ADD CONSTRAINT "GrowthWeekPlan_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthWeekItem" ADD CONSTRAINT "GrowthWeekItem_planId_fkey" FOREIGN KEY ("planId") REFERENCES "GrowthWeekPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthWeekItem" ADD CONSTRAINT "GrowthWeekItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthWeekItem" ADD CONSTRAINT "GrowthWeekItem_contentAssetId_fkey" FOREIGN KEY ("contentAssetId") REFERENCES "ContentAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
