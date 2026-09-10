-- CreateTable
CREATE TABLE "ArticlePublication" (
    "id" TEXT NOT NULL,
    "articleDraftId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "prNumber" INTEGER NOT NULL,
    "prUrl" TEXT NOT NULL,
    "packageHash" TEXT NOT NULL,
    "publishedUrl" TEXT NOT NULL,
    "mergedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticlePublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticlePublication_articleDraftId_idx" ON "ArticlePublication"("articleDraftId");

-- AddForeignKey
ALTER TABLE "ArticlePublication" ADD CONSTRAINT "ArticlePublication_articleDraftId_fkey" FOREIGN KEY ("articleDraftId") REFERENCES "ArticleDraft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
