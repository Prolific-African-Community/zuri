-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('NOT_DEPLOYED', 'WAITING_FOR_DEPLOYMENT', 'LIVE', 'DEPLOYMENT_FAILED');

-- AlterTable
ALTER TABLE "ArticleDraft" ADD COLUMN     "mergeCommitSha" TEXT,
ADD COLUMN     "productionDeployedAt" TIMESTAMP(3),
ADD COLUMN     "productionDeploymentUrl" TEXT,
ADD COLUMN     "productionStatus" "ProductionStatus" NOT NULL DEFAULT 'NOT_DEPLOYED';

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "vercelProjectId" TEXT;
