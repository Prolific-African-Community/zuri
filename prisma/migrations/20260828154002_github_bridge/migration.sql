-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "githubBranch" TEXT,
ADD COLUMN     "githubOwner" TEXT,
ADD COLUMN     "githubRepo" TEXT;

-- AlterTable
ALTER TABLE "ProposedAction" ADD COLUMN     "branch" TEXT,
ADD COLUMN     "prNumber" INTEGER,
ADD COLUMN     "prUrl" TEXT;
