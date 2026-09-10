-- CreateEnum
CREATE TYPE "SeoActionType" AS ENUM ('CREATE_PAGE', 'REFRESH_PAGE', 'TECHNICAL_FIX', 'INTERNAL_LINK');

-- AlterEnum
ALTER TYPE "OpportunitySource" ADD VALUE 'SEARCH';

-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "actionType" "SeoActionType",
ADD COLUMN     "targetKeyword" TEXT,
ADD COLUMN     "targetUrl" TEXT;
