# DeepSight Migration Guide: Django/React to Next.js/FastAPI

**Role**: AI Agent Migration Architect
**Objective**: Refactor the existing DeepSight application (Django + React) into a modern, high-performance architecture.
**Constraint**: Ingestion is handled by an **EXTERNAL API**. The internal backend ONLY handles the Agent and UI support.

**Reference Root**: `/Users/eason/Documents/HW Project/deepsight-all/DeepSight-Django`

## 1. Technology Stack

| Component | New Choice | Rationale |
| :--- | :--- | :--- |
| **Frontend** | **Next.js 15 (App Router)** | Server Components, improved performance, Vercel ecosystem alignment. |
| **Styling** | **Tailwind CSS + Shadcn/UI** | Modern, accessible, copy-paste component architecture. |
| **Backend** | **FastAPI** | High-performance Python async, ideal for AI/Agent workloads. |
| **Database** | **Postgres + Prisma** | Type-safe ORM for Next.js, reliable relational data storage. |
| **AI SDK** | **Vercel AI SDK (React/Core)** | Best-in-class streaming hooks (`useChat`) and UI integration. |
| **Auth** | **NextAuth.js (v5)** | Simple, secure, server-side auth for Next.js. |
| **Ingestion** | **External API** | Offloads heavy processing; backend only tracks status. |

## 2. Directory Structure

The project should be structured following **Monorepo Best Practices** (Scalable & Clean).
**Target Directory**: Create a NEW directory outside the old project, e.g., `/Users/eason/Documents/HW Project/deepsight-v2`.

```text
deepsight-v2/
├── apps/
│   ├── web/                  # Next.js 15 Application (Frontend)
│   │   ├── app/              # App Router
│   │   ├── components/       # Shadcn/UI + Custom Components
│   │   ├── lib/              # Utilities
│   │   ├── prisma/           # Database Schema
│   │   └── public/           # Static assets
│   └── agent/                # FastAPI Backend (Agent Service)
│       ├── app/
│       │   ├── agents/       # LangGraph Agent Logic
│       │   ├── api/          # API Endpoints
│       │   ├── core/         # Config, Security
│       │   └── models/       # Pydantic/SQLModel definitions
│       └── main.py           # Entry point
├── docker-compose.yml        # Orchestration (Optional)
└── README.md
```

## 3. Phase-by-Phase Execution Plan

### Phase 1: Foundation & Scaffolding
1.  **Initialize Next.js**: Create `apps/web` with TypeScript, Tailwind, ESLint.
    -   *Action*: `mkdir -p apps && cd apps && npx create-next-app@latest web --typescript --tailwind --eslint`.
    -   *Action*: Install `lucide-react`, `clsx`, `tailwind-merge`.
2.  **Initialize FastAPI**: Create `apps/agent` with Python 3.11+.
    -   *Action*: Setup `uv`, `fastapi`, `uvicorn`, `langgraph`.
    -   *Source Reference*: Check `/Users/eason/Documents/HW Project/deepsight-all/DeepSight-Django/backend/requirements.txt` for specific library versions if needed.
    -   *Action*: Replicate `backend/agents` logic into `apps/agent/app/agents`.
        -   *Source*: `/Users/eason/Documents/HW Project/deepsight-all/DeepSight-Django/backend/agents`

### Phase 2: Database & Authentication
1.  **Define Schema (Prisma)**:
    -   Create `schema.prisma` in `web-app`.
    -   Replicate models: `User`, `Notebook`, `ChatSession`, `Message`, `Note`, `Source`.
    -   *Source Models*: `/Users/eason/Documents/HW Project/deepsight-all/DeepSight-Django/backend/notebooks/models`
    -   *Key Change*: Ensure `Notebook` references the external RagFlow/Ingestion IDs.
2.  **Setup NextAuth**:
    -   Implement GitHub/Google or Credentials provider.
    -   Create login/signup pages.
