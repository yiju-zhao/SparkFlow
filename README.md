# SparkFlow

[![Version](https://img.shields.io/badge/version-1.0.0--beta-blue.svg)](https://github.com/yiju-zhao/SparkFlow)

AI-powered research platform with generative UI, RAG notebooks, and conference discovery.

SparkFlow combines retrieval-augmented generation with a generative UI paradigm where the AI assistant dynamically creates interactive tables, charts, and visualizations on demand. It serves as both a deep research notebook and a conference discovery hub.

## Architecture

```
SparkFlow/
├── apps/
│   ├── web/          # Next.js 16 frontend (port 3001)
│   ├── agent/        # LangGraph Python agents (port 2024)
│   └── matcher/      # Standalone Python matcher service
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
| OpenAI + Google Gemini | LLM providers |
| RagFlow SDK | RAG pipeline (chunking, indexing, retrieval) |
| psycopg3 | Direct PostgreSQL queries for hub tools |

## AI Agents

Three LangGraph agents are registered in `langgraph.json`:

| Agent | Entry Point | Purpose |
|-------|-------------|---------|
| `agent` | `graphs/rag_agent.py` | Document RAG queries (OpenAI) |
| `agent_gemini` | `graphs/rag_agent_gemini.py` | Document RAG queries (Gemini) |
| `hub` | `graphs/hub_agent.py` | Conference/session discovery with generative UI |

The hub agent uses a tool execution loop with conditional routing: backend tool calls (database queries) execute and loop back to the LLM, while frontend tool calls (showTable, showChart) pass through to CopilotKit for React component rendering.

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
| PostgreSQL | `postgres:17-alpine` | 5433 | Primary database |
| MinIO | `minio/minio` | 9004 (API), 9005 (console) | S3-compatible object storage |
| Crawl4AI | `unclecode/crawl4ai` | 11235 | Webpage-to-markdown conversion |

### External Services

| Service | Default Port | Purpose |
|---------|-------------|---------|
| RagFlow | 9380 | RAG pipeline (chunking, indexing, retrieval) |
| MinerU | 8000 | PDF-to-image extraction |

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
npx prisma db push
```

4. **Start development servers**

```bash
# Terminal 1: Frontend
cd apps/web
npm run dev

# Terminal 2: Agent service
cd apps/agent
langgraph dev --host 0.0.0.0 --port 2024
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
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `NEXT_PUBLIC_LANGGRAPH_API_URL` | LangGraph server URL | No (default: `http://localhost:2024`) |
| `RAGFLOW_BASE_URL` | RagFlow API URL | No (default: `http://localhost:9380`) |
| `RAGFLOW_API_KEY` | RagFlow API key | No |
| `S3_ENDPOINT` | MinIO/S3 endpoint | No (default: `http://localhost:9004`) |
| `S3_ACCESS_KEY` | S3 access key | No (default: `minioadmin`) |
| `S3_SECRET_KEY` | S3 secret key | No (default: `minioadmin`) |
| `S3_BUCKET_NAME` | S3 bucket name | No (default: `sparkflow-images`) |

### Backend (`apps/agent/.env`)

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | Yes |
| `GOOGLE_API_KEY` | Google Gemini API key | No |
| `RAGFLOW_BASE_URL` | RagFlow API URL | No (default: `http://localhost:9380`) |
| `RAGFLOW_API_KEY` | RagFlow API key | No |

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
cd apps/web && npx prisma generate && npx prisma db push

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
