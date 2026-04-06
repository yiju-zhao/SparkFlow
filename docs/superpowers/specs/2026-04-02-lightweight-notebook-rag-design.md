# Lightweight Notebook RAG — Replace RagFlow with PageIndex

**Date:** 2026-04-02
**Status:** Approved
**Scope:** Notebook/Deepdive feature — document ingestion, indexing, and retrieval pipeline

## Problem

RagFlow is too heavy for SparkFlow's notebook feature:
- Requires its own server (port 9380) + Elasticsearch + Redis
- Complex multi-step pipeline: MinerU → markdown → RagFlow upload → auto-parse → polling → chunk caching
- 7+ environment variables, fire-and-forget processing with poor error recovery
- Vector similarity retrieval isn't ideal for research papers
- High operational cost for what amounts to "index a document and search it"

## Solution

Replace RagFlow with [PageIndex](https://github.com/VectifyAI/PageIndex) — a vectorless, reasoning-based RAG system that uses LLM reasoning over hierarchical document trees instead of vector similarity. Additionally:
- Replace Crawl4AI with a Playwright-based web scraper (fixes WeChat article support)
- Replace MinIO with PostgreSQL bytea storage for images
- Add dual-mode MinerU support (local instance vs cloud API)

## Architecture

### Services After Migration

| Service | Status | Purpose |
|---------|--------|---------|
| RagFlow (port 9380) | **REMOVED** | Was: chunking, indexing, retrieval |
| Crawl4AI (port 11235) | **REMOVED** | Was: webpage → markdown |
| MinIO (port 9004/9005) | **REMOVED** | Was: S3-compatible image storage |
| MinerU (port 8000 or cloud API) | **KEPT** (dual-mode) | PDF → markdown + image extraction |
| PostgreSQL (port 5433) | **KEPT** | Primary database + image storage |
| PageIndex | **ADDED** (library) | Document tree indexing + reasoning retrieval |
| Playwright | **ADDED** (library) | Web scraping for blogs/WeChat/general pages |

### Pipeline Overview

```
Document Upload
    |
[PDF]      --> MinerU (local or API) --> markdown + images
[Webpage]  --> Playwright scraper    --> markdown + images
[Blog/DB]  --> fetch from DB         --> markdown
[Text]     --> direct                --> markdown
    |
    v
Images --> PostgreSQL (bytea in Image table)
Markdown --> Source.markdownContent (for notebook preview)
    |
    v
PageIndex.index(pdf or markdown) --> tree JSON --> Source.indexData
    |
    v
Source.status = READY
```

### Query Flow

```
User question --> LangGraph rag_agent
    --> Load Source.indexData trees for notebook
    --> Agent calls search(query)
        --> PageIndex.retrieve() reasons through trees
        --> Returns sections with source_id, page_range, section_title
    --> Agent calls read_section() for more detail if needed
    --> Agent constructs answer with citations [ref:source_id:section]
    --> Frontend maps citations to Source for back-tracing
```

## Components

### 1. MinerU Provider (dual-mode)

Single interface, two backends controlled by environment variable.

**Environment Variables:**
```
MINERU_MODE=local|api
MINERU_LOCAL_URL=http://localhost:8000    # for local mode
MINERU_API_TOKEN=xxx                      # for API mode
```

**Local mode:** Direct HTTP to self-hosted MinerU instance (current behavior, for production).

**API mode:** For development without local MinerU installation.
- Submit: `POST https://mineru.net/api/v4/extract/task` with Bearer token
- Poll: `GET https://mineru.net/api/v4/extract/task/{task_id}` until `state=done`
- Download: fetch `full_zip_url` → extract markdown + images from zip
- Supports `model_version`: `pipeline` (default) or `vlm` (recommended)
- File size limit: 200MB, page limit: 600 pages

**Interface:**
```typescript
parsePdf(fileUrl: string): Promise<{ markdown: string, images: { name: string, data: Buffer, mimeType: string }[] }>
```

### 2. Playwright Web Scraper (replaces Crawl4AI)

Generic scraper handling WeChat articles, Medium, Substack, and general blog pages.

**Capabilities:**
- Launches headless Chromium, waits for JS content render
- Extracts article body → converts to markdown
- Downloads inline images
- Extracts metadata (title, author, publish date)
- WeChat-specific handling: lazy-loaded images, removal of share/follow CTAs

**Interface:**
```typescript
scrapeWebpage(url: string): Promise<{ markdown: string, images: { name: string, data: Buffer, mimeType: string }[], metadata: { title: string, author?: string, date?: string } }>
```

### 3. PageIndex Integration

Python library in `apps/agent` for document indexing and retrieval.

**Indexing:**
- `PageIndex.index(pdf_path)` for PDFs — uses native PyMuPDF parser
- `PageIndex.index(markdown_text)` for markdown — preserves heading hierarchy
- Output: tree JSON structure with node summaries and page references

**Retrieval:**
- `PageIndex.retrieve(query, index)` — LLM reasons through tree to find relevant sections
- Returns: list of sections with content, page range, section title, source reference

**Storage:** Tree index serialized as JSON in `Source.indexData` (PostgreSQL)

**LLM Configuration:**
- Uses LiteLLM — configurable via `PAGEINDEX_MODEL` env var
- Default: GPT-4o
- Swappable to local LLM (Ollama, vLLM) if cost is a concern

### 4. Agent Tools (replaces RagFlow tools)

Three tools replace the current four (`explore`, `search`, `probe`, `get_first_chunk`):

| Tool | Purpose |
|------|---------|
| `search(query)` | PageIndex tree reasoning retrieval across all notebook sources |
| `explore()` | List all sources with their section tree summaries |
| `read_section(source_id, section_path)` | Read full content of a specific section (traceability) |

`probe()` and `get_first_chunk()` are dropped — PageIndex's tree structure makes chunk-level navigation unnecessary. Traceability is provided by `source_id + page_range + section_title` in every retrieval result.

### 5. Image Storage (replaces MinIO)

**New `Image` table:**
```
Image {
  id         String   @id @default(cuid())
  sourceId   String
  filename   String
  mimeType   String
  data       Bytes    // raw binary, not base64
  createdAt  DateTime @default(now())
}
```

**API route:** `GET /api/images/[id]` — streams bytea with correct content-type header.

Markdown image references rewritten from MinIO URLs to `/api/images/[id]`.

### 6. Database Schema Changes

**Remove:**
- `Notebook.ragflowDatasetId`
- `Source.ragflowDocumentId`
- `Chunk` table (entirely)

**Add:**
- `Source.indexData` (Json) — PageIndex tree index
- `Source.markdownContent` (String) — full markdown for notebook preview
- `Source.errorMessage` (String, optional) — error details when status = FAILED
- `Image` table (see above)

## Processing Flows

### PDF Upload

```
1. User uploads PDF
2. MinerU parse (local or API mode) → markdown + extracted images
3. Store extracted images (figures, charts) as bytea in Image table
4. Rewrite image refs in markdown to /api/images/[id]
5. Store markdown in Source.markdownContent
6. Pass original PDF to PageIndex.index() → tree JSON
7. Store tree in Source.indexData
8. Update Source.status = READY
```

No original PDF file is persisted long-term. MinerU markdown + extracted images serve as the display source of truth. Note: PageIndex indexes the original PDF directly via PyMuPDF (step 6) — the PDF must be available at indexing time but can be discarded after the tree is built.

### Webpage Upload

```
1. User adds URL
2. Playwright scraper → markdown + images + metadata
3. Store images as bytea in Image table
4. Rewrite image refs in markdown
5. Store markdown in Source.markdownContent
6. PageIndex.index(markdown) → tree JSON
7. Store tree in Source.indexData
8. Update Source.status = READY
```

### Blog Import from Database

```
1. User adds blog from collection
2. Fetch blog content from DB
3. Convert to markdown if needed
4. PageIndex.index(markdown) → tree JSON
5. Store tree in Source.indexData
6. Source.markdownContent = blog content
7. Update Source.status = READY
```

## Error Handling

| Failure | Behavior |
|---------|----------|
| MinerU API timeout/failure | Retry 2x with backoff, then mark Source.status = FAILED with errorMessage |
| Playwright scrape failure | Retry 1x, then mark FAILED. User can retry manually |
| PageIndex indexing failure | Store markdown (preview works), mark status = PARTIAL (searchable: no, viewable: yes) |
| PageIndex query failure | Return error to agent, agent tells user "search unavailable, please try again" |
| LLM rate limit during indexing | Queue and retry with exponential backoff |

No silent failures. Every error surfaces via `Source.status` + `Source.errorMessage`.

## Code Changes

### Files to Remove

- `apps/web/lib/ragflow-client.ts`
- `apps/web/lib/utils/ragflow-status.ts`
- `apps/web/app/api/notebooks/[id]/sources/status/route.ts` (simplify, no RagFlow polling)
- `apps/agent/tools/ragflow.py`
- All `RAGFLOW_*` environment variables
- `ragflow-sdk` from `apps/agent/requirements.txt`
- Crawl4AI references in docker-compose
- MinIO references in docker-compose and `lib/s3-client.ts`

### Files to Create

- `apps/web/lib/services/mineru-client.ts` — dual-mode MinerU provider
- `apps/web/lib/services/playwright-scraper.ts` — generic web scraper
- `apps/agent/tools/pageindex_tools.py` — search, explore, read_section
- `apps/web/app/api/images/[id]/route.ts` — image serving from PG

### Files to Rewrite

- `apps/web/lib/services/source-processors/pdf-processor.ts` — use new MinerU client
- `apps/web/lib/services/source-processors/webpage-processor.ts` — use Playwright scraper
- `apps/web/lib/actions/notebooks.ts` — remove RagFlow dataset creation
- `apps/web/lib/actions/sources.ts` — remove RagFlow references
- `apps/web/components/deepdive/sources/sources-panel.tsx` — simplify status tracking
- `apps/agent/graphs/rag_agent.py` — use PageIndex tools
- `apps/agent/middleware/sources_context.py` — load from Source.indexData
- `apps/web/prisma/schema.prisma` — schema changes

## Migration

1. Add new schema fields + Image table (Prisma migration)
2. Re-index existing notebook sources through the new pipeline
3. Drop RagFlow fields after re-indexing confirmed
4. Migrate any existing MinIO images to PG (one-time script)
5. Remove RagFlow, Crawl4AI, MinIO from docker-compose

## Environment Variables

### Remove
```
RAGFLOW_BASE_URL
RAGFLOW_API_KEY
RAGFLOW_EMBEDDING_MODEL
RAGFLOW_CHUNK_SIZE
RAGFLOW_AUTO_KEYWORDS
RAGFLOW_AUTO_QUESTIONS
RAGFLOW_TOC_ENHANCE
S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET
```

### Add
```
MINERU_MODE=local|api
MINERU_LOCAL_URL=http://localhost:8000
MINERU_API_TOKEN=                          # required when MINERU_MODE=api
PAGEINDEX_MODEL=gpt-4o                     # LLM for indexing/retrieval, swappable to local
```
