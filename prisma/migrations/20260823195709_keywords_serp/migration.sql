-- CreateTable
CREATE TABLE "Keyword" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "searchVolume" INTEGER,
    "difficulty" INTEGER,
    "intent" TEXT,
    "priorityScore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SerpCompetitor" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "keywordId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "url" TEXT,
    "title" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SerpCompetitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Keyword_brandId_idx" ON "Keyword"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_brandId_keyword_key" ON "Keyword"("brandId", "keyword");

-- CreateIndex
CREATE INDEX "SerpCompetitor_brandId_idx" ON "SerpCompetitor"("brandId");

-- CreateIndex
CREATE INDEX "SerpCompetitor_keywordId_idx" ON "SerpCompetitor"("keywordId");

-- AddForeignKey
ALTER TABLE "Keyword" ADD CONSTRAINT "Keyword_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpCompetitor" ADD CONSTRAINT "SerpCompetitor_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SerpCompetitor" ADD CONSTRAINT "SerpCompetitor_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
