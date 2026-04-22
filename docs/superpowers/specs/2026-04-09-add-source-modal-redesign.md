# Add Source Modal Redesign

## Overview

Redesign the notebook's Add Source modal from a tab-based (Webpage/Document) layout to a unified search-first experience inspired by NotebookLM. Users can deep search from the web (Tavily), SparkFlow publications, or WeChat articles via a LangGraph agent, then multi-select results to add as sources. File upload and URL paste remain as secondary actions.

## Goals

1. Unified search bar with source type switching (Web / Publication / WeChat)
2. Web search supports free-form domain whitelist filtering
3. Search runs as a background task via LangGraph agent with progressive results
4. Multi-select results and batch-add to notebook
5. Preserve existing file upload and URL paste functionality
6. Clean, modern layout matching the NotebookLM reference design

## Non-Goals

- Agent internal implementation (tools, graph structure, prompts) — separate spec
- Federated search across all source types simultaneously
- Predefined domain presets

## Architecture

### Search Flow

```
User types query
  → Frontend POST /api/notebooks/[id]/sources/search
    → Creates search task, calls LangGraph agent (port 2024)
    → Returns { taskId }
  
Frontend polls GET /api/notebooks/[id]/sources/search/[taskId]
  → Returns { status, results[] }
  → Results appear incrementally as agent finds them

User selects results → clicks "Add selected"
  → Frontend creates sources via existing pipelines
```

### Source Addition Flow (per type)

- **Web**: Call Tavily extract API to get full page content → create Source (WEBPAGE type) → existing webpage processing pipeline
- **Publication**: Look up publication's PDF URL/DOI → download PDF → existing PDF processing pipeline
- **WeChat**: Query external WeChat DB for `content_html` + images → convert HTML to markdown → create Source (WEBPAGE type)

## API Contract

### Search Request

```
POST /api/notebooks/[id]/sources/search
```

```ts
interface SearchRequest {
  query: string;
  sourceType: "web" | "publication" | "wechat";
  domains?: string[]; // only for web, Tavily include_domains
}

interface SearchResponse {
  taskId: string;
}
```

### Search Status/Results

```
GET /api/notebooks/[id]/sources/search/[taskId]
```

```ts
interface SearchStatusResponse {
  status: "searching" | "completed" | "failed";
  results: SearchResult[];
  error?: string;
}

interface SearchResult {
  id: string;          // unique ID (URL for web, DB ID for publication/wechat)
  title: string;
  snippet: string;     // preview text / abstract
  meta: string;        // e.g. "arxiv.org · 2023" or "WeChat · Author Name · 2024-01-15"
  url?: string;        // web URL or publication PDF link
  sourceType: "web" | "publication" | "wechat";
}
```

### Add Selected Sources

Uses existing endpoints with minor extensions:

- **Web sources**: Calls `addWebpageSource(notebookId, url)` — existing server action, Tavily extract happens during processing
- **Publication sources**: New server action `addPublicationSource(notebookId, publicationId)` — fetches PDF URL from Publication record, downloads, processes
- **WeChat sources**: New server action `addWechatSource(notebookId, articleId)` — fetches content from external DB, converts HTML to markdown, creates source

## External WeChat Database

Connection via raw `pg` pool (not Prisma — separate database with its own schema).

**Environment variables:**
- `WECHAT_DB_HOST`
- `WECHAT_DB_PORT`
- `WECHAT_DB_USER`
- `WECHAT_DB_PASSWORD`
- `WECHAT_DB_NAME`

**Relevant tables** (schema: `wechat_articles`):
- `articles` — `id`, `title`, `author`, `publish_time`, `content_html`, `content_text`, `original_url`, `cover_url`
- `images` — `id`, `article_id`, `image_type`, `original_url`, `data` (bytea), `mime_type`
- `sources` — `id`, `slug`, `name` (WeChat account names)

**Search query**: Full-text search on `title` and `content_text` fields.

## UI Design

### Modal Layout

```
┌─────────────────────────────────────────────────┐
│  🔍 Search for new sources...              [→]  │
│                                                  │
│  [🌐 Web ▾]  [+ Add domains...]                │
│  ┌─────────┐ ┌──────────┐                       │
│  │arxiv.org│ │ ieee.org │  (removable chips)    │
│  └─────────┘ └──────────┘                       │
│─────────────────────────────────────────────────│
│                                                  │
│           or drop your files                     │
│          pdf, docx, txt, md                      │
│                                                  │
│  ┌──────────────┐  ┌──────────────┐             │
│  │ Upload files  │  │  Paste URL   │             │
│  └──────────────┘  └──────────────┘             │
└─────────────────────────────────────────────────┘
```

