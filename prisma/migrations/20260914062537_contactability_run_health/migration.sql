-- AlterEnum
ALTER TYPE "SalesResearchRunStatus" ADD VALUE 'DEGRADED';

-- AlterTable
ALTER TABLE "Prospect" ADD COLUMN     "companyEmail" TEXT,
ADD COLUMN     "companyPhone" TEXT,
ADD COLUMN     "contactPageUrl" TEXT;

-- AlterTable
ALTER TABLE "SalesResearchRun" ADD COLUMN     "coverageRatio" DOUBLE PRECISION,
ADD COLUMN     "failedSearches" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "plannedSearches" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "successfulSearches" INTEGER NOT NULL DEFAULT 0;
