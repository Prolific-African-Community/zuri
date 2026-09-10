-- CreateEnum
CREATE TYPE "ContentFormat" AS ENUM ('MDX', 'MARKDOWN');

-- CreateEnum
CREATE TYPE "PublishingMode" AS ENUM ('GITHUB_PR');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "assetsDirectory" TEXT,
ADD COLUMN     "contentDirectory" TEXT,
ADD COLUMN     "contentFormat" "ContentFormat" NOT NULL DEFAULT 'MDX',
ADD COLUMN     "defaultBranch" TEXT,
ADD COLUMN     "publicRoute" TEXT,
ADD COLUMN     "publishingMode" "PublishingMode" NOT NULL DEFAULT 'GITHUB_PR';
