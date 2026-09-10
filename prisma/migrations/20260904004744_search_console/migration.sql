-- CreateEnum
CREATE TYPE "SearchConsoleDimension" AS ENUM ('QUERY', 'PAGE');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "searchConsoleProperty" TEXT;

-- CreateTable
CREATE TABLE "GoogleConnection" (
    "id" TEXT NOT NULL DEFAULT 'google',
    "email" TEXT,
    "scope" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchConsoleSync" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "property" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchConsoleSync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchConsoleRow" (
    "id" TEXT NOT NULL,
    "syncId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "dimension" "SearchConsoleDimension" NOT NULL,
    "value" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL,
    "impressions" INTEGER NOT NULL,
    "ctr" DOUBLE PRECISION NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "keywordId" TEXT,
    "websitePageId" TEXT,

    CONSTRAINT "SearchConsoleRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SearchConsoleSync_brandId_idx" ON "SearchConsoleSync"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "SearchConsoleSync_brandId_startDate_endDate_key" ON "SearchConsoleSync"("brandId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "SearchConsoleRow_syncId_idx" ON "SearchConsoleRow"("syncId");

-- CreateIndex
CREATE INDEX "SearchConsoleRow_brandId_idx" ON "SearchConsoleRow"("brandId");

-- AddForeignKey
ALTER TABLE "SearchConsoleSync" ADD CONSTRAINT "SearchConsoleSync_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchConsoleRow" ADD CONSTRAINT "SearchConsoleRow_syncId_fkey" FOREIGN KEY ("syncId") REFERENCES "SearchConsoleSync"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchConsoleRow" ADD CONSTRAINT "SearchConsoleRow_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchConsoleRow" ADD CONSTRAINT "SearchConsoleRow_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchConsoleRow" ADD CONSTRAINT "SearchConsoleRow_websitePageId_fkey" FOREIGN KEY ("websitePageId") REFERENCES "WebsitePage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