3.  **FastAPI Auth Middleware**:
    -   Implement JWT validation in FastAPI to accept NextAuth tokens (shared secret or JWKS).

### Phase 3: Agent Migration (The Brains)
1.  **Migrate LangGraph Agent**:
    -   Copy `DeepSightRAGAgent` logic from `backend/agents/rag_agent`.
        -   *Source*: `/Users/eason/Documents/HW Project/deepsight-all/DeepSight-Django/backend/agents/rag_agent/graph.py`
    -   **CRITICAL**: Remove all internal Django formatting/ORM calls. Replace with Pydantic models.
    -   **CRITICAL**: Remove `copilotkit` wrappers. Use standard LangGraph `stream()` and return via `StreamingResponse`.
    -   **CRITICAL**: Ensure calls to "ingestion" logic are removed or redirected to the **External API**.
2.  **Expose Streams**:
    -   Create FastAPI endpoint `/api/chat` that uses Vercel AI SDK's `StreamData` protocol (or standard SSE).
    -   Ensure `frontend` can consume this stream via `useChat`.

### Phase 4: Frontend Implementation (The Face)
1.  **Dashboard (`/dashboard`)**:
    -   List user's notebooks.
    -   Create/Delete notebooks (Server Actions -> Prisma).
2.  **Studio View (`/studio/[id]`)**:
    -   **Layout**: Resizable panels (Sidebar, Chat, Content).
        -   *Source UI*: `/Users/eason/Documents/HW Project/deepsight-all/DeepSight-Django/frontend/src/features/notebook/components/studio/StudioPanel.tsx`
    -   **Chat**: `useChat` hook connected to FastAPI. Needs to handle optimistic updates and typing indicators.
        -   *Source UI*: `/Users/eason/Documents/HW Project/deepsight-all/DeepSight-Django/frontend/src/features/notebook/components/chat/SessionChatPanel.tsx`
    -   **Notes**: Markdown editor (TipTap or similar) for notes.
        -   *Source UI*: `/Users/eason/Documents/HW Project/deepsight-all/DeepSight-Django/frontend/src/features/notebook/components/studio/NoteViewer.tsx`
    -   **Sources**: List view of ingested tokens. "Add Source" button calls External API.
        -   **Implementation**: Use Next.js **Server Actions** (or API Routes) to proxy requests to the External Ingestion API. Do NOT call from client directly (security) or from Agent API (separation of concerns).
        -   *Source UI*: `/Users/eason/Documents/HW Project/deepsight-all/DeepSight-Django/frontend/src/features/notebook/components/modals/NotebookSettingsModal.tsx` (or similar upload modal)

### Phase 5: Polish & Deployment
1.  **UI Refinement**: Ensure dark mode, smooth transitions, and distinct "DeepSight" branding.
    -   *Source CSS*: `/Users/eason/Documents/HW Project/deepsight-all/DeepSight-Django/frontend/src/index.css` (for tokens/colors)
2.  **Env Config**: `.env` files for both services.
3.  **Deployment**: Vercel (Web) + Railway/Render/AWS (FastAPI).

## 4. Specific file migration mapping

| Old File (Aboslute Path) | New File (Relative to deepsight-v2) | Function |
| :--- | :--- | :--- |
| `..../frontend/src/features/notebook/components/chat/SessionChatPanel.tsx` | `apps/web/components/chat/chat-panel.tsx` | Main chat UI |
| `..../backend/agents/rag_agent/server.py` | `apps/agent/app/main.py` | Agent entry point (Adapted) |
| `..../backend/agents/rag_agent/graph.py` | `apps/agent/app/agents/graph.py` | Agent Logic |
| `..../backend/notebooks/models/notebook.py` | `apps/web/prisma/schema.prisma` | DB Schema (Reference) |
| `..../backend/notebooks/ingestion/*` | **REMOVED / EXTERNAL** | Ingestion Logic |
