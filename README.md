# SparkFlow

[![Version](https://img.shields.io/badge/version-1.0.0--beta-blue.svg)](https://github.com/yiju-zhao/SparkFlow)

AI-powered research platform with generative UI, RAG notebooks, and conference discovery.

SparkFlow combines retrieval-augmented generation with a generative UI paradigm where the AI assistant dynamically creates interactive tables, charts, and visualizations on demand. It serves as both a deep research notebook and a conference discovery hub.

## Architecture

```
SparkFlow/
├── apps/
│   ├── web/          # Next.js 16 frontend (port 3001) + BullMQ ingest worker
│   ├── agent/        # LangGraph Python agents (port 2024) + ARQ digest worker
│   ├── semops/       # FastAPI SemanticOperators / matcher (port 2025)
│   └── toolbox/      # Prebuilt tool definitions (YAML)
├── docs/
├── scripts/
└── tasks/
```

### Frontend (`apps/web`)

```
apps/web/
├── app/[locale]/        # i18n-scoped routes (en, zh)
│   ├── (auth)/          # Login / signup
│   ├── admin/           # Admin panel
│   ├── deepdive/[id]/   # AI research notebooks
│   └── explore/         # Research Hub
│       ├── conferences/
│       ├── publications/
│       ├── sessions/
│       └── toolbox/
├── components/          # Shared UI components
│   ├── ui/              # shadcn/ui primitives
│   ├── landing/         # Landing page
│   ├── deepdive/        # Notebook components
│   └── explore/         # Research Hub components
├── lib/                 # Utilities and clients
└── prisma/              # Database schema
```

### Backend (`apps/agent`)

```
apps/agent/
├── graphs/       # Agent graph definitions
├── tools/        # Tool implementations
├── prompts/      # System prompts
├── config/       # Agent configuration
├── middleware/    # Request middleware
└── skills/       # Agent skills
```

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | ^16.1.6 | App Router framework |
| React | ^19.2.4 | UI library |
| TypeScript | ^5 | Type safety |
| Tailwind CSS | v4 | Utility-first styling |
| Shadcn/UI | — | Component primitives |
| CopilotKit | ^1.52.1 | Generative UI framework |
| Prisma | ^7.3.0 | Database ORM |
| NextAuth.js | v5 beta | Authentication (JWT) |
| next-intl | ^4.8.3 | Internationalization (en/zh) |
| ECharts + Recharts | ^5.6 / ^3.7 | Data visualization |
| Zod | ^4.3.5 | Schema validation |
| Framer Motion | ^12.23 | Animations |
| ExcelJS | ^4.4.0 | Excel file processing |

### Backend

| Technology | Purpose |
|-----------|---------|
| LangGraph | Agent orchestration and state management |
| LangChain | LLM tooling and chain composition |
| FastAPI | Semops service + digest workflow endpoints |
| LOTUS | Semantic operators (`sem_search`, `sem_topk`, `sem_map`) — rank runs in `ProcessPoolExecutor` subprocesses (spawn context) for tenant isolation |
| OpenAI + Google Gemini + others | LLM providers (BYOK — configured per user) |
| PageIndex | Built-in RAG pipeline (chunking, indexing, retrieval) |
| Playwright | Webpage-to-markdown conversion |
| psycopg3 | Direct PostgreSQL queries for hub tools |

### Queues & Workers

| Technology | Purpose |
|-----------|---------|
| BullMQ (Node) + ioredis | Wiki-ingest queue in `apps/web`; drained by `npm run worker:ingest` |
| ARQ (Python) | Daily-digest queue in `apps/agent`; drained by `arq workflows.digest_worker.WorkerSettings` |
| Redis 7 | Single shared broker for both queues (separate keyspaces) |

## AI Agents

LangGraph surfaces registered in `langgraph.json`:

| Surface | Entry Point | Purpose |
|---------|-------------|---------|
| `notebook_graph` | `graphs/surface.py` | Document RAG — wiki-aware deepdive agent (multi-provider via `init_chat_model`) |
| `hub_graph` | `graphs/surface.py` | Conference/session discovery with generative UI |
| `deep_research_graph` | `graphs/surface.py` | Open-web deep research with Tavily |

All three are built by the same factory (`hermes` harness) and share the tool registry; they differ by surface-level toolset + prompt. The hub surface uses a tool execution loop with conditional routing: backend tool calls (DB queries) execute server-side and loop back to the LLM, while frontend tool calls (showTable, showChart) pass through to CopilotKit for React component rendering.

## Features

**DeepDive Notebooks** -- AI research notebooks with RAG-powered Q&A. Upload documents (PDF, DOCX, TXT), ingest webpages, take markdown notes, and chat with your sources using retrieval-augmented generation.

**Research Hub (Explore)** -- Conference discovery interface with Overview, Conferences, Publications, and Sessions views. Browse conferences by venue and year, explore publications with author/affiliation data, and search sessions by topic and technology.

**Generative UI** -- The AI research assistant dynamically creates interactive tables and charts on demand via CopilotKit. Ask a question like "how many sessions in GTC 2026" and the assistant queries the database, then renders a formatted table or chart inline.

**Toolbox** -- Query matching tool that accepts Excel file imports, matches queries against conference sessions or publications using AI, and stores results in S3. Includes match job history and progress tracking.

**Internationalization** -- Full English and Chinese language support via next-intl with locale-scoped routing.

**Admin Panel** -- Management interface for conferences, venues, instances, publications, and sessions.

**Authentication** -- NextAuth.js v5 with JWT-based sessions, login/signup flows, and role-based access (User/Admin).

**Dark Mode** -- System-aware theme switching with manual override.

## Infrastructure

### Default profile (always running — `docker compose up -d`)

| Service | Image / Built from | Host port | Purpose |
|---------|--------------------|-----------|---------|
| postgres | `pgvector/pgvector:pg17` | 5433 | Primary database (pgvector) |
| redis | `redis:7-alpine` | 6379 | BullMQ + ARQ broker (AOF persistence) |
| searxng | `searxng/searxng:latest` | 8888 | Self-hosted web search (default backend; Tavily is BYOK) |
| ingest-worker | `apps/web/Dockerfile.worker` | — | BullMQ consumer: wiki-ingest |
| digest-worker | `apps/agent/Dockerfile.worker` | — | ARQ consumer: daily-digest |

### Prod profile (opt-in — `docker compose --profile prod up -d`)

Adds containerized web + workflows-api + a one-shot migrate runner. Skip
in dev so `npm run dev` keeps fast HMR on the host.

| Service | Built from | Host port | Purpose |
|---------|------------|-----------|---------|
| migrate | `apps/web/Dockerfile` (builder stage) | — | Runs `prisma migrate deploy` once and exits |
| web | `apps/web/Dockerfile` (runner stage) | 3001 | Next.js standalone server |
| workflows-api | `apps/agent/Dockerfile.workflows-api` | 2027 | FastAPI: `/v1/workflows/{matcher,daily_digest,search}` |

### External Services

| Service | Default Port | Purpose |
|---------|-------------|---------|
| MinerU | 8000 | PDF-to-image extraction |
| Semops | 2025 | FastAPI SemanticOperators + matcher |

## Getting Started

### Prerequisites

- Node.js 24 LTS (npm 10 / 11)
- Python 3.11+
- Docker and Docker Compose
- Corporate networks behind a TLS-intercepting proxy: drop your CA bundle
  at `apps/web/ca-certificates.crt` and `apps/agent/ca-certificates.crt`
  (gitignored). Empty files are fine on open networks.

---

### Development (local machine)

Setup runs Next.js + LangGraph + workflows-api on the **host** for fast
HMR; postgres / redis / searxng / workers run in **docker**.

1. **Clone, install deps, generate secrets**

```bash
# Frontend
cd apps/web
npm install
cp .env.example .env

# Backend
cd apps/agent
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env

# Generate one set of secrets and paste into BOTH .env files
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "API_KEY_ENCRYPTION_SECRET=$(openssl rand -base64 32)"
echo "INTERNAL_CALLBACK_TOKEN=$(openssl rand -hex 32)"   # MUST match in apps/web + apps/agent
```

Set `ADMIN_EMAILS=your@email` in `apps/web/.env` so your account auto-promotes on first login.

2. **Start shared services (postgres, redis, searxng, workers)**

```bash
cd apps/web
docker compose up -d
```

3. **Apply database migrations**

```bash
cd apps/web
npx prisma generate
npx prisma migrate deploy   # never `db push` — repo is baselined
```

4. **Start the four host processes (each in its own terminal)**

```bash
# Terminal 1 — Next.js (port 3001)
cd apps/web && npm run dev

# Terminal 2 — LangGraph API (port 2024)
cd apps/agent && make dev

# Terminal 3 — Workflows FastAPI (port 2027)
cd apps/agent && make serve

# Terminal 4 — Semops (port 2025)
cd apps/semops && python main.py
```

The wiki-ingest and daily-digest workers run inside docker compose, no
host process needed.

5. **Access the application**

- Frontend: http://localhost:3001
- LangGraph API: http://localhost:2024
- Workflows API health: http://localhost:2027/v1/healthz
- SearXNG: http://localhost:8888

---

### Production (server deployment)

Setup runs everything in docker, including web + workflows-api +
migrate. Single command brings it all up; no host node / langgraph
process needed.

1. **Pull the repo, install the CA bundle (corporate networks only)**

```bash
git pull
# If you're behind a TLS-intercepting proxy:
cp /path/to/your-corporate-ca.crt apps/web/ca-certificates.crt
cp /path/to/your-corporate-ca.crt apps/agent/ca-certificates.crt
# Open networks: just `touch` empty files there.
```

2. **Configure prod env files**

```bash
cp apps/web/.env.production.example   apps/web/.env
cp apps/agent/.env.production.example apps/agent/.env
```

Edit both files. **Rotate every secret** (NEXTAUTH_SECRET,
API_KEY_ENCRYPTION_SECRET, INTERNAL_CALLBACK_TOKEN, POSTGRES_PASSWORD).
Set the **public** `NEXTAUTH_URL` and all `NEXT_PUBLIC_*` URLs to
domains the user's browser can reach (not docker service names).
`INTERNAL_CALLBACK_TOKEN` MUST be identical in both files.

3. **Bring up the full stack**

```bash
cd apps/web
docker compose --profile prod up -d --build
```

Startup order (compose handles automatically):
postgres + redis + searxng healthy → migrate runs `prisma migrate deploy`
→ web + workflows-api start.

4. **Verify**

```bash
docker compose ps                                       # all services Up
curl https://your-domain.com/                           # 307 redirect to /en
curl https://workflows.your-domain.com/v1/healthz       # {"ok":true}
```

5. **Updating to a new version**

```bash
git pull
cd apps/web
docker compose --profile prod up -d --build
# migrate auto-runs `prisma migrate deploy` before web restarts.
```

For schema changes that need a worker rebuild see
`apps/web/CLAUDE.md`.

## Environment Variables

Two pairs of templates ship with the repo. **Use the dev pair on your
laptop, the prod pair on the server.** Don't mix.

| Environment | Frontend | Backend |
|---|---|---|
| Development | `apps/web/.env.example` → `.env` | `apps/agent/.env.example` → `.env` |
| Production  | `apps/web/.env.production.example` → `.env` | `apps/agent/.env.production.example` → `.env` |

The example files are the source of truth — read them for full
descriptions of every variable. The tables below summarize what's
required vs defaulted.

### Frontend (`apps/web/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXTAUTH_SECRET` | JWT secret | Yes (rotate per env) |
| `NEXTAUTH_URL` | Application URL the browser hits | Yes (prod); default `http://localhost:3001` (dev) |
| `API_KEY_ENCRYPTION_SECRET` | Encrypts BYOK API keys at rest | Yes |
| `INTERNAL_CALLBACK_TOKEN` | Shared with `apps/agent` (Python→Node digest callback) | Yes |
| `ADMIN_EMAILS` | Comma-separated; auto-promotes on login | Yes |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres credentials (compose builds DATABASE_URL from these) | Yes |
| `DATABASE_URL` | Override for non-compose use | No |
| `REDIS_URL` | BullMQ broker | Default `redis://localhost:6379` (dev); compose injects in prod |
| `INGEST_WORKER_CONCURRENCY` | Jobs per worker process | Default `4` |
| `INGEST_PER_USER_CONCURRENCY` | Max ingest jobs a single user holds | Default `2` |
| `LANGGRAPH_API_URL` / `NEXT_PUBLIC_LANGGRAPH_API_URL` | LangGraph URL | Yes in prod (no default that works publicly) |
| `WORKFLOWS_API_URL` | Server-side FastAPI URL | Default `http://localhost:2027` (dev) / `http://workflows-api:2027` (prod) |
| `NEXT_PUBLIC_WORKFLOWS_API_URL` | **Browser-side** workflows URL — must be publicly reachable | Yes in prod |
| `MINERU_MODE`, `MINERU_LOCAL_URL`, `MINERU_API_TOKEN` | PDF parser config | `MINERU_API_TOKEN` required when `MODE=api` |

### Backend (`apps/agent/.env`)

BYOK is mandatory on all user-facing paths — there is no `OPENAI_API_KEY`
fallback for user requests. Admin-only paths may still read env keys.

| Variable | Description | Required |
|----------|-------------|----------|
| `INTERNAL_CALLBACK_TOKEN` | Must match `apps/web` | Yes |
| `SPARKFLOW_API_URL` | Node callback base URL | Yes |
| `SEMOPS_API_URL` | Semops service URL | Yes |
| `DATABASE_URL` | Main SparkFlow DB (used by backfill scripts + langgraph-api) | Yes |
| `REDIS_URL` | Shared with web app (ARQ + BullMQ) | Default `redis://localhost:6379` (dev); compose injects in prod |
| `SEARXNG_URL` | Default web-search backend (Tavily is BYOK only) | Default `http://localhost:8888` (dev) / `http://searxng:8080` (prod) |
| `TOOLBOX_SERVER_URL` | Toolbox MCP server | Yes for hub agent |
| `DIGEST_WORKER_CONCURRENCY` | Digest sections per worker process | Default `4` |
| `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`, `LANGSMITH_PROJECT` | LangSmith tracing | Optional (recommended in prod) |
| `WECHAT_DATABASE_URL` | External Postgres for WeChat features | Optional |

### Semops (`apps/semops/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `SEMOPS_RANK_POOL_SIZE` | `ProcessPoolExecutor` workers for `/api/operators/rank` | No (default: `min(4, cpu_count)`) |

## Data Models

Key Prisma models powering the platform:

| Domain | Models |
|--------|--------|
| Auth | User, Session, UserSettings |
| Notebooks | Notebook, Source, Chunk, SourceImage |
| Chat | ChatSession, ChatMessage |
| Notes | Note |
| Conferences | Venue, Instance, Publication, ConferenceSession |
| Toolbox | MatchJob |

## Development

```bash
# Type checking
cd apps/web && npx tsc --noEmit

# Linting
cd apps/web && npm run lint

# Prisma schema changes
cd apps/web && npx prisma migrate dev --name <what_changed>   # NEVER `db push` — repo is baselined

# Build for production
cd apps/web && npm run build
```

## Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1: Foundation and Data | Complete | Core data models, admin panel, conference and publication management, database schema |
| Phase 2: Research Hub | Complete | Explore interface with conference discovery, generative UI components, AI-powered research assistant |
| Phase 3: Notebook Integration | Planned | Connect Research Hub discoveries to RAG notebooks for deep analysis, source import flow from Hub to Notebook |
| Phase 4: Polish and Enhancement | Planned | UI/UX refinement, performance optimization, extended internationalization coverage, production hardening |

## License

Private - All rights reserved.
