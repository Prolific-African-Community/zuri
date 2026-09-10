-- CreateEnum
CREATE TYPE "VerificationOutcome" AS ENUM ('VERIFIED', 'DIVERGED', 'NOT_ENOUGH_DATA', 'NOT_VERIFIABLE');

-- AlterTable
ALTER TABLE "ProposedAction" ADD COLUMN     "actualState" TEXT,
ADD COLUMN     "verificationNote" TEXT,
ADD COLUMN     "verificationOutcome" "VerificationOutcome",
ADD COLUMN     "verifiedAt" TIMESTAMP(3);
