# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SparkFlow is an AI-powered research platform with generative UI, RAG notebooks, wiki knowledge bases, and conference discovery. Monorepo with five apps:

| App | Stack | Port | Purpose |
|-----|-------|------|---------|
| `apps/web` | Next.js 16, React 19, Prisma 7, Tailwind 4 | 3001 | Frontend |
| `apps/agent` | LangGraph, LangChain, Python | 2024 | AI agents (RAG + Hub) |
| `apps/semops` | Python FastAPI | 2025 | SemanticOperators + matcher jobs (renamed from `apps/matcher` in PR #67) |
| `apps/mcp-server` | Python (Flask) | 3108 | MCP server |
| `apps/toolbox` | YAML config | — | Prebuilt tool definitions |

## Commands

### Frontend (apps/web)
```bash
npm run dev              # Dev server on port 3001
npm run build            # Production build
npm run lint             # ESLint
npx tsc --noEmit         # Type check
npx prisma generate               # Regenerate client after schema edits
npx prisma migrate dev --name X   # Create + apply a migration (dev)
npx prisma migrate deploy         # Apply pending migrations (production)
# Never use `db push` — repo is baselined to Prisma Migrate. See apps/web/CLAUDE.md.
```

### Backend (apps/agent)
```bash
langgraph dev --host 0.0.0.0 --port 2024

# Daily-digest worker (ARQ). Drains user-triggered digest generation jobs.
arq workflows.digest_worker.WorkerSettings
```

### Workers (apps/web)
```bash
# Wiki-ingest worker (BullMQ). Drains the queue of source → graph → wiki jobs.
# Run in its own terminal alongside `npm run dev`.
npm run worker:ingest
```

### Infrastructure
```bash
# Starts postgres + redis + ingest-worker + digest-worker together.
cd apps/web && docker compose up -d
```

## Architecture

### Frontend Routing

Next.js App Router with next-intl i18n. All user-facing routes are under `app/[locale]/` with `localePrefix: "always"` (locales: `en`, `zh`).

```
app/[locale]/
├── (auth)/              # Login/signup (route group, not in URL)
├── admin/               # Admin panel (users, venues, instances, sessions, publications)
├── deepdive/[id]/       # AI research notebooks (chat + wiki + notes)
├── explore/             # Research Hub
│   ├── conferences/     # Browse venues/instances
│   │   ├── publications/  # Browse & view publications
│   │   └── sessions/      # Browse & view conference sessions
│   ├── social-media/
│   │   └── wechat/      # WeChat articles (external DB)
│   └── toolbox/matcher/ # Query matching tool + history
├── settings/            # User settings (model selection, API keys)
└── access-denied/       # Authorization error page
```

API routes live at `app/api/` (not locale-scoped): auth, chat, copilotkit, download, explore, images, matcher, models, notebooks (with wiki/notes/sources/ingest sub-routes), settings (with resolve-key), signup, wechat (articles/sources/images from external DB).

### Key Integrations

- **CopilotKit** — Generative UI framework. The hub agent returns frontend tool calls (showTable, showChart) that CopilotKit renders as React components inline in chat.
- **PageIndex** — Built-in RAG pipeline for chunking, indexing, and retrieval. Replaces the former RagFlow integration.
- **Prisma** — ORM with PostgreSQL. Schema at `apps/web/prisma/schema.prisma`. Key domains: User/Auth/UserSettings, Notebook/Source/SourceImage/Chunk, WikiPage/NotebookGraph, Note, ChatSession/ChatMessage, Venue/Instance/Publication/ConferenceSession, MatchJob.
- **MinerU** (port 8000) — PDF-to-image extraction. Supports local mode (`MINERU_LOCAL_URL`) and API mode (`MINERU_API_TOKEN`).

### Wiki / Knowledge Base

Each notebook has an auto-generated wiki built from its sources:

1. Source uploaded → content extracted (MinerU for PDFs, Playwright for web)
2. Upload API enqueues a BullMQ job (`lib/queue/ingest-queue.ts`); the `ingest-worker` process drains it
3. Worker calls `ingestSourceToWiki()` (`lib/services/wiki-ingest.ts`) which extracts a knowledge graph via the LLM
4. Graph merged into `NotebookGraph`, clustered via Louvain algorithm (`lib/services/graph-service.ts`)
5. Wiki pages built outside any DB transaction (LLM calls), then upserted atomically inside one `prisma.$transaction` alongside the graph + orphan-page delete + log append
6. Pages stored as `WikiPage` with types: ENTITY, CONCEPT, SUMMARY, COMPARISON, INDEX, LOG, ARTICLE
7. RAG agent injects wiki context but cites original sources (wiki is invisible to user)

Key files: `lib/services/wiki-ingest.ts`, `lib/services/graph-service.ts`, `lib/queue/*.ts`, `workers/ingest.ts`, `components/deepdive/wiki/`.

### Task Parallelization (queues & workers)

The platform has four kinds of user-initiated long-running tasks. Each is handled independently so concurrent users never block each other (see `docs/superpowers/specs/2026-04-24-task-parallelization-design.md`):

| Task | Mechanism | Driver |
|------|-----------|--------|
| wiki-ingest | BullMQ queue on Redis | `apps/web/workers/ingest.ts` (Node, tsx) |
| matcher rank | `ProcessPoolExecutor` (spawn context) inside the FastAPI process | `apps/semops/services/_pool.py` + `_lotus_worker.py` |
| search top-X | Synchronous HTTP, BYOK Tavily key per request | `apps/agent/tools/web.py::search_web` |
| daily-digest | ARQ queue on Redis | `apps/agent/workflows/digest_worker.py` |

Correctness invariants:
- **Per-user fairness**: Lua-atomic semaphore in `apps/web/lib/queue/user-slot.ts` caps per-user slots (`INGEST_PER_USER_CONCURRENCY`, default 2).
- **Per-notebook mutex**: `apps/web/lib/queue/notebook-lock.ts` uses Redis `SET NX PX` with a heartbeat that extends TTL while the worker is alive (survives 30 s–2 min ingests).
- **LOTUS tenant isolation**: each semops subprocess owns its own `lotus.settings.lm` global; configured per request and reset in `finally`. A poisoned worker kills + rebuilds the pool.
- **ARQ `_job_id` dedup**: digest jobs keyed on `digest:section:{section_id}` — retrying the same section is idempotent.

### BYOK (Bring Your Own Key)

Users can configure their own API keys per LLM provider in Settings:

- **Providers**: openai, gemini, deepseek, glm (Zhipu), minimax, kimi (Moonshot), custom
- **Storage**: Encrypted in `UserSettings.apiKeys` via `lib/crypto.ts`
- **Resolution**: `lib/services/api-key-resolver.ts` — user key takes priority, falls back to system env vars for admins
- **Integration**: Resolved key threaded through chat panel → LangGraph agent

### Agent Architecture

Two LangGraph agents registered in `apps/agent/langgraph.json`:

| Graph | Entry | Purpose |
|-------|-------|---------|
| `agent` | `graphs/rag_agent.py:agent` | Document RAG with wiki context injection (multi-provider) |
| `hub` | `graphs/hub_agent.py:agent` | Conference/session discovery with generative UI |

Both agents are LLM-provider-agnostic via `init_chat_model` — support OpenAI-compatible APIs and Google (Gemini). Provider/model configured per-user through BYOK settings.

The RAG agent injects wiki knowledge into the system prompt and has wiki search/navigation tools. It cites original sources, not wiki pages.

The hub agent uses a tool execution loop with conditional routing: backend tool calls (DB queries via `tools/hub_toolbox.py`) execute server-side and loop back to the LLM; frontend tool calls pass through to CopilotKit for React rendering.

## Services

| Service | Port | Purpose |
|---------|------|---------|
| PostgreSQL | 5433 | Primary database (via Prisma) |
| Redis | 6379 | BullMQ + ARQ queue broker (started by `docker compose up`) |
| MinerU | 8000 | PDF-to-image extraction (local or API mode) |
| Semops | 2025 | SemanticOperators + matcher jobs service (internally uses `ProcessPoolExecutor` to parallelize rank) |
| MCP Server | 3108 | Model Context Protocol server |
| ingest-worker | — | BullMQ consumer for wiki-ingest jobs |
| digest-worker | — | ARQ consumer for daily-digest jobs |

## Environment

Frontend (`apps/web/.env.local`):
- Auth: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAILS`, `API_KEY_ENCRYPTION_SECRET`
- DB: `DATABASE_URL`, `POSTGRES_USER/PASSWORD/DB`
- Redis + workers: `REDIS_URL`, `REDIS_PORT`, `INGEST_WORKER_CONCURRENCY`, `INGEST_PER_USER_CONCURRENCY`
- Services: `LANGGRAPH_API_URL` / `NEXT_PUBLIC_LANGGRAPH_API_URL` (port 2024), `WORKFLOWS_API_URL` / `NEXT_PUBLIC_WORKFLOWS_API_URL`, `MCP_SERVER_URL` (port 3108), `INTERNAL_CALLBACK_TOKEN`
- MinerU: `MINERU_MODE` (local/api), `MINERU_LOCAL_URL`, `MINERU_API_TOKEN`
- WeChat: `WECHAT_DATABASE_URL` (external Postgres for WeChat articles)

Backend (`apps/agent/.env`):
- AI: per-request BYOK is mandatory; no admin env fallback for user-facing calls
- PageIndex: `PAGEINDEX_MODEL`, `PAGEINDEX_API_KEY`, `SPARKFLOW_API_URL`
- DB: `CHECKPOINT_DB_URL`, `DATABASE_URL`
- Redis + digest worker: `REDIS_URL`, `DIGEST_WORKER_CONCURRENCY`
- Callback: `INTERNAL_CALLBACK_TOKEN` (must match `apps/web`)
- Hub: `TOOLBOX_SERVER_URL` (port 5000), `MCP_SERVER_URL`, `HUB_MODEL_PROVIDER/NAME`
- Observability: `LANGSMITH_API_KEY`, `ENABLE_PROMPT_OPTIMIZER`

Semops (`apps/semops/.env`):
- `SEMOPS_RANK_POOL_SIZE` — number of `ProcessPoolExecutor` workers serving `/api/operators/rank` (default `min(4, cpu_count)`)

See `.env.example` in each app.

## Rules

1. Plan before coding — present a design and get approval before implementation. Design docs, plans, and task notes can live under `docs/`, `tasks/`, or `designs/` (all tracked in git); in-session task tracking uses the TaskCreate tool, not a file.
2. Keep changes minimal — only touch relevant code
3. No temporary fixes — find root causes
4. **Never commit or force-push files listed in `.gitignore`** — this includes `.claude/`, `.superpowers/`, `.env*`, and any `*.bak` files. If a previously tracked file needs to be ignored, use `git rm --cached` to untrack it first.
5. **After completing work, use `/claude-md-improver` to update CLAUDE.md files with current state, patterns, and learnings at the appropriate target level (root, package, or feature)**
