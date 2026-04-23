-- CreateEnum
CREATE TYPE "DigestSourceType" AS ENUM ('WECHAT');

-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('GENERATING', 'COMPLETED', 'EMPTY', 'FAILED');

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN "digestConfig" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "daily_digest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digestDate" DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_section" (
    "id" TEXT NOT NULL,
    "digestId" TEXT NOT NULL,
    "sourceType" "DigestSourceType" NOT NULL,
    "status" "DigestStatus" NOT NULL DEFAULT 'GENERATING',
    "items" JSONB NOT NULL DEFAULT '[]',
    "candidatePool" INTEGER NOT NULL DEFAULT 0,
    "modelUsed" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "digest_section_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_digest_userId_digestDate_key" ON "daily_digest"("userId", "digestDate");

-- CreateIndex
CREATE INDEX "daily_digest_userId_digestDate_idx" ON "daily_digest"("userId", "digestDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "digest_section_digestId_sourceType_key" ON "digest_section"("digestId", "sourceType");

-- AddForeignKey
ALTER TABLE "daily_digest" ADD CONSTRAINT "daily_digest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_section" ADD CONSTRAINT "digest_section_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "daily_digest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