### Source Type Dropdown

Three options with icons and descriptions:
- **Web** — "Search the web via Tavily"
- **Publication** — "Papers in SparkFlow database"
- **WeChat Article** — "Articles from WeChat sources"

### Domain Filter (Web only)

- Dashed pill button "+ Add domains..." opens an inline text input
- User types a domain and presses Enter to add as a chip
- Each chip has an X button to remove
- Domains passed as `include_domains` to Tavily API

### Search Results View

When results arrive, the drop zone is replaced by a scrollable results list:

```
┌─────────────────────────────────────────────────┐
│  🔍 transformer attention mechanism        [→]  │
│  [🌐 Web ▾]  [arxiv.org ×]                     │
│─────────────────────────────────────────────────│
│  ☑ Attention Is All You Need                     │
│    arxiv.org · Vaswani et al. · 2017            │
│    We propose a new simple network...            │
│                                                  │
│  ☐ BERT: Pre-training of Deep Bidirectional...  │
│    arxiv.org · Devlin et al. · 2018             │
│    We introduce BERT, designed to...             │
│                                                  │
│  ☐ GPT-4 Technical Report                       │
│    openai.com · OpenAI · 2023                   │
│    We report the development of GPT-4...         │
│                                                  │
│                    [Add 1 selected source]        │
└─────────────────────────────────────────────────┘
```

- Each result is a clickable card with checkbox
- Selected results get highlighted border
- "Add N selected sources" button at bottom, disabled when none selected
- Clearing the search query restores the drop zone view

### State Transitions

```
[idle]           → user types query + submits → [searching]
[searching]      → results arrive             → [results]
[results]        → user clears query          → [idle]
[results]        → user clicks "Add selected" → [adding] → sources appear in panel → [idle]
```

## Component Structure

```
AddSourceDialog
├── SearchBar              — input + submit button
├── SearchControls         — source type dropdown + domain chips
│   ├── SourceTypeSelect   — popover with Web/Publication/WeChat
│   └── DomainFilter       — input to add domains + removable chips (web only)
├── SearchResults          — replaces drop zone when results exist
│   ├── SearchResultItem[] — checkbox + title/snippet/meta per result
│   └── AddSelectedButton  — "Add N selected sources"
├── DropZone               — drag-and-drop file area (hidden during search results)
└── BottomActions           — Upload files + Paste URL buttons
    ├── UploadButton        — triggers hidden file input (reuses existing logic)
    └── PasteUrlButton      — opens inline URL input (replaces old Webpage tab)
```

### Component State

```ts
interface AddSourceDialogState {
  sourceType: "web" | "publication" | "wechat";
  query: string;
  domains: string[];           // whitelist domains for web
  taskId: string | null;       // active search task
  results: SearchResult[];
  selected: Set<string>;       // selected result IDs
  isSearching: boolean;
  isAdding: boolean;           // adding selected sources
  view: "idle" | "searching" | "results";
}
```

### Polling

Reuse the existing React Query polling pattern:
- Poll `GET /api/notebooks/[id]/sources/search/[taskId]` every 2 seconds while `status === "searching"`
- Stop polling when `status === "completed"` or `"failed"`
- Show results incrementally as they appear in poll responses

## Files to Modify

| File | Change |
|------|--------|
| `components/deepdive/sources/sources-panel.tsx` | Rewrite `AddSourceDialog` component |
| `lib/actions/sources.ts` | Add `addPublicationSource`, `addWechatSource` server actions |
| `app/api/notebooks/[id]/sources/search/route.ts` | New — POST to create search task |
| `app/api/notebooks/[id]/sources/search/[taskId]/route.ts` | New — GET to poll search status |
| `lib/services/wechat-client.ts` | New — pg pool + query helpers for WeChat DB |
| `.env.local` | Add `WECHAT_DB_*` env vars |

## Dependencies

- `pg` npm package for WeChat database connection
- Tavily API key (for web search via agent)
- LangGraph agent search endpoint (separate spec — agent handles search tool execution)
