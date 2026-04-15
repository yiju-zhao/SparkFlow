# Search Agent Design — Iterative Semantic Search with Wiki Context

**Date**: 2026-04-15
**Status**: Approved

## Problem

The add-source modal search uses ILIKE keyword matching for publications and WeChat articles. This means:
- "transformer architecture" won't find "Attention Is All You Need"
- No semantic understanding of query intent
- No awareness of what the user is researching (notebook context)
- Results are unranked (arbitrary order)

Web search already goes through LangGraph agent + Tavily, which is acceptable.

## Solution

A new **LangGraph search agent** that uses LLM intelligence to generate smart search keywords, iteratively refine queries, and rank results by relevance — all informed by the notebook's wiki knowledge graph.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Next.js API  /api/notebooks/[id]/sources/search    │
│                                                     │
│  1. Fetch wiki context from NotebookGraph           │
│     (top entities + relationships, ~500 tokens)     │
│  2. Call LangGraph search agent with:               │
│     query, sourceType, wikiContext, domains          │
└──────────────────┬──────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────┐
│  LangGraph graph: "search"                          │
│  (apps/agent/graphs/search_agent.py)                │
│                                                     │
│  State:                                             │
│    messages, query, source_type, domains,           │
│    wiki_context, results[], iteration               │
│                                                     │
│  Flow:                                              │
│    START → agent → should_continue? ─── done ──→ END│
│                        │                            │
│                        └── refine ──→ tool → agent  │
│                            (max 3 iterations)       │
│                                                     │
│  Tools (one active per request):                    │
│    search_web(query, domains)                       │
│    search_publications(query, limit)                │
│    search_wechat(query, limit)                      │
└─────────────────────────────────────────────────────┘
```

## Search Agent Details

### State Schema

```python
class SearchState(TypedDict):
    messages: Annotated[list, add_messages]
    query: str                    # Original user query
    source_type: str              # "web" | "publication" | "wechat"
    domains: list[str]            # For web only
    wiki_context: str             # Notebook entities/topics summary
    results: list[dict]           # Accumulated results across iterations
    iteration: int                # Current loop count (0-indexed)
```

### System Prompt

```
You are a search agent. Your job is to find the most relevant {source_type}
results for the user's query.

NOTEBOOK CONTEXT (what the user is researching):
- Key topics: {top_entities}
- Related concepts: {top_relationships}

INSTRUCTIONS:
1. Analyze the query and notebook context to generate effective search keywords.
2. Call the search tool with your keywords.
3. Evaluate the results — are they relevant to both the query AND notebook context?
4. If results are insufficient, try different keyword angles (synonyms, subfields,
   related terms). DO NOT repeat the same keywords.
5. When you have enough relevant results (or after 3 searches), return your
   final ranked list as a JSON array.

OUTPUT FORMAT (when done):
Return a JSON array of objects with: id, title, snippet, meta, url, sourceType.
Order by relevance (most relevant first).
```

If `wiki_context` is empty (new notebook with no sources yet), the NOTEBOOK CONTEXT section is omitted and the agent operates purely on query semantics.

### Iteration Control

- `should_continue` edge checks:
  - `iteration >= 3` → force stop, go to final ranking
  - LLM returned a final JSON array (no tool calls) → stop
  - Otherwise → increment iteration, continue loop
- Results from each tool call are **appended** to `state["results"]` and deduplicated by ID.
- Final output: LLM re-ranks all accumulated results, returns top 10.

### Model Configuration

Follows the existing BYOK pattern. The search agent accepts `model_provider` and `model_name` via `config.configurable`, same as hub and rag agents. The Next.js API passes the user's `searchModelProvider` / `searchModelName` from `UserSettings`.

## Search Tools

Three tools defined in `apps/agent/tools/search_tools.py`. Each calls back to a Next.js API endpoint (following the existing `wiki_tools.py` pattern where tools call `SPARKFLOW_API_URL`).

### search_web(query: str, domains: list[str] = None) -> list[dict]

Calls Tavily search API directly from the Python agent (using `tavily-python` client). This replaces the current approach of routing web search through the RAG agent with `search_mode: true`. The search agent handles the Tavily call as one of its tools, with the same iterative refinement loop as the other source types.
Returns: `[{title, url, content, published_date}]`

### search_publications(query: str, limit: int = 20) -> list[dict]

Calls `POST /api/explore/search/publications` with the query.
The endpoint uses PostgreSQL full-text search (`plainto_tsquery` + `ts_rank`).
Returns: `[{id, title, abstract, authors, venue, year, pdfUrl, rank}]`

### search_wechat(query: str, limit: int = 20) -> list[dict]

Calls `POST /api/explore/search/wechat` with the query.
The endpoint uses PostgreSQL full-text search on the wechat_articles DB.
Returns: `[{id, title, content_text (truncated), author, source_name, publish_time, rank}]`

## Database Upgrade: ILIKE → Full-Text Search

### Publication Table

```sql
ALTER TABLE "Publication"
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(abstract, '')), 'B')
) STORED;

