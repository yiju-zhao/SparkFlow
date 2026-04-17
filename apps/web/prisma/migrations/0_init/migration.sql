-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('DOCUMENT', 'WEBPAGE');

-- CreateEnum
CREATE TYPE "SourceStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'PARTIAL', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "WikiPageType" AS ENUM ('ENTITY', 'CONCEPT', 'SUMMARY', 'COMPARISON', 'INDEX', 'LOG', 'ARTICLE');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SessionFormat" AS ENUM ('IN_PERSON', 'VIRTUAL', 'BOTH');

-- CreateEnum
CREATE TYPE "MessageSender" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "MatchJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MatchTargetType" AS ENUM ('SESSION', 'PUBLICATION');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelProvider" TEXT NOT NULL DEFAULT 'openai',
    "modelName" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "wikiModelProvider" TEXT NOT NULL DEFAULT 'openai',
    "wikiModelName" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "searchModelProvider" TEXT NOT NULL DEFAULT 'openai',
    "searchModelName" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "matcherModelProvider" TEXT NOT NULL DEFAULT 'openai',
    "matcherModelName" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "apiKeys" TEXT,
    "wechatExcludedSourceIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebooks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "wikiSchema" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "status" "SourceStatus" NOT NULL DEFAULT 'UPLOADING',
    "url" TEXT,
    "fileKey" TEXT,
    "markdown" TEXT,
    "html" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_images" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "source_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wiki_pages" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "pageType" "WikiPageType" NOT NULL,
    "sourceRefs" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wiki_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebook_graphs" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "graphData" JSONB NOT NULL,
    "communities" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebook_graphs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'New Chat',
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "langgraphThreadId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "sender" "MessageSender" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "messageOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instances" (
    "id" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "location" TEXT,
    "website" TEXT,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publications" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "authors" TEXT[],
    "abstract" TEXT,
    "summary" TEXT,
    "affiliations" TEXT[],
    "countries" TEXT[],
    "keywords" TEXT[],
    "researchTopic" TEXT,
    "rating" DOUBLE PRECISION,
    "doi" TEXT,
    "pdfUrl" TEXT,
    "githubUrl" TEXT,
    "websiteUrl" TEXT,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conference_sessions" (
    "id" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT,
    "date" TIMESTAMP(3),
    "startTime" TEXT,
    "endTime" TEXT,
    "location" TEXT,
    "speaker" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "abstract" TEXT,
    "overview" TEXT,
    "transcript" TEXT,
    "sessionUrl" TEXT,
    "topic" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "affiliation" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "technology" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sessionFormat" "SessionFormat",
    "hasRecording" BOOLEAN NOT NULL DEFAULT false,
    "intendedAudience" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conference_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_publications" (
    "sessionId" TEXT NOT NULL,
    "publicationId" TEXT NOT NULL,
    "presentationOrder" INTEGER,

    CONSTRAINT "session_publications_pkey" PRIMARY KEY ("sessionId","publicationId")
);

-- CreateTable
CREATE TABLE "match_jobs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "instanceId" TEXT NOT NULL,
    "targetType" "MatchTargetType" NOT NULL,
    "topK" INTEGER NOT NULL DEFAULT 50,
    "searchK" INTEGER NOT NULL DEFAULT 350,
    "includeReasons" BOOLEAN NOT NULL DEFAULT true,
    "queryFileKey" TEXT NOT NULL,
    "queryData" JSONB,
    "resultFileKey" TEXT,
    "status" "MatchJobStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "queryCount" INTEGER NOT NULL DEFAULT 0,
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "match_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "notebooks_userId_name_key" ON "notebooks"("userId", "name");

-- CreateIndex
CREATE INDEX "source_images_sourceId_idx" ON "source_images"("sourceId");

-- CreateIndex
CREATE INDEX "wiki_pages_notebookId_idx" ON "wiki_pages"("notebookId");

-- CreateIndex
CREATE UNIQUE INDEX "wiki_pages_notebookId_slug_key" ON "wiki_pages"("notebookId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "notebook_graphs_notebookId_key" ON "notebook_graphs"("notebookId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_langgraphThreadId_key" ON "chat_sessions"("langgraphThreadId");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_messageOrder_idx" ON "chat_messages"("sessionId", "messageOrder");

-- CreateIndex
CREATE UNIQUE INDEX "venues_name_key" ON "venues"("name");

-- CreateIndex
CREATE INDEX "instances_year_idx" ON "instances"("year");

-- CreateIndex
CREATE UNIQUE INDEX "instances_venueId_year_key" ON "instances"("venueId", "year");

-- CreateIndex
CREATE INDEX "publications_instanceId_idx" ON "publications"("instanceId");

-- CreateIndex
CREATE INDEX "publications_researchTopic_idx" ON "publications"("researchTopic");

-- CreateIndex
CREATE INDEX "conference_sessions_instanceId_idx" ON "conference_sessions"("instanceId");

-- CreateIndex
CREATE INDEX "conference_sessions_type_idx" ON "conference_sessions"("type");

-- CreateIndex
CREATE INDEX "match_jobs_userId_idx" ON "match_jobs"("userId");

-- CreateIndex
CREATE INDEX "match_jobs_status_idx" ON "match_jobs"("status");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_images" ADD CONSTRAINT "source_images_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wiki_pages" ADD CONSTRAINT "wiki_pages_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notebook_graphs" ADD CONSTRAINT "notebook_graphs_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instances" ADD CONSTRAINT "instances_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publications" ADD CONSTRAINT "publications_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conference_sessions" ADD CONSTRAINT "conference_sessions_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "instances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_publications" ADD CONSTRAINT "session_publications_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "conference_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_publications" ADD CONSTRAINT "session_publications_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_jobs" ADD CONSTRAINT "match_jobs_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

