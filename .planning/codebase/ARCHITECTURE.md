# Architecture

**Analysis Date:** 2026-03-03

## Pattern Overview

**Overall:** Monorepo with Frontend-Backend Separation

**Key Characteristics:**
- Next.js 15 frontend with TypeScript (port 3001)
- LangGraph Python agent service (port 2024)
- PostgreSQL database with Prisma ORM
- RAG architecture using RagFlow for document processing and retrieval
- Component-based UI with Framer Motion animations
- Server Components and Client Components hybrid architecture

## Layers

**Frontend Layer (`apps/web/`):**
- Purpose: React/Next.js UI handling user interactions and data presentation
- Location: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web`
- Contains: React components, API routes, database clients, UI libraries
- Depends on: Backend API, database, external services (RagFlow, OpenAI, LangGraph)
- Used by: End users via browser

**Backend Layer (`apps/agent/`):**
- Purpose: Python agent service handling RAG reasoning and chat
- Location: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent`
- Contains: LangGraph agent, RAGFlow tools, prompts, middleware
- Depends on: OpenAI API, RagFlow API, PostgreSQL database
- Used by: Frontend via LangGraph SDK

**Database Layer:**
- Purpose: Data persistence and relationships between entities
- Location: PostgreSQL (via Prisma ORM in `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/prisma/schema.prisma`)
- Contains: User, Notebook, Source, Chunk, ChatSession, ChatMessage, Note models
- Used by: Both frontend and backend

**External Services Layer:**
- Purpose: External integrations for AI and document processing
- Contains: RagFlow (RAG pipeline), OpenAI (LLM), MinIO (storage)
- Used by: Backend agent and frontend

## Data Flow

**Document Ingestion Flow:**

1. User uploads document/webpage → **Next.js API** (`/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/app/api/sources/`) → **RagFlow** (chunking/indexing) + **MinIO** (storage)
2. Document chunks indexed in RagFlow dataset with references stored in PostgreSQL

**Chat Flow:**

1. User sends chat message → **Next.js API** (`/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/app/api/chat/messages/`) → **LangGraph agent**
2. Agent queries **RagFlow** for relevant chunks using search/probe tools
3. Agent constructs prompt with retrieved context → **OpenAI** (generation)
4. Response streams back via LangGraph SDK with citations referencing stored chunks
5. Messages persisted in PostgreSQL ChatSession/ChatMessage

**UI Interaction Flow:**

1. User loads notebook (`/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/app/deepdive/[id]/`) → Server-side data fetching
2. Transformed data sent to client → React state management
3. Client interactions trigger Server Actions for mutations
4. Real-time updates via client-side React state

## Key Abstractions

**Notebook Abstraction:**
- Purpose: Container for research artifacts and conversations
- Examples: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/app/deepdive/[id]/page.tsx`
- Pattern: Server Component with data fetching and transformation

**Source Abstraction:**
- Purpose: Individual document or webpage with processing status
- Examples: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/prisma/schema.prisma` (Source model)
- Pattern: Enum-based type (DOCUMENT | WEBPAGE) with status tracking

**Chunk Abstraction:**
- Purpose: Document segments with embeddings for retrieval
- Examples: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/lib/ragflow-client.ts` (Chunk interface)
- Pattern: Content with metadata and RagFlow references

**Citation Abstraction:**
- Purpose: Link between chat messages and source chunks
- Examples: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/components/deepdive/chat/chat-panel.tsx`
- Pattern: Context-based navigation to source content

## Entry Points

**Frontend Entry:**
- Location: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/app/deepdive/[id]/page.tsx`
- Triggers: Notebook loading, data pre-fetching, initial chat state
- Responsibilities: Authentication, data transformation, component mounting

**Backend Entry:**
- Location: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent/graphs/rag_agent.py`
- Triggers: Chat messages, document retrieval, reasoning
- Responsibilities: RAG orchestration, tool execution, response generation

**API Routes:**
- Location: `/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/app/api/`
- Triggers: HTTP requests from frontend
- Responsibilities: Data mutations, file handling, status updates

## Error Handling

**Strategy:** Graceful degradation with user feedback

**Patterns:**
- Server Actions with try/catch for database operations
- Error boundaries in React components
- Status tracking for document processing
- Fallback UI for failed operations

## Cross-Cutting Concerns

**Logging:** Console-based with error tracking integration
**Validation:** Prisma schema constraints + runtime validation
**Authentication:** NextAuth.js with session management
**State Management:** React hooks with Context API for global state
**Performance:** Server-side rendering, data transformation, startTransition for deferred rendering

---

*Architecture analysis: 2026-03-03*