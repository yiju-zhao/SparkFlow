# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

SparkFlow is an AI-powered research platform with generative UI, RAG notebooks, wiki knowledge bases, and conference discovery. Monorepo with five apps:

| App | Stack | Port | Purpose |
|-----|-------|------|---------|
| `apps/web` | Next.js 16, React 19, Prisma 7, Tailwind 4 | 3001 | Frontend |
| `apps/agent` | LangGraph, LangChain, Python | 2024 | AI agents (RAG + Hub) |
| `apps/matcher` | Python FastAPI | 2025 | Standalone matcher service |
| `apps/mcp-server` | Python (Flask) | 3108 | MCP server |
| `apps/toolbox` | YAML config | — | Prebuilt tool definitions |

## Commands

### Frontend (apps/web)
```bash
npm run dev              # Dev server on port 3001
npm run build            # Production build
npm run lint             # ESLint
npx tsc --noEmit         # Type check
npx prisma generate      # After schema changes
npx prisma db push       # Sync schema to DB (dev only)
```

### Backend (apps/agent)
```bash
langgraph dev --host 0.0.0.0 --port 2024
```

### Infrastructure
```bash
cd apps/web && docker compose up -d   # postgres
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
2. `ingestSourceToWiki()` (`lib/services/wiki-ingest.ts`) calls agent to extract a knowledge graph (entities + relationships)
3. Graph merged into `NotebookGraph`, clustered via Louvain algorithm (`lib/services/graph-service.ts`)
4. Wiki pages auto-generated per community cluster
5. Pages stored as `WikiPage` with types: ENTITY, CONCEPT, SUMMARY, COMPARISON, INDEX, LOG, ARTICLE
6. RAG agent injects wiki context but cites original sources (wiki is invisible to user)

Key files: `lib/services/wiki-ingest.ts`, `lib/services/graph-service.ts`, `lib/services/wiki-health.ts`, `components/deepdive/wiki/`.

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
| MinerU | 8000 | PDF-to-image extraction (local or API mode) |
| Matcher | 2025 | Query matching service |
| MCP Server | 3108 | Model Context Protocol server |

## Environment

Frontend (`apps/web/.env.local`):
- Auth: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `ADMIN_EMAILS`
- DB: `DATABASE_URL`, `POSTGRES_USER/PASSWORD/DB`
- Services: `NEXT_PUBLIC_LANGGRAPH_API_URL` (port 2024), `NEXT_PUBLIC_MATCHER_API_URL` (port 2025), `MCP_SERVER_URL` (port 3108)
- MinerU: `MINERU_MODE` (local/api), `MINERU_LOCAL_URL`, `MINERU_API_TOKEN`
- AI: `OPENAI_API_KEY`, `OPENAI_MODELS`, `GOOGLE_MODELS`, `DEFAULT_MODEL_PROVIDER`, `DEFAULT_MODEL_NAME`
- WeChat: `WECHAT_DATABASE_URL` (external Postgres for WeChat articles)

Backend (`apps/agent/.env`):
- AI: `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `DEFAULT_MODEL_PROVIDER`, `DEFAULT_MODEL_NAME`
- PageIndex: `PAGEINDEX_MODEL`, `PAGEINDEX_API_KEY`, `SPARKFLOW_API_URL`
- DB: `CHECKPOINT_DB_URL`, `DATABASE_URL`
- Hub: `TOOLBOX_SERVER_URL` (port 5000), `MCP_SERVER_URL`, `HUB_MODEL_PROVIDER/NAME`
- Observability: `LANGSMITH_API_KEY`, `ENABLE_PROMPT_OPTIMIZER`

See `.env.example` in each app.

## Rules

1. Plan before coding — write to `tasks/todo.md`, get approval first
2. Keep changes minimal — only touch relevant code
3. No temporary fixes — find root causes
4. **After completing work, use `/claude-md-improver` to update CLAUDE.md files with current state, patterns, and learnings at the appropriate target level (root, package, or feature)**
