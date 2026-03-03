# Codebase Structure

**Analysis Date:** 2026-03-03

## Directory Layout

```
SparkFlow/
├── apps/                          # Monorepo applications
│   ├── web/                      # Next.js frontend (port 3001)
│   │   ├── app/                  # Next.js app router
│   │   │   ├── api/              # API routes
│   │   │   │   ├── chat/         # Chat endpoints
│   │   │   │   ├── chat/messages/
│   │   │   │   ├── chat/sessions/
│   │   │   │   └── sources/      # Document upload/endpoints
│   │   │   ├── deepdive/         # Main notebook interface
│   │   │   │   └── [id]/         # Dynamic notebook pages
│   │   │   ├── explore/          # Explore sections
│   │   │   │   ├── publications/
│   │   │   │   ├── sessions/
│   │   │   │   └── conferences/
│   │   │   └── (auth)/          # Authentication pages
│   │   ├── components/           # React components
│   │   │   ├── ui/               # Shadcn/UI components
│   │   │   ├── deepdive/         # Notebook-specific components
│   │   │   │   ├── sources/
│   │   │   │   ├── chat/
│   │   │   │   └── studio/
│   │   │   └── user/             # User-related components
│   │   ├── lib/                  # Utility libraries and clients
│   │   │   ├── actions/          # Server actions
│   │   │   ├── auth.ts           # NextAuth configuration
│   │   │   ├── prisma.ts         # Database client
│   │   │   └── context/          # React contexts
│   │   ├── prisma/               # Database schema
│   │   │   └── schema.prisma     # Prisma schema definition
│   │   └── types/                # TypeScript type definitions
│   │
│   └── agent/                    # Python LangGraph agent (port 2024)
│       ├── graphs/               # LangGraph workflows
│       │   └── rag_agent.py     # Main RAG agent
│       ├── tools/                # Agent tools
│       │   └── ragflow.py        # RAGFlow integration tools
│       ├── prompts/              # Agent prompts
│       │   └── rag_agent.py      # System prompts
│       ├── middleware/           # LangGraph middleware
│       │   ├── chunk_accumulator.py
│       │   ├── query_optimizer.py
│       │   └── sources_context.py
│       ├── config/               # Python configuration
│       │   └── rag_agent.py      # Agent configuration
│       └── langgraph.json       # LangGraph server config
│
├── .planning/                    # Planning documents
│   └── codebase/                 # Codebase analysis
│       ├── ARCHITECTURE.md       # Architecture overview
│       └── STRUCTURE.md          # Directory structure
│
├── .github/                      # GitHub workflows
└── docs/                         # Documentation
```

## Directory Purposes

**apps/web/app/** - Next.js app router pages and API routes
- `api/`: Server-side API endpoints for chat, sources, authentication
- `deepdive/[id]/`: Dynamic notebook interface with data fetching
- `explore/`: Publication, session, and conference browsing
- `(auth)/`: Authentication-related pages

**apps/web/components/** - React component organization
- `ui/`: Reusable Shadcn/UI components
- `deepdive/`: Notebook-specific components (sources, chat, studio)
- `user/`: User navigation and profile components

**apps/web/lib/** - Shared libraries and utilities
- `actions/`: Server actions for data mutations
- `auth.ts`: Next.js authentication configuration
- `prisma.ts`: Database client instance
- `context/`: React contexts for state management

**apps/agent/** - Python LangGraph agent service
- `graphs/`: LangGraph workflow definitions
- `tools/`: Agent tools for external service integration
- `prompts/`: System prompts and templates
- `middleware/`: Request/response processing middleware

## Key File Locations

**Entry Points:**
- `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/app/deepdive/[id]/page.tsx`: Main notebook interface
- `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent/graphs/rag_agent.py`: Agent entry point

**Configuration:**
- `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/prisma/schema.prisma`: Database schema
- `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent/langgraph.json`: LangGraph server config

**Core Logic:**
- `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/lib/ragflow-client.ts`: RagFlow API client
- `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent/tools/ragflow.py`: Python RAGFlow integration

**Testing:**
- `*.test.*` and `*.spec.*` files co-located with implementation (not found in current structure)

## Naming Conventions

**Files:**
- `page.tsx`: Next.js app router pages
- `layout.tsx`: Route layouts
- `component.tsx`: React components
- `*.client.tsx`: Client components
- `*.server.tsx`: Server components
- `action.ts`: Server actions

**Directories:**
- kebab-case for directories (e.g., `deepdive`, `chat-panel`)
- PascalCase for component directories (e.g., `SourcesPanel`)

**API Routes:**
- RESTful structure (e.g., `/api/chat/messages`, `/api/sources`)

**Python Files:**
- snake_case for functions and variables
- PascalCase for classes and exceptions

## Where to Add New Code

**New Feature:**
- Primary code: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/app/deepdive/[id]/`
- Tests: Co-locate with implementation (e.g., `notebook-layout.test.tsx`)

**New Component/Module:**
- Implementation: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/components/deepdive/[feature]/`
- Styling: Use CSS modules or inline styles in component

**Utilities:**
- Shared helpers: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/lib/`
- Database queries: Use Prisma client directly in API routes/actions

**Agent Tools:**
- Implementation: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent/tools/`
- Registration: Add to tools list in `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent/graphs/rag_agent.py`

## Special Directories

**.planning/codebase/**: Generated documentation for codebase analysis
- Generated by GSD commands for planning and execution phases
- Contains ARCHITECTURE.md and STRUCTURE.md

**apps/web/prisma/**: Database schema and migrations
- Generated Prisma client stored in node_modules/.prisma/client
- Schema-driven data validation and relationships

**apps/agent/middleware/**: LangGraph-specific middleware
- Processes agent requests/responses
- Handles context injection and query optimization

---

*Structure analysis: 2026-03-03*