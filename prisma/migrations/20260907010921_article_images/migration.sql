-- CreateEnum
CREATE TYPE "ArticleImageKind" AS ENUM ('COVER', 'INLINE');

-- CreateTable
CREATE TABLE "ArticleImageAsset" (
    "id" TEXT NOT NULL,
    "articleDraftId" TEXT NOT NULL,
    "kind" "ArticleImageKind" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "purpose" TEXT NOT NULL DEFAULT '',
    "insertionPoint" TEXT NOT NULL DEFAULT '',
    "concept" TEXT NOT NULL DEFAULT '',
    "prompt" TEXT NOT NULL DEFAULT '',
    "alt" TEXT NOT NULL DEFAULT '',
    "caption" TEXT,
    "blobUrl" TEXT,
    "targetPath" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticleImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleImageAsset_articleDraftId_idx" ON "ArticleImageAsset"("articleDraftId");

-- AddForeignKey
ALTER TABLE "ArticleImageAsset" ADD CONSTRAINT "ArticleImageAsset_articleDraftId_fkey" FOREIGN KEY ("articleDraftId") REFERENCES "ArticleDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
