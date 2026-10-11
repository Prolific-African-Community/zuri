-- CreateEnum
CREATE TYPE "InteractionAnalysisStatus" AS ENUM ('NONE', 'PROPOSED', 'APPLIED', 'DISMISSED', 'FAILED');

-- AlterTable
ALTER TABLE "ProspectEvidence" ADD COLUMN     "interactionId" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3),
ADD COLUMN     "resolvedById" TEXT,
ADD COLUMN     "supersededAt" TIMESTAMP(3),
ADD COLUMN     "supersededById" TEXT;

-- AlterTable
ALTER TABLE "ProspectInteraction" ADD COLUMN     "analysis" JSONB,
ADD COLUMN     "analysisError" TEXT,
ADD COLUMN     "analysisStatus" "InteractionAnalysisStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "analyzedAt" TIMESTAMP(3),
ADD COLUMN     "appliedAt" TIMESTAMP(3),
ADD COLUMN     "outcome" JSONB;

-- AddForeignKey
ALTER TABLE "ProspectEvidence" ADD CONSTRAINT "ProspectEvidence_interactionId_fkey" FOREIGN KEY ("interactionId") REFERENCES "ProspectInteraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
