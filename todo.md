# SparkFlow Migration Todo List

**Migration from:** DeepSight-Django
**Target:** SparkFlow (Next.js 15 + FastAPI)
**Status:** Planning Complete ✓
**Started:** 2025-12-31

---

## Phase 1: Foundation & Scaffolding ✓ COMPLETED

### 1.1 Next.js Frontend Setup ✓
- [x] Create Next.js 15 app with TypeScript, Tailwind, ESLint
- [x] Install core dependencies (`lucide-react`, `clsx`, `tailwind-merge`, `@tanstack/react-query`)
- [x] Install Shadcn/UI components (button, dialog, input, textarea, badge, tabs, dropdown-menu, popover)
- [x] Install Framer Motion for animations
- [x] Configure Tailwind with custom design tokens
  - [x] Huawei Red (#CE0E2D) accent color
  - [x] Custom shadows (subtle, sm, md, lg)
  - [x] Custom scrollbar styling
  - [x] Animation keyframes (slideUp, sweep)

### 1.2 FastAPI Backend Setup ✓
- [x] Create Python project structure
- [x] Create requirements.txt with FastAPI + dependencies
- [x] Setup directory structure (`app/agents/`, `app/api/`, `app/core/`, `app/models/`)
- [x] Create `main.py` with CORS configuration for Next.js (port 3001)
- [x] Create `.env.example` with all required environment variables

### 1.3 Migrate Agent Logic ✓
**Source:** `/backend/agents/rag_agent/`

- [x] Copy `config.py` → `apps/agent/app/agents/config.py`
  - Updated model names: gpt-4o (main), gpt-4o-mini (nano)
- [x] Copy `prompts.py` → `apps/agent/app/agents/prompts.py` (no changes)
- [x] Copy `states.py` → `apps/agent/app/agents/states.py`
  - [x] Replaced `CopilotKitState` with TypedDict
  - [x] Added LangGraph message annotations
- [x] Copy `tools.py` → `apps/agent/app/agents/tools.py` (no changes needed)

---

## Phase 2: Database & Authentication ✓ COMPLETED

### 2.1 Prisma Schema ✓
**File:** `apps/web/prisma/schema.prisma`

- [x] Define `User` model (id, username, email, passwordHash)
- [x] Define `Session` model (for NextAuth)
- [x] Define `Notebook` model (with RagFlow IDs, unique constraint on userId+name)
- [x] Define `Source` model (DOCUMENT/WEBPAGE types, status tracking)
- [x] Define `ChatSession` model (ACTIVE/CLOSED/ARCHIVED status)
- [x] Define `ChatMessage` model (USER/ASSISTANT sender)
- [x] Define `Note` model (with tags, pinning, markdown content)
- [x] Run `prisma generate` ✓

### 2.2 NextAuth.js Setup ✓
- [x] Install `next-auth@beta` and `bcryptjs`
- [x] Create `lib/auth.ts` with Credentials provider
- [x] Create `lib/prisma.ts` utility
- [x] Create `/app/api/auth/[...nextauth]/route.ts`
- [x] Create `/app/(auth)/login/page.tsx`
- [x] Create `/app/(auth)/signup/page.tsx`
- [x] Create `/app/api/signup/route.ts`
- [x] Add middleware for protected routes
- [x] Create `types/next-auth.d.ts` for session typing

### 2.3 FastAPI Auth ✓
- [x] Create `apps/agent/app/core/auth.py` with JWT validation
- [x] Implement `get_current_user()` dependency
- [x] Implement `get_optional_user()` for optional auth
- [x] Share JWT_SECRET with NextAuth via environment

---

## Phase 3: Agent API Endpoints

### 3.1 Chat Streaming Endpoint
- [ ] Create `/api/chat` in `apps/agent/app/api/chat.py`
- [ ] Accept: `notebook_id`, `session_id`, `message`, `user_id`
- [ ] Load notebook config and validate access
- [ ] Initialize LangGraph agent with notebook context
- [ ] Stream via `StreamingResponse` (SSE)
- [ ] Format for Vercel AI SDK compatibility

### 3.2 Remove Legacy Dependencies
- [ ] Remove all `copilotkit` imports
- [ ] Remove Django session auth from `server.py`
- [ ] Remove `verify_django_session()` function
- [ ] Remove ingestion logic references

---

## Phase 4: Frontend Implementation

### 4.1 Dashboard Page
**File:** `app/dashboard/page.tsx`

- [ ] Create dashboard layout with notebook list
- [ ] Implement `createNotebook` Server Action
- [ ] Implement `deleteNotebook` Server Action
- [ ] Fetch notebooks via API route + `useQuery`
- [ ] Display: name, description, last activity, source count

### 4.2 Studio Layout
**File:** `app/studio/[id]/page.tsx`

- [ ] Create 3-panel CSS Grid layout (3fr | 7.5fr | 3.5fr)
- [ ] Implement collapsible sources panel (56px collapsed)
- [ ] Implement expandable studio panel
- [ ] Add Framer Motion panel transitions

### 4.3 Chat Panel
**File:** `components/chat/chat-panel.tsx`

- [ ] Install `ai` package (Vercel AI SDK)
- [ ] Implement `useChat` hook connected to FastAPI
- [ ] Display messages (user/assistant)
- [ ] Add "Add to Notes" button
- [ ] Handle streaming with optimistic updates

### 4.4 Sources Panel
**File:** `components/sources/sources-panel.tsx`

- [ ] List sources with status indicators
- [ ] Create "Add Source" modal (document upload OR webpage URL)
- [ ] Implement document upload → RagFlow flow
- [ ] Implement webpage URL → processing flow (TBD)
- [ ] Display: title, type, status, date
- [ ] Add delete functionality

### 4.5 Notes Panel
**File:** `components/studio/studio-panel.tsx`

- [ ] List notes with card layout
- [ ] Markdown viewer with KaTeX math (`react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`)
- [ ] Edit/view toggle
- [ ] Tag display and management
- [ ] Delete confirmation dialog
- [ ] Pin/unpin functionality

### 4.6 Modal System
- [ ] Create modal state management in layout
- [ ] File preview modal
- [ ] Notebook settings modal
- [ ] Add source modal
- [ ] Use Radix UI Dialog + Framer Motion animations

---

## Phase 5: API Integration & Server Actions

### 5.1 API Routes (Next.js)
- [ ] `/api/notebooks` - CRUD operations
- [ ] `/api/notebooks/[id]/notes` - Notes management
- [ ] `/api/notebooks/[id]/sessions` - Chat sessions
- [ ] `/api/notebooks/[id]/sources` - Sources (read-only)

### 5.2 Server Actions
- [ ] `actions/notebooks.ts` - createNotebook, updateNotebook, deleteNotebook
- [ ] `actions/notes.ts` - createNote, updateNote, deleteNote, pinNote
- [ ] `actions/sources.ts` - uploadDocument, addWebpage, deleteSource
- [ ] `actions/sessions.ts` - createSession, closeSession, archiveSession

### 5.3 RagFlow Integration
**File:** `lib/ragflow-client.ts`

- [ ] Implement `createDataset(name)`
- [ ] Implement `uploadDocument(datasetId, file)`
- [ ] Implement `addWebpage(datasetId, url)` (if supported)
- [ ] Implement `deleteDocument(documentId)`
- [ ] Create Server Action: `uploadDocument(notebookId, file)`
  - [ ] Validate user ownership
  - [ ] Upload to RagFlow
  - [ ] Create Source record in Prisma
  - [ ] Track status (uploading → processing → ready)

---

## Phase 6: Polish & Deployment

### 6.1 UI Refinement
- [ ] Implement dark mode with `next-themes`
- [ ] Apply Huawei design tokens
- [ ] Custom scrollbar styling
- [ ] Smooth panel resize transitions

### 6.2 Environment Configuration
- [ ] Create `apps/web/.env.local`
  - [ ] NEXTAUTH_SECRET, NEXTAUTH_URL
  - [ ] DATABASE_URL
  - [ ] AGENT_API_URL (http://localhost:8101)
  - [ ] RAGFLOW_API_KEY, RAGFLOW_BASE_URL
- [ ] Create `apps/agent/.env`
  - [ ] OPENAI_API_KEY
  - [ ] GOOGLE_API_KEY (optional)
  - [ ] MCP_SERVER_URL
  - [ ] DATABASE_URL (if needed)
- [ ] Configure ports (Next.js: 3001, FastAPI: 8101)
- [ ] Document environment variables in README

### 6.3 Deployment
- [ ] Add Docker configuration for FastAPI
- [ ] Configure Vercel for Next.js
- [ ] Setup Railway/Render for FastAPI
- [ ] Test production builds

---

## Success Criteria Checklist

- [ ] User authentication (signup/login) works
- [ ] Users can create/delete notebooks
- [ ] Users can navigate to studio view
- [ ] Users can upload documents as sources
- [ ] Users can add webpages as sources
- [ ] Source status shows uploading/processing/ready
- [ ] Users can chat with RAG agent
- [ ] Chat streams in real-time
- [ ] Users can convert messages to notes
- [ ] Users can create/edit/delete notes
- [ ] Notes render markdown + math (KaTeX)
- [ ] All data scoped to authenticated user
- [ ] No Django/CopilotKit dependencies in code
- [ ] Both systems run in parallel (no port conflicts)

---

## Out of Scope (Future)

- Reports generation
- Podcast creation
- Conference management
- Data migration from DeepSight
- Complex ingestion pipeline
- MinIO storage integration

---

## Progress Summary

**Phase 1:** ✅ Complete (100%)
**Phase 2:** ✅ Complete (100%)
**Phase 3:** ⬜ Not Started
**Phase 4:** ⬜ Not Started
**Phase 5:** ⬜ Not Started
**Phase 6:** ⬜ Not Started

**Overall:** ~33% Complete (2/6 phases)

---

## Review Section

_This section will be populated with summaries of changes, decisions, and learnings as the migration progresses._

### Session 1: Planning & Phase 1 Implementation (2025-12-31)

**Planning:**
- Explored DeepSight-Django codebase comprehensively
- Defined migration scope (core features only)
- Created migration plan and todo tracking
- Decisions made:
  - Simplify ingestion to direct RagFlow upload
  - Fresh start (no data migration)
  - Parallel development (different ports)
  - Remove reports, podcasts, conferences from initial scope

**Phase 1 - Foundation & Scaffolding (COMPLETED):**
- Created Next.js 15 app at `apps/web/`
  - TypeScript, Tailwind CSS v4, ESLint configured
  - Installed Shadcn/UI components (8 components)
  - Installed core dependencies: lucide-react, clsx, tailwind-merge, @tanstack/react-query, framer-motion
  - Configured Huawei design system in globals.css
    - Accent color: oklch(0.44 0.19 16) - Huawei Red #CE0E2D
    - Custom shadow system (.shadow-huawei-sm, -md, -lg)
    - Custom scrollbar styling (8px width)
    - Animation keyframes (slideUp, sweep)
- Created FastAPI backend at `apps/agent/`
  - Directory structure: app/agents/, app/api/, app/core/, app/models/
  - Created requirements.txt with LangGraph, LangChain, OpenAI, FastAPI
  - Created main.py with CORS for Next.js (port 3001)
  - Created .env.example with required variables
- Migrated agent logic from DeepSight:
  - config.py: Updated model names (gpt-4o, gpt-4o-mini)
  - prompts.py: Copied as-is (no changes)
  - states.py: Replaced CopilotKitState with TypedDict + LangGraph annotations
  - tools.py: Copied as-is (MCP integration unchanged)

**Files Created:**
- `apps/web/` - Full Next.js 15 app
- `apps/agent/app/main.py` - FastAPI entry point
- `apps/agent/requirements.txt` - Python dependencies
- `apps/agent/.env.example` - Environment template
- `apps/agent/app/agents/config.py` - Agent configuration
- `apps/agent/app/agents/states.py` - State definitions (TypedDict)
- `apps/agent/app/agents/prompts.py` - System prompts
- `apps/agent/app/agents/tools.py` - MCP retrieval tools

**Next Steps:**
- Phase 3: Create chat streaming endpoint

**Phase 2 - Database & Authentication (COMPLETED):**
- Created Prisma schema with 7 models:
  - User (id, username, email, passwordHash)
  - Session (NextAuth session storage)
  - Notebook (with RagFlow integration fields)
  - Source (DOCUMENT/WEBPAGE types, status enum)
  - ChatSession (status: ACTIVE/CLOSED/ARCHIVED)
  - ChatMessage (sender: USER/ASSISTANT)
  - Note (with tags, pinning, markdown)
- Configured Prisma 7 with prisma.config.ts
- Generated Prisma client
- Setup NextAuth.js v5:
  - Created lib/auth.ts with Credentials provider
  - Created lib/prisma.ts singleton
  - Created API route handler
  - Created middleware for route protection
  - Added TypeScript types for session
- Created auth pages:
  - /login - Sign in form
  - /signup - Registration form
  - /api/signup - User creation endpoint
- Created FastAPI JWT auth:
  - apps/agent/app/core/auth.py
  - get_current_user() dependency
  - get_optional_user() for optional auth
  - Shared secret with NextAuth

**Files Created:**
- `apps/web/prisma/schema.prisma` - Database models
- `apps/web/lib/auth.ts` - NextAuth configuration
- `apps/web/lib/prisma.ts` - Prisma client singleton
- `apps/web/middleware.ts` - Route protection
- `apps/web/types/next-auth.d.ts` - Session types
- `apps/web/app/api/auth/[...nextauth]/route.ts` - Auth API
- `apps/web/app/api/signup/route.ts` - Signup API
- `apps/web/app/(auth)/login/page.tsx` - Login page
- `apps/web/app/(auth)/signup/page.tsx` - Signup page
- `apps/agent/app/core/auth.py` - FastAPI JWT auth
