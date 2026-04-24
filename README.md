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
│   ├── mcp-server/   # MCP server (port 3108)
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

### Docker Services

```bash
cd apps/web && docker compose up -d
```

| Service | Image | Ports | Purpose |
|---------|-------|-------|---------|
| postgres | `pgvector/pgvector:pg17` | 5433 | Primary database (pgvector) |
| redis | `redis:7-alpine` | 6379 | BullMQ + ARQ broker (AOF persistence) |
| ingest-worker | built from `apps/web/Dockerfile.worker` | — | BullMQ consumer: wiki-ingest |
| digest-worker | built from `apps/agent/Dockerfile` | — | ARQ consumer: daily-digest |

### External Services

| Service | Default Port | Purpose |
|---------|-------------|---------|
| MinerU | 8000 | PDF-to-image extraction |
| Semops | 2025 | FastAPI SemanticOperators + matcher |
| MCP Server | 3108 | Model Context Protocol server |

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Docker and Docker Compose (for infrastructure services)

### Setup

1. **Clone and install dependencies**

```bash
# Frontend
cd apps/web
npm install
cp .env.example .env.local

# Backend
cd apps/agent
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

2. **Start infrastructure**

```bash
cd apps/web
docker compose up -d
```

3. **Setup database**

```bash
cd apps/web
npx prisma generate
npx prisma migrate deploy   # apply migrations (never `db push` — repo is baselined)
```

4. **Start development servers**

```bash
# Terminal 1: Frontend
cd apps/web
npm run dev

# Terminal 2: Wiki-ingest worker (BullMQ)
cd apps/web
npm run worker:ingest

# Terminal 3: Agent service (LangGraph)
cd apps/agent
langgraph dev --host 0.0.0.0 --port 2024

# Terminal 4: Daily-digest worker (ARQ)
cd apps/agent
arq workflows.digest_worker.WorkerSettings
```

5. **Access the application**

- Frontend: http://localhost:3001
- LangGraph API: http://localhost:2024

## Environment Variables

### Frontend (`apps/web/.env.local`)

| Variable | Description | Required |
|----------|-------------|----------|
| `NEXTAUTH_SECRET` | JWT secret for authentication | Yes |
| `NEXTAUTH_URL` | Application URL | No (default: `http://localhost:3001`) |
| `API_KEY_ENCRYPTION_SECRET` | Encrypts BYOK API keys at rest | Yes |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `REDIS_URL` | BullMQ broker | Yes (default: `redis://localhost:6379`) |
| `INGEST_WORKER_CONCURRENCY` | Jobs in flight per ingest-worker process | No (default: `4`) |
| `INGEST_PER_USER_CONCURRENCY` | Max ingest jobs a single user holds | No (default: `2`) |
| `LANGGRAPH_API_URL` / `NEXT_PUBLIC_LANGGRAPH_API_URL` | LangGraph server URL | No (default: `http://localhost:2024`) |
| `WORKFLOWS_API_URL` / `NEXT_PUBLIC_WORKFLOWS_API_URL` | FastAPI workflow server | No (default: `http://localhost:2027`) |
| `INTERNAL_CALLBACK_TOKEN` | Shared secret for Python → Node digest callbacks | Yes |
| `MINERU_LOCAL_URL` | MinerU (PDF) endpoint | No (default: `http://localhost:8000`) |

### Backend (`apps/agent/.env`)

BYOK is mandatory on all user-facing paths — there is no `OPENAI_API_KEY`
fallback for user requests. Admin-only paths (observability, warm-up) may
still read env keys.

| Variable | Description | Required |
|----------|-------------|----------|
| `REDIS_URL` | Shared with the web app (ARQ + BullMQ) | Yes |
| `DIGEST_WORKER_CONCURRENCY` | Digest sections per worker process | No (default: `4`) |
| `INTERNAL_CALLBACK_TOKEN` | Must match `apps/web` | Yes |
| `SPARKFLOW_API_URL` | Node callback base URL | Yes |
| `SEMOPS_API_URL` | Semops service URL | Yes |
| `CHECKPOINT_DB_URL` | LangGraph checkpointer DB | Yes |

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
