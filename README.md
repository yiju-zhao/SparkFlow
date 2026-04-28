# SparkFlow

[![Version](https://img.shields.io/badge/version-1.0.0--beta-blue.svg)](https://github.com/yiju-zhao/SparkFlow)

AI-powered research platform with generative UI, RAG notebooks, and conference discovery.

SparkFlow combines retrieval-augmented generation with a generative UI paradigm — the AI assistant dynamically renders interactive tables, charts, and forms inline in chat. Two main surfaces: **DeepDive** (per-notebook RAG over uploaded sources) and **Research Hub / Explore** (conference / publication / session discovery with generative UI).

## Architecture

```
SparkFlow/
├── docker-compose.yml          # Stack orchestration (dev + prod)
├── docker-compose.server.yml   # Corporate-network override (CA + NO_PROXY)
├── ca-certificates.crt         # Corp CA bundle (per-host, gitignored, empty OK)
├── apps/
│   ├── web/        # Next.js 16 frontend (port 3001) + BullMQ ingest worker
│   ├── langgraph/  # Python: 3 LangGraph agents (port 2024) + FastAPI workflows
│   │               # server (port 2027) + ARQ digest worker
│   ├── semops/     # Python FastAPI LOTUS semantic operators (port 2025)
│   └── toolbox/    # Prebuilt MCP tool definitions (YAML)
└── docs/
    ├── reference/                  # LangGraph / LangChain reference docs
    └── superpowers/{specs,plans}/  # Design docs + implementation plans
```

### `apps/web` — Next.js frontend

```
app/[locale]/         # i18n-scoped routes (en, zh)
  (auth)/             # Login / signup
  admin/              # Admin panel
  deepdive/[id]/      # Per-notebook research workspace
  explore/            # Research Hub
app/api/              # API routes (auth, chat, settings, notebooks, …)
components/{ui,landing,deepdive,explore}/
lib/
  services/wiki-ingest.ts   # Thin client → POST /v1/workflows/wiki/extract
  providers/list-models.ts  # Thin client → POST /v1/workflows/llm/list-models
  queue/                    # BullMQ + Redis (per-user fairness, per-notebook lock)
  types/graph.ts            # Knowledge-graph type defs (shared with Python via JSON)
  crypto.ts                 # BYOK key encryption
workers/ingest.ts     # BullMQ wiki-ingest consumer
prisma/               # Schema + migrations (use `migrate deploy`, never `db push`)
```

### `apps/langgraph` — Python backend

```
agents/{notebook,hub,deep_research}.py   # 3 surfaces: StateGraph(MessagesState)
                                         # built from llm_call ↔ tool_node primitives
prompts/                                 # Markdown system-prompt fragments
  base_identity.md / tool_use_enforcement.md
  model_hints/{openai,gemini}.md
  surfaces/{notebook,hub,deep_research}.md
prompt_builder.py                        # 64-LOC concatenator (no class, no cache)
tools/                                   # @tool functions (no registry)
  web.py / wiki.py / hub_toolbox.py / hub_ui.py / hub_nav.py / hub_wechat.py
workflows/                               # Functional API + Graph API
  search.py                # plain async (single chain, no parallelism)
  daily_digest.py          # @entrypoint + per-query parallel prefilter
  matcher/job.py           # Graph API + Send orchestrator-worker
  wiki_ingest.py           # @entrypoint chain (replaces graph-service.ts)
  digest_worker.py         # ARQ worker + adapter
server/                                  # FastAPI on :2027
  app.py
  routes/{matcher_jobs,wiki_ingest,llm_models}.py
langgraph.json                           # Registers 3 graphs for LangGraph CLI
embeddings/bge_m3.py                     # Offline backfill helper
scripts/backfill_*.py                    # One-shot embedding backfills
tests/                                   # 61 pytest, no Redis dep for unit tests
```

### LangGraph surfaces

Three graphs registered in `apps/langgraph/langgraph.json`, one file per surface:

| Surface | Module | Purpose |
|---|---|---|
| `notebook` | `agents/notebook.py:agent` | DeepDive RAG over notebook sources |
| `hub` | `agents/hub.py:agent` | Conference / session / publication discovery + generative UI |
| `deep_research` | `agents/deep_research.py:agent` | Open-web research via SearXNG / Tavily |

Each is a `StateGraph(MessagesState)` with `llm_call ↔ tool_node` per the LangGraph reference doc's "Agents → Graph API" pattern. Tools are imported directly per surface (no central registry). The hub's `tool_node` skips dispatch for tools in `HUB_FRONTEND_TOOL_NAMES` (`show_table`, `show_chart`, …) — those `AIMessage` tool_calls reach CopilotKit via the LangGraph SDK and render as React components. `should_continue` routes to `END` when *all* tool_calls in a turn are frontend (otherwise the loop would repeat them).

## Tech Stack

### Frontend (`apps/web`)

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript 5 |
| Styling | Tailwind 4, shadcn/ui |
| Auth / DB | NextAuth v5 (JWT), Prisma 7, pgvector/pg17 |
| Generative UI | CopilotKit 1.52 |
| i18n | next-intl 4.8 (en, zh) |
| Charts | ECharts, Recharts |
| Queue | BullMQ + ioredis |

### Backend (`apps/langgraph`)

| | |
|---|---|
| Agent runtime | LangGraph 1.1, LangChain, langchain-openai |
| HTTP server | FastAPI on :2027 (workflows + llm_models) |
| Queue | ARQ on Redis (digest worker) |
| Knowledge graph | networkx (Louvain), psycopg3 |
| LLM providers | OpenAI / DeepSeek / GLM / Gemini / Kimi / Minimax / custom — BYOK only |

### Backend (`apps/semops`)

LOTUS-backed semantic operators (`sem_rank`, `sem_filter`, `sem_map`) consumed by matcher / daily_digest / search workflows. Tenant isolation via `ProcessPoolExecutor` (spawn context). `sentence-transformers` + `faiss-cpu` heavy deps.

## Infrastructure

Single docker-compose stack at repo root. Two profiles control what starts:

### Default profile — `docker compose up -d`

Brings up infrastructure + workers. **In dev**, you run `web` / LangGraph / workflows-api on the host for fast hot reload while these stay in docker.

| Service | Image / Built from | Host port | Purpose |
|---|---|---|---|
| postgres | `pgvector/pgvector:pg17` | 5433 | Primary DB (pgvector) |
| redis | `redis:7-alpine` | 6379 | BullMQ + ARQ broker |
| searxng | `searxng/searxng` | 8888 | Self-hosted web search (Tavily is BYOK only) |
| semops | `apps/semops/Dockerfile` | 2025 | LOTUS semantic operators (`/api/operators/rank`) |
| ingest-worker | `apps/web/Dockerfile.worker` | — | BullMQ consumer: wiki ingest |
| digest-worker | `apps/langgraph/Dockerfile.worker` | — | ARQ consumer: daily digest |

### Prod profile — `docker compose --profile prod up -d`

Adds containerized web + workflows-api + a one-shot migrate runner. Skip in dev so `npm run dev` keeps fast HMR on the host.

| Service | Built from | Host port | Purpose |
|---|---|---|---|
| migrate | `apps/web/Dockerfile` (builder stage) | — | Runs `prisma migrate deploy` once and exits |
| web | `apps/web/Dockerfile` (runner stage) | 3001 | Next.js standalone server |
| workflows-api | `apps/langgraph/Dockerfile.workflows-api` | 2027 | FastAPI: `/v1/workflows/{matcher,daily_digest,search,wiki/extract,llm/list-models}` |

### Server overrides — `docker-compose.server.yml`

Layers on top of the base for corporate-network deploys: `NO_PROXY` env, CA-cert volume mount, `SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE` / `CURL_CA_BUNDLE`. Combine with the prod profile via `-f docker-compose.yml -f docker-compose.server.yml --profile prod`.

### Single CA bundle

Drop your corporate CA at the repo root only:

```bash
cp /path/to/your-ca.crt ./ca-certificates.crt   # or `touch` for open networks
```

All Dockerfiles read this single file via Compose's `additional_contexts: { certs: ./ }` and `COPY --from=certs ca-certificates.crt …`. No need for per-app copies.

### External services (not in compose)

| | |
|---|---|
| MinerU | PDF-to-image extraction. Configure via `MINERU_MODE=local|api`, `MINERU_LOCAL_URL`, `MINERU_API_TOKEN`. |

## Getting Started

### Prerequisites

- Node.js 24 LTS, Python 3.11+
- Docker (Compose v2.17+ for `additional_contexts`)
- (corp networks only) corporate CA bundle

### Development (local machine)

Postgres / Redis / SearXNG / semops / 2 workers in docker; Next.js + LangGraph + workflows-api on the host (fast HMR).

```bash
# 1. Install deps + env files
cd apps/web && npm install && cp .env.example .env && cd ..
cd apps/langgraph && python -m venv .venv && .venv/bin/pip install -e '.[dev]' && cp .env.example .env && cd ..

# 2. Generate one set of secrets and paste into BOTH .env files
echo "NEXTAUTH_SECRET=$(openssl rand -base64 32)"
echo "API_KEY_ENCRYPTION_SECRET=$(openssl rand -base64 32)"
echo "INTERNAL_CALLBACK_TOKEN=$(openssl rand -hex 32)   # MUST match in both .env files"

# Set ADMIN_EMAILS=your@email in apps/web/.env so first login auto-promotes you.

# 3. Start docker services + run migrations
touch ca-certificates.crt   # empty placeholder (or copy your corp CA here)
docker compose up -d
cd apps/web && npx prisma generate && npx prisma migrate deploy && cd ..
```

Then **3 terminals on the host**:

```bash
# Terminal 1 — Next.js (:3001)
cd apps/web && npm run dev

# Terminal 2 — LangGraph dev server (:2024) — the 3 agents
cd apps/langgraph && make dev

# Terminal 3 — Workflows FastAPI (:2027) — matcher / digest / wiki extract / llm models
cd apps/langgraph && make serve
```

`semops` runs in docker by default. To run it on the host instead (faster iteration on LOTUS code):

```bash
docker compose stop semops
cd apps/semops && python main.py    # then set apps/langgraph/.env: SEMOPS_API_URL=http://host.docker.internal:2025
```

Open http://localhost:3001 to verify.

### Production (server)

Everything in docker. One command brings it all up; no host node / Python process needed.

```bash
ssh <server>
git clone https://github.com/yiju-zhao/SparkFlow.git /opt/SparkFlow
cd /opt/SparkFlow
git checkout agent-dev   # or main once merged

# 1. Configure env files (rotate every secret; INTERNAL_CALLBACK_TOKEN must match in both)
cp apps/web/.env.production.example       apps/web/.env
cp apps/langgraph/.env.production.example apps/langgraph/.env
# Set NEXTAUTH_URL and NEXT_PUBLIC_* to public URLs the browser can reach.

# 2. Drop CA bundle (or empty placeholder for open networks)
cp /path/to/your-ca.crt ./ca-certificates.crt   # or `touch ca-certificates.crt`

# 3. Bring up the full stack
#    Open networks:        docker compose --profile prod up -d --build
#    Corporate networks:
docker compose -f docker-compose.yml -f docker-compose.server.yml --profile prod up -d --build
```

Compose handles startup order: postgres + redis + searxng + semops healthy → migrate runs `prisma migrate deploy` → web + workflows-api start.

```bash
# Verify
docker compose ps                                       # all 9 services Up (migrate Exited 0)
curl https://your-domain.com/                           # 307 → /en
curl https://workflows.your-domain.com/v1/healthz       # {"ok":true}
```

### Updating to a new version

```bash
cd /opt/SparkFlow
git pull
docker compose -f docker-compose.yml -f docker-compose.server.yml --profile prod up -d --build
# migrate auto-runs `prisma migrate deploy` before web restarts.
```

If `pyproject.toml` / `package.json` / `Dockerfile` changed, add `--no-cache` to the `build`. Convenience alias:

```bash
alias dcprod='docker compose -f docker-compose.yml -f docker-compose.server.yml --profile prod'
dcprod up -d --build
dcprod logs -f workflows-api
```

## Environment Variables

Two pairs of templates ship with the repo. Use the dev pair on your laptop, the prod pair on the server. **Don't mix.**

| Environment | Frontend | Backend |
|---|---|---|
| Dev | `apps/web/.env.example` → `.env` | `apps/langgraph/.env.example` → `.env` |
| Prod | `apps/web/.env.production.example` → `.env` | `apps/langgraph/.env.production.example` → `.env` |

The example files are the source of truth. Tables below cover what's required vs defaulted.

### Frontend (`apps/web/.env`)

| Variable | Description | Required |
|---|---|---|
| `NEXTAUTH_SECRET` | JWT secret | Yes (rotate per env) |
| `NEXTAUTH_URL` | Public URL the browser hits | Yes (prod); `http://localhost:3001` (dev default) |
| `API_KEY_ENCRYPTION_SECRET` | Encrypts BYOK keys at rest | Yes |
| `INTERNAL_CALLBACK_TOKEN` | Shared with `apps/langgraph` for Node↔Python auth | **Must be identical in both .env files** |
| `ADMIN_EMAILS` | Comma-separated; auto-promote on login | Yes |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Postgres credentials | Yes |
| `REDIS_URL` | BullMQ broker | Default `redis://localhost:6379` (dev); compose injects `redis://redis:6379` (prod) |
| `LANGGRAPH_API_URL` / `NEXT_PUBLIC_LANGGRAPH_API_URL` | LangGraph URL | Yes (no default works publicly) |
| `WORKFLOWS_API_URL` | Server-side workflows URL | Default `http://localhost:2027` (dev) / `http://workflows-api:2027` (prod) |
| `NEXT_PUBLIC_WORKFLOWS_API_URL` | **Browser-side** workflows URL — must be public | Yes in prod |
| `INGEST_WORKER_CONCURRENCY` / `INGEST_PER_USER_CONCURRENCY` | BullMQ tuning | Default `4` / `2` |
| `MINERU_MODE` / `MINERU_LOCAL_URL` / `MINERU_API_TOKEN` | PDF parser config | `MINERU_API_TOKEN` required when `MODE=api` |

### Backend (`apps/langgraph/.env`)

BYOK is mandatory on all user-facing paths — there is no `OPENAI_API_KEY` env fallback for user requests. Admin-only paths (e.g. backfill scripts) may still read env keys.

| Variable | Description | Required |
|---|---|---|
| `INTERNAL_CALLBACK_TOKEN` | **Must match `apps/web`** | Yes |
| `SPARKFLOW_API_URL` | Node callback base (digest completion, wiki source content) | Yes |
| `SEMOPS_API_URL` | LOTUS service URL | Default `http://semops:2025` (compose) |
| `SEARXNG_URL` | Default web-search backend | Default `http://localhost:8888` (dev) / `http://searxng:8080` (prod) |
| `DATABASE_URL` | Main DB (used by backfill scripts; NOT by workflows-api itself) | Yes |
| `REDIS_URL` | Shared BullMQ + ARQ broker | Default `redis://localhost:6379` (dev) |
| `DIGEST_WORKER_CONCURRENCY` | Digest sections per worker | Default `4` |
| `LANGSMITH_*` | LangSmith tracing | Optional (recommended in prod) |
| `WECHAT_DATABASE_URL` | External Postgres for WeChat features | Optional |

### Semops (`apps/semops/.env`)

| Variable | Description | Required |
|---|---|---|
| `SEMOPS_RANK_POOL_SIZE` | `ProcessPoolExecutor` workers for `/api/operators/rank` | No (default `min(4, cpu_count)`) |

## Data Models

Key Prisma models powering the platform:

| Domain | Models |
|---|---|
| Auth | User, Session, UserSettings |
| Notebooks | Notebook, Source, Chunk, SourceImage, NotebookGraph, WikiPage, WikiPageLog |
| Chat | ChatSession, ChatMessage |
| Notes | Note |
| Conferences | Venue, Instance, Publication, ConferenceSession |
| Toolbox | MatchJob |
| Memory (reserved, not currently read) | UserMemory, NotebookMemory |

## Development

```bash
cd apps/web        && npx tsc --noEmit         # type check
cd apps/web        && npm run lint             # ESLint
cd apps/web        && npx prisma migrate dev --name <what_changed>   # NEVER `db push`
cd apps/langgraph  && .venv/bin/python -m pytest -v                   # 61 tests, no docker dep
```

## Roadmap

| Phase | Status | Description |
|---|---|---|
| Phase 1: Foundation and Data | ✅ | Core data models, admin panel, conference + publication management |
| Phase 2: Research Hub | ✅ | Explore interface, generative UI, AI research assistant |
| Phase 3: Notebook Integration | Planned | Connect Hub discoveries to RAG notebooks; source import flow |
| Phase 4: Polish | Planned | UI/UX refinement, performance, extended i18n, prod hardening |

## License

Private — all rights reserved.
