-- Enable pgvector for BGE-M3 (1024-dim) embeddings used by the search agent prefilter.
CREATE EXTENSION IF NOT EXISTS vector;

-- ----------------------------------------------------------------------
-- Publications: in-place embedding columns (rows live in main DB already).
-- ----------------------------------------------------------------------
ALTER TABLE "publications"
  ADD COLUMN "titleEmbedding"    vector(1024),
  ADD COLUMN "abstractEmbedding" vector(1024);

CREATE INDEX "publications_titleEmbedding_hnsw_idx"
  ON "publications" USING hnsw ("titleEmbedding" vector_cosine_ops)
  WHERE "titleEmbedding" IS NOT NULL;

CREATE INDEX "publications_abstractEmbedding_hnsw_idx"
  ON "publications" USING hnsw ("abstractEmbedding" vector_cosine_ops)
  WHERE "abstractEmbedding" IS NOT NULL;

-- ----------------------------------------------------------------------
-- WeChat article embeddings: mirror table.
--   The source table `wechat_articles.articles` lives in the *external* WeChat
--   DB which we treat as read-only. We embed its rows and store the vectors
--   here, keyed by the upstream integer article id. An admin-triggered
--   backfill and a periodic incremental sync keep this table in step with the
--   upstream DB.
-- ----------------------------------------------------------------------
CREATE TABLE "wechat_article_embeddings" (
  "articleId"         INTEGER      PRIMARY KEY,
  "articleHash"       VARCHAR(32),
  "titleEmbedding"    vector(1024),
  "contentEmbedding"  vector(1024),
  "embeddedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "wechat_article_embeddings_title_hnsw_idx"
  ON "wechat_article_embeddings" USING hnsw ("titleEmbedding" vector_cosine_ops)
  WHERE "titleEmbedding" IS NOT NULL;

CREATE INDEX "wechat_article_embeddings_content_hnsw_idx"
  ON "wechat_article_embeddings" USING hnsw ("contentEmbedding" vector_cosine_ops)
  WHERE "contentEmbedding" IS NOT NULL;
