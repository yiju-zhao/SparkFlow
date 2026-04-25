-- AlterTable
ALTER TABLE "users" ADD COLUMN     "dismissedGuides" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tourCompletedAt" TIMESTAMP(3);
