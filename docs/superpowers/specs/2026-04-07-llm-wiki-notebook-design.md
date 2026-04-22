# LLM Wiki Notebook — Design Spec

**Date:** 2026-04-07
**Status:** Draft
**Scope:** Replace RAG-based notebook retrieval with LLM Wiki pattern — persistent, compounding knowledge base per notebook

## Problem

Current notebook RAG (PageIndex tree retrieval) re-derives knowledge from scratch on every query. There's no accumulation. Ask a question that requires synthesizing five documents, and the LLM has to find and piece together fragments every time. Nothing compounds.

## Solution

Apply the [LLM Wiki pattern](https://github.com/karpathy/llm-wiki): instead of retrieving from raw documents at query time, the LLM **incrementally builds and maintains a persistent wiki** per notebook. When a user adds a source, the LLM reads it, extracts key information, and integrates it into existing wiki pages — updating entity pages, revising summaries, noting contradictions. The wiki is a persistent, compounding artifact. Knowledge is compiled once and kept current.

## Architecture: Three Layers

### Layer 1: Raw Sources (existing)

`Source` records — immutable. PDFs parsed by MinerU, webpages by Playwright, text directly. Stored as `markdownContent` in PostgreSQL. The LLM reads from these but never modifies them. This is the source of truth.

### Layer 2: The Wiki (new)

LLM-generated markdown pages per notebook. Each notebook has its own isolated wiki.

**Data model:**
```prisma
enum WikiPageType { ENTITY, CONCEPT, SUMMARY, COMPARISON, INDEX, LOG }

model WikiPage {
  id          String       @id @default(cuid())
  notebookId  String
  slug        String       // URL-friendly identifier (e.g., "transformer-architecture")
  title       String
  content     String       @db.Text  // Full markdown with [[wiki-links]]
  pageType    WikiPageType
  sourceRefs  String[]     // Source IDs that contributed to this page
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  notebook Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)

  @@unique([notebookId, slug])
  @@index([notebookId])
  @@map("wiki_pages")
}
```

**Special pages (auto-created per notebook):**

- **index** (pageType=INDEX) — catalog of all wiki pages with one-line summaries, organized by category. The agent reads this first on every query to find relevant pages. Works well at moderate scale (~100 sources, ~hundreds of pages) without needing vector search.

- **log** (pageType=LOG) — append-only chronological record of operations (ingests, queries, lint passes). Each entry prefixed with date and operation type for parseability.

**Wiki link syntax:** `[[slug]]` in markdown content. Frontend renders as clickable links to other wiki pages. Source references use `[source:sourceId]` to link back to raw sources.

### Layer 3: The Schema (new)

Per-notebook configuration that tells the agent how to structure this notebook's wiki.

```prisma
// Add to existing Notebook model:
model Notebook {
  // ... existing fields ...
  wikiSchema  Json?    // Wiki structure conventions
  wikiPages   WikiPage[]
}
```

Default schema (stored as JSON):
```json
{
  "searchCollections": ["publications", "sessions"],
  "pageTypes": {
    "entity": "People, organizations, methods, datasets, tools",
    "concept": "Themes, topics, theories, research areas",
    "summary": "Per-source summaries with key takeaways",
    "comparison": "Cross-source analyses, contrasts, debates"
  },
  "conventions": {
    "linkStyle": "[[slug]]",
    "sourceRefStyle": "[source:id]",
    "frontmatter": true
  },
  "emphasis": []
}
```

`searchCollections` controls which knowledge pools (Publications, Sessions, 公众号, 推特, etc.) are searched when the user searches for sources in the Add Source modal. Configured in Notebook Settings, not in the modal itself.

User and agent co-evolve the schema through chat ("focus more on methodology comparisons", "track author affiliations").

## Operations

### Ingest (source upload → wiki integration)

1. User uploads source (PDF/webpage/text) — existing pipeline
2. MinerU/Playwright extracts markdown, stores in `Source.markdownContent`
3. Source status → READY
4. Agent ingest triggered:
   - `source_read(id)` — reads raw markdown
   - `wiki_list()` — reads index.md to understand current wiki state
   - `wiki_read(relevant pages)` — reads pages that may need updating
   - Generates/updates wiki pages:
     - Creates source summary page
     - Creates or updates entity pages (people, methods, datasets)
     - Creates or updates concept pages (themes, topics)
     - Updates index.md with new/changed pages
     - Appends entry to log.md
   - A single source may touch 5-15 wiki pages
5. Agent posts summary in chat: "I processed [title]. Created 3 new pages, updated 2: [list with links]. Anything you want me to focus on?"
6. User can guide emphasis or let it stand

### Query (chat → wiki-grounded answers)

1. User asks question in chat
2. Agent reads index.md (lightweight — titles + one-line summaries)
3. Agent identifies relevant wiki pages from the index
4. Agent reads those pages (already synthesized, cross-referenced)
5. Agent answers with citations: `[[wiki-page]]` and `[source:id]`
6. If answer produces valuable synthesis:
   - Agent offers: "Want me to save this as a wiki page?"
   - If yes, creates new page, updates index

Key difference from RAG: the agent reads **compiled knowledge** (wiki pages that already synthesize multiple sources), not raw chunks.

### Lint (periodic health check)

Triggered by user ("lint the wiki") or suggested by agent after N ingests:
- Orphan pages (no inbound links)
- Stale pages (sources added since last update)
- Missing pages (concepts mentioned but no dedicated page)
- Contradictions (newer sources vs older claims)
- Gaps (topics that could use deeper coverage)

Agent reports findings in chat with suggested actions.

## Agent Tools

| Tool | Purpose | Implementation |
|------|---------|----------------|
| `wiki_read(slug)` | Read a wiki page | `GET /api/notebooks/[id]/wiki/[slug]` |
| `wiki_write(slug, title, content, pageType, sourceRefs)` | Create/update wiki page | `PUT /api/notebooks/[id]/wiki/[slug]` |
| `wiki_list()` | Read index.md | `GET /api/notebooks/[id]/wiki/index` |
| `wiki_log(entry)` | Append to log.md | `POST /api/notebooks/[id]/wiki/log` |
| ~~`wiki_search`~~ | Not needed — index.md is sufficient at 50-source notebook cap | — |
| `source_read(sourceId)` | Read raw source markdown | `GET /api/notebooks/[id]/sources/[sourceId]/content` |
| `source_list()` | List all sources in notebook | `GET /api/notebooks/[id]/sources` |

No external retrieval services. The agent reads/writes wiki pages through CRUD API routes. The LLM IS the retrieval engine.

## Frontend UI

### Sources Panel — Two Tabs

```
[Sources] [Wiki]
```

**Sources tab** — existing behavior. Raw source list with status badges, upload/add.

**Wiki tab** — wiki pages grouped by pageType:
- Index (pinned at top)
- Entities
- Concepts
- Summaries
- Comparisons

Clicking a wiki page opens it in the content view area. `[[slug]]` links render as clickable navigation. `[source:id]` links switch to the Sources tab and select that source.

### Add Source Modal (revised)

When user clicks + in sources panel:

```
┌─────────────────────────────────────────┐
│         Add Sources to Notebook          │
│                                          │
│  ┌────────────────────────────────────┐  │
│  │ 🔍 Search for sources...           │  │
│  └────────────────────────────────────┘  │
│                                          │
│  ─── or ───                              │
│                                          │
│  [📄 Upload files] [🔗 URL] [📝 Text]   │
│                                          │
└─────────────────────────────────────────┘
```

**Search:** User types query → semantic search across collections enabled in Notebook Settings (`wikiSchema.searchCollections`) → ranked results with relevance snippets → user selects items → "Add to notebook" → creates Source from collection item → triggers ingest. No collection toggles in the modal — configured once in settings.

**Upload/URL/Text:** Existing functionality, unchanged.

### Research Hub Integration

Each item in Research Hub collections (Publications, Sessions, etc.) has an "Add to Notebook" button. User clicks → picks notebook → Source created from collection item → ingest triggers.

No separate "source pool" table — the Research Hub collections ARE the pool.

## What Gets Removed

- **PageIndex** — replaced by wiki pattern. No tree indexing needed.
- `Source.indexData` field — no longer needed
- `apps/agent/utils/pageindex_client.py` — deleted
- `apps/agent/tools/pageindex_tools.py` — replaced by wiki tools
- `apps/agent/api/index_endpoint.py` — replaced by wiki API routes
- `apps/web/app/api/notebooks/[id]/sources/[sourceId]/index/route.ts` — deleted
- `pageindex` from agent requirements.txt

## What Gets Added

### Database
- `WikiPage` model (see Layer 2 above)
- `Notebook.wikiSchema` Json field
- Remove `Source.indexData` field

### API Routes (Next.js)
- `GET/PUT /api/notebooks/[id]/wiki/[slug]` — read/write wiki pages
- `POST /api/notebooks/[id]/wiki/log` — append to log
- ~~wiki search~~ — not needed, index.md is sufficient at 50-source cap
- `POST /api/notebooks/[id]/ingest/[sourceId]` — trigger wiki ingest

### Agent (Python)
- `tools/wiki_tools.py` — wiki_read, wiki_write, wiki_list, wiki_log, source_read, source_list
- Update `graphs/rag_agent.py` to register wiki tools
- Update middleware to load wiki schema into agent context

### Frontend
- Wiki tab in sources panel
- Wiki page viewer with `[[link]]` rendering
- Updated Add Source modal with collection search
- "Add to Notebook" button on Research Hub items
- "Save as wiki page" button on chat messages

## Chat Integration

### Citation Rendering

Chat messages from the agent contain two types of references:
- `[[slug]]` → renders as clickable pill/link. Clicking switches to Wiki tab and opens that page.
- `[source:id]` → renders as numbered citation superscript. Clicking switches to Sources tab and selects that source.

### Ingest Notifications

After wiki ingest completes, the agent posts a structured message in chat:
```
📚 Processed: "Attention Is All You Need"
Created: [[transformer-architecture]], [[self-attention]], [[vaswani-2017-summary]]
Updated: [[neural-network-architectures]], [[index]]
Want me to focus on anything specific?
```

### "Save to Wiki" Button

When the agent produces substantial synthesis, the message includes a "Save to wiki" action button. Clicking it:
1. Fires non-blocking POST to `/api/notebooks/[id]/ingest` (background)
2. Agent creates WikiPage from chat answer content
3. `sourceRefs` points to the original sources the answer cited (no circular references)
4. Updates index.md
5. Posts confirmation in chat when done
6. Chat continues unblocked throughout

The chat answer is saved as a **wiki page** (Layer 2 — synthesized knowledge), NOT as a raw source (Layer 1). This preserves the clean separation: sources are external inputs, wiki is derived knowledge.

### Non-Blocking Ingest

All ingest operations (source upload, "save to wiki") are non-blocking. The agent processes in the background, posts notifications when done. The user can keep chatting while the wiki is being updated.

## Error Handling & Edge Cases

### Ingest Failures
- Source stays READY (raw content preserved)
- Agent posts error in chat with "Re-ingest" option
- No partial wiki updates — agent writes all page changes in one batch

### Concurrent Ingests
Multiple source uploads queue and run sequentially per notebook. Each ingest sees the wiki state left by the previous one.

### Schema Evolution
When user changes wiki conventions via chat, agent applies new rules going forward. Full wiki rewrite only on explicit request.

### Scale
Each notebook is capped at ~50 raw sources. This produces ~100-200 wiki pages max (a few pages per source + cross-cutting concept/comparison pages). Wiki pages naturally merge — two sources about the same entity update one page, not two. So index.md is sufficient as the sole retrieval mechanism. No vector search or full-text search infrastructure needed.

### Empty State
New notebook starts with empty Sources tab, Wiki tab showing only index.md (empty catalog) and log.md (empty log), and a welcome message in chat.

## Migration

1. Add WikiPage model + Notebook.wikiSchema to Prisma schema
2. Remove Source.indexData field
3. Delete PageIndex-related files
4. Create wiki API routes
5. Create wiki agent tools
6. Update agent graph to use wiki tools
7. Add Wiki tab to sources panel
8. Update Add Source modal with collection search
9. Add "Save to wiki" button on chat messages
10. Add "Add to Notebook" button on Research Hub items
11. For existing notebooks: wiki starts empty, gets built as user interacts
