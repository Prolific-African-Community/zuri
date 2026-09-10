-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContentChannel" ADD VALUE 'FACEBOOK';
ALTER TYPE "ContentChannel" ADD VALUE 'INSTAGRAM';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ContentType" ADD VALUE 'TEXT_POST';
ALTER TYPE "ContentType" ADD VALUE 'MEME_CONCEPT';
ALTER TYPE "ContentType" ADD VALUE 'VIDEO_AD_BRIEF';
ALTER TYPE "ContentType" ADD VALUE 'TESTIMONIAL_VIDEO_BRIEF';
