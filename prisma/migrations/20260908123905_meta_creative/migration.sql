-- CreateTable
CREATE TABLE "MetaCreative" (
    "id" TEXT NOT NULL,
    "contentAssetId" TEXT NOT NULL,
    "hook" TEXT NOT NULL DEFAULT '',
    "copy" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "visualRecommendation" TEXT NOT NULL DEFAULT 'NONE',
    "imagePrompt" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "brief" JSONB,
    "productionPrompt" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCreative_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaCreative_contentAssetId_key" ON "MetaCreative"("contentAssetId");

-- AddForeignKey
ALTER TABLE "MetaCreative" ADD CONSTRAINT "MetaCreative_contentAssetId_fkey" FOREIGN KEY ("contentAssetId") REFERENCES "ContentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