CREATE INDEX idx_publication_search ON "Publication" USING GIN(search_vector);
```

- `'english'` config: applies stemming (transformers → transformer)
- Weight A (title) ranks higher than weight B (abstract)
- GIN index: sub-millisecond queries on 100k+ rows
- `GENERATED ALWAYS AS ... STORED`: auto-populates for existing and new rows

### WeChat Articles Table

```sql
ALTER TABLE wechat_articles.articles
ADD COLUMN search_vector tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(content_text, '')), 'B')
) STORED;

CREATE INDEX idx_wechat_search ON wechat_articles.articles USING GIN(search_vector);
```

- `'simple'` config: tokenizes on whitespace, no language-specific stemming. Works for Chinese + English mixed content. (A `zhparser` extension would be ideal for CJK but requires installation.)

### New API Endpoints

**`POST /api/explore/search/publications`**

```typescript
// Request: { query: string, limit?: number }
// Query: plainto_tsquery('english', query) against search_vector
// Ranking: ts_rank(search_vector, tsquery)
// Returns: top N publications ordered by rank
```

**`POST /api/explore/search/wechat`**

```typescript
// Request: { query: string, limit?: number }
// Query: plainto_tsquery('simple', query) against search_vector
// Ranking: ts_rank(search_vector, tsquery)
// Returns: top N articles ordered by rank
```

Both endpoints are internal — called by the Python search agent tools, not the frontend.

## Wiki Context Extraction

New utility: `apps/web/lib/services/wiki-context.ts`

```typescript
export async function getWikiContextForSearch(notebookId: string): Promise<string>
```

1. Load `NotebookGraph` for the notebook
2. If no graph exists, return `""`
3. Extract top 10 entities by edge count (most connected = most central to the notebook's topic)
4. Extract top 10 relationships between those entities
5. Format as a compact string:

```
Topics: medical imaging (entity), UNet (method), CT segmentation (concept), ...
Relationships: UNet → used_for → CT segmentation, attention → improves → UNet, ...
```

Target: ~500 tokens max. Enough for the LLM to understand domain, small enough to not bloat the prompt.

## Changes Summary

### New Files

| File | Purpose |
|------|---------|
| `apps/agent/graphs/search_agent.py` | Search agent LangGraph graph |
| `apps/agent/tools/search_tools.py` | 3 search tools (web, publication, wechat) |
| `apps/web/app/api/explore/search/publications/route.ts` | Full-text publication search endpoint |
| `apps/web/app/api/explore/search/wechat/route.ts` | Full-text WeChat search endpoint |
| `apps/web/lib/services/wiki-context.ts` | Wiki context extraction for search |

### Modified Files

| File | Change |
|------|--------|
| `apps/agent/langgraph.json` | Register `"search"` graph |
| `apps/web/app/api/notebooks/[id]/sources/search/route.ts` | Refactor to call search agent for all 3 source types (currently only web goes through agent) |

### Not Modified

- `components/deepdive/sources/add-source-dialog.tsx` — Frontend UI unchanged
- `lib/types/search.ts` — `SearchResult` interface unchanged
- `prisma/schema.prisma` — tsvector columns managed via raw SQL migration
- Existing RAG agent and hub agent — untouched

### Migration

One SQL migration script to add tsvector columns + GIN indexes to both databases. Columns auto-populate from existing data.

## Non-Goals

- Unified cross-source search (user still picks source type)
- Embedding-based vector search (no pgvector)
- Frontend UI changes
- Personalization beyond notebook wiki context
