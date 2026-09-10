-- CreateTable
CREATE TABLE "WebsitePage" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "metaDescription" TEXT,
    "h1" TEXT,
    "statusCode" INTEGER,
    "canonicalUrl" TEXT,
    "wordCount" INTEGER,
    "lastCrawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsitePage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsitePage_brandId_idx" ON "WebsitePage"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsitePage_brandId_url_key" ON "WebsitePage"("brandId", "url");

-- AddForeignKey
ALTER TABLE "WebsitePage" ADD CONSTRAINT "WebsitePage_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
