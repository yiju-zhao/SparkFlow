# Architecture Research

**Domain:** AI-native insight platform with generative UI
**Researched:** 2026-03-04
**Confidence:** MEDIUM

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Frontend Layer (Next.js 15)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Research Hub │  │ Notebook Deep  │  │ CopilotKit   │  │ MCP Apps    │  │
│  │ (Discovery)  │  │ Dive (RAG)     │  │ Provider     │  │ Renderer    │  │
│  └──────┬───────┘  └────────┬────────┘  └──────┬───────┘  └──────┬──────┘  │
│         │                   │                  │                  │         │
│         │ AG-UI Events      │ State Sync       │ useCoAgent       │ UI       │
│         │ SSE/WebSocket     │ Thread ID        │ useChatContext   │ Render   │
│         └───────────────────┴──────────────────┴──────────────────┘         │
├─────────────────────────────────────────────────────────────────────────────┤
│                          API Layer (Next.js Routes)                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Chat API     │  │ Research API    │  │ CopilotKit   │  │ MCP Proxy   │  │
│  │ (LangGraph)  │  │ (CRUD + Import) │  │ Runtime      │  │ (Optional)  │  │
│  └──────┬───────┘  └────────┬────────┘  └──────┬───────┘  └──────┬──────┘  │
│         │                   │                  │                  │         │
├────────┴───────────────────┴──────────────────┴──────────────────┴─────────┤
│                          Agent Layer (LangGraph)                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │           Research Agent (Chat + Generative UI + RAG)                │   │
│  │  - State management (TypedDict)                                       │   │
│  │  - Tool orchestration (MCP, RAGFlow, custom tools)                  │   │
│  │  - Checkpointing (PostgresSaver)                                     │   │
│  │  - AG-UI protocol emitter                                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────────────┤
│                          Data & Service Layer                               │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │PostgreSQL│  │ RagFlow  │  │ OpenAI   │  │ MinIO    │  │ External  │      │
│  │(Prisma)  │  │(RAG)     │  │(LLM)     │  │(Storage) │  │MCP Tools │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **CopilotKit Provider** | AG-UI protocol bridge, state sync, event streaming | React Context + SSE client |
| **MCP Apps Renderer** | Dynamic UI component rendering from tool outputs | React component registry |
| **Research Agent (LangGraph)** | Multi-step reasoning, tool orchestration, AG-UI events | LangGraph StateGraph + custom nodes |
| **Chat API** | Message streaming, thread management, checkpoint sync | Next.js API route + LangGraph SDK |
| **Research API** | Conference/session CRUD, Hub->Notebook import flow | Next.js API routes + Prisma |
| **PostgresSaver** | Agent state persistence, thread-based session memory | LangGraph checkpoint backend |

## Recommended Project Structure

```
apps/
├── web/                          # Next.js 15 frontend
│   ├── app/
│   │   ├── hub/                  # Research Hub (NEW)
│   │   │   ├── page.tsx          # Conference list, overview
│   │   │   ├── [conferenceId]/   # Conference detail
│   │   │   │   ├── page.tsx      # Sessions, tracks, AI chat
│   │   │   │   └── chat/         # Hub chat interface (generative UI)
│   │   │   └── layout.tsx        # CopilotKit provider wrapper
│   │   ├── deepdive/[id]/        # Existing Notebook (EXTEND)
│   │   │   ├── page.tsx
│   │   │   └── chat/             # Existing chat (EXTEND for Hub import)
│   │   ├── api/
│   │   │   ├── chat/             # Existing chat API
│   │   │   ├── research/         # NEW: Research Hub CRUD
│   │   │   │   ├── conferences/route.ts
│   │   │   │   ├── sessions/route.ts
│   │   │   │   └── import/route.ts    # Hub -> Notebook import
│   │   │   └── copilotkit/       # NEW: CopilotKit runtime endpoint
│   │   │       └── route.ts
│   │   └── (auth)/               # Existing auth
│   ├── components/
│   │   ├── hub/                  # NEW: Research Hub components
│   │   │   ├── conference-list.tsx
│   │   │   ├── session-card.tsx
│   │   │   └── filters.tsx
│   │   ├── generative-ui/        # NEW: MCP Apps renderer
│   │   │   ├── mcp-apps-provider.tsx
│   │   │   ├── dynamic-component.tsx
│   │   │   └── components/      # Generated UI components (charts, tables, etc.)
│   │   └── copilotkit/           # NEW: CopilotKit integration
│   │       ├── provider.tsx
│   │       └── hooks/            # useCoAgent, useChatContext, etc.
│   ├── lib/
│   │   ├── agents/               # NEW: Agent client utilities
│   │   │   ├── copilotkit-client.ts
│   │   │   └── state-sync.ts
│   │   └── actions/              # Server actions (EXTEND)
│   │       └── research/         # Research Hub mutations
│   └── prisma/
│       └── schema.prisma         # EXTEND: Conference/Session models
│
└── agent/                        # LangGraph Python agent
    ├── graphs/
    │   ├── rag_agent.py           # Existing RAG agent (EXTEND)
    │   └── research_agent.py      # NEW: Research Hub agent with generative UI
    ├── tools/
    │   ├── ragflow.py             # Existing
    │   ├── research/              # NEW: Research-specific tools
    │   │   ├── conference_search.py
    │   │   ├── session_filter.py
    │   │   └── insight_extract.py
    │   └── mcp/                   # NEW: MCP tool wrappers
    │       └── ui_tools.py        # UI generation tools
    ├── prompts/
    │   └── research_agent.py      # NEW: Research agent system prompts
    └── middleware/
        ├── chunk_accumulator.py   # Existing
        └── agui_emitter.py        # NEW: AG-UI event emitter
```

### Structure Rationale

- **hub/**: New domain for Research Hub, separate from existing notebook flow to avoid coupling discovery from deep analysis
- **generative-ui/**: Centralized MCP Apps renderer to avoid scattered UI generation logic
- **copilotkit/**: All CopilotKit integration in one place for maintainability
- **research/**: Server actions and API routes for Research Hub CRUD operations
- **research_agent.py**: Separate agent for Hub with different capabilities than notebook RAG agent (discovery vs deep analysis)

## Architectural Patterns

### Pattern 1: AG-UI Protocol for Agent-UI Communication

**What:** Open-source, lightweight, event-driven protocol standardizing AI agent to user application communication. Completes the agent protocol stack alongside MCP (tools) and A2A (agent collaboration).

**When to use:**
- Building AI-native applications where agents drive UI changes
- Need real-time, bidirectional state synchronization
- Human-in-the-loop workflows where UI responds to agent state

**Trade-offs:**
- Pros: Standardized, works with multiple agent frameworks (LangGraph, CrewAI), real-time streaming
- Cons: Additional infrastructure layer, requires event client setup

**Example:**
```typescript
// Frontend: AG-UI event subscription
import { useCoAgent, useCoAgentStateRender } from '@copilotkit/react-core';
import { AGUIEventClient } from '@ag-ui/langgraph';

function ResearchHubChat() {
  const { state } = useCoAgent({
    agent: 'research_agent',
    threadId: 'research-session-123',
  });

  // Render generative UI based on agent state
  const { render } = useCoAgentStateRender({
    state,
    render: ({ state }) => {
      // Agent returns UI spec for charts, tables, filters
      if (state.ui_type === 'chart') {
        return <ChartComponent data={state.data} type={state.chart_type} />;
      }
      if (state.ui_type === 'table') {
        return <SessionTable sessions={state.sessions} />;
      }
      return null;
    },
  });

  return (
    <div>
      <ChatInterface />
      {render}
    </div>
  );
}
```

### Pattern 2: CopilotKit + LangGraph Integration

**What:** CopilotKit provides the frontend infrastructure (hooks, state management) while LangGraph handles agent logic and tool orchestration. Connected via CopilotRuntime on the server.

**When to use:**
- Building production-grade AI copilots in React applications
- Need state sharing between frontend and agent
- Want human-in-the-loop capabilities with native app UX

**Trade-offs:**
- Pros: React-native, integrates with LangGraph checkpointing, supports streaming
- Cons: Learning curve for CopilotKit hooks, requires runtime server component

**Example:**
```typescript
// Server API Route: CopilotKit runtime integration
import { CopilotRuntime, OpenAIAdapter } from '@copilotkit/runtime';

export const runtime = 'edge';

export async function POST(req: Request) {
  const { handleRequest } = new CopilotRuntime({
    remoteActions: [
      {
        url: process.env.NEXT_PUBLIC_LANGGRAPH_API_URL!,
        action: 'research_agent',
      },
    ],
  });

  const { result } = await handleRequest(req);

  return result;
}
```

```python
# Backend: LangGraph agent with AG-UI emission
from copilotkit import CopilotKitSDK
from langgraph.graph import StateGraph

async def research_agent(state: ResearchState):
    # Agent logic for conference research
    sessions = await search_conferences(state.query)

    # Emit AG-UI event for dynamic UI generation
    emit_state({
        "ui_type": "table",
        "data": {
            "sessions": sessions,
            "columns": ["title", "speaker", "track", "time"]
        }
    })

    return {"sessions": sessions}
```

### Pattern 3: Snapshot-Delta State Synchronization

**What:** Efficient state management using full snapshots on connection + incremental JSON Patch (RFC 6902) updates for ongoing changes. Critical for real-time generative UI.

**When to use:**
- Large state objects where full updates are wasteful
- Real-time collaboration or long-running agent workflows
- Need bandwidth optimization

**Trade-offs:**
- Pros: Efficient for incremental updates, standard JSON Patch format, supports rollback
- Cons: More complex than simple polling, requires delta computation logic

**Example:**
```typescript
// State sync implementation
class AGUIStateClient {
  private state: any = {};
  private threadId: string;

  constructor(threadId: string) {
    this.threadId = threadId;
  }

  async connect() {
    // Initial snapshot
    this.state = await fetch(`/api/threads/${this.threadId}/snapshot`);
    this.render(this.state);
  }

  onDelta(delta: JsonPatchOperation[]) {
    // Apply incremental updates
    this.state = applyJsonPatch(this.state, delta);
    this.render(this.state);
  }
}
```

### Pattern 4: Hub-to-Notebook Import Flow

**What:** Two-stage workflow where discovery phase (Hub) flows into deep analysis phase (Notebook). Sessions become sources for RAG-powered research.

**When to use:**
- User wants to explore first, then dive deeper
- Need to preserve discovery context in notebook
- Want to leverage existing RAG capabilities for session analysis

**Trade-offs:**
- Pros: Leverages existing notebook infrastructure, clear separation of concerns
- Cons: Session content must be indexed into RagFlow, import state management

**Example:**
```typescript
// Import session to notebook
async function importSessionToNotebook(sessionId: string, notebookId: string) {
  // 1. Fetch session content
  const session = await fetchSession(sessionId);

  // 2. Create as Source in notebook
  const source = await createSource({
    notebookId,
    type: 'SESSION',
    title: session.title,
    content: session.content, // Abstract, notes, etc.
    metadata: { sessionId, conferenceId: session.conferenceId }
  });

  // 3. Index in RagFlow
  await indexSource(source.id, session.content);

  // 4. Return to notebook with new source
  redirect(`/deepdive/${notebookId}`);
}
```

## Data Flow

### Request Flow (Research Hub Discovery)

```
[User: "Show me AI sessions at GTC"]
    ↓
[Research Hub Chat] → [CopilotKit Provider] → [Chat API]
    ↓                        ↓                     ↓
[AG-UI Events]    ← [LangGraph Agent]   ← [LangGraph SDK]
    ↓                    ↓                        ↓
[Render UI]        [Research Tools]     [PostgresSaver Checkpoint]
    ↓                    ↓                        ↓
[Show Sessions] ← [Query Conference DB] ← [Thread State Persistence]
```

### Request Flow (Hub → Notebook Import)

```
[User: Click "Import to Notebook"]
    ↓
[Research API] → [Fetch Session] → [Create Source]
    ↓                    ↓                ↓
[Response]    ← [Index in RagFlow] ← [Update Prisma]
    ↓
[Redirect to Notebook]
    ↓
[Notebook loads new Source with RAG]
```

### State Management Flow

```
[LangGraph Agent State (Backend)]
    ↓ (PostgresSaver checkpoint)
[Thread-based Persistence]
    ↓ (SSE/WebSocket events)
[AG-UI Protocol Events]
    ↓ (useCoAgent hook)
[Frontend State Store]
    ↓ (useCoAgentStateRender)
[Generative UI Components]
```

### Key Data Flows

1. **Chat with Generative UI:** User sends message → Agent processes → Emits STATE_SNAPSHOT → UI renders → Agent emits STATE_DELTA (progress) → UI updates → Final response with citations

2. **Discovery Exploration:** User filters sessions → CopilotKit state updates → Agent uses Research Tools → Dynamic table/chart rendered → User drills down → UI shows session details

3. **Hub-to-Notebook:** User selects session → Import API creates Source → RagFlow indexes session content → Notebook loads with new source → RAG queries include session knowledge

4. **Thread Recovery:** User reconnects → Frontend requests STATE_SNAPSHOT by threadId → PostgresSaver returns persisted state → UI restores previous context → Agent continues where it left off

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 0-1k users | Single LangGraph instance, in-memory checkpointer, single Postgres instance |
| 1k-100k users | LangGraph cluster with PostgresSaver, separate database for checkpoints, CDN for static assets, horizontal scaling of Next.js API routes |
| 100k+ users | Dedicated LangGraph services per domain (research vs notebook), read replicas for conference data, RagFlow cluster, distributed checkpoint storage, rate limiting, query caching |

### Scaling Priorities

1. **First bottleneck:** LangGraph agent throughput under concurrent chat sessions
   - Mitigation: Implement PostgresSaver with connection pooling, separate agent services, add Redis caching for common queries

2. **Second bottleneck:** RagFlow retrieval latency during high-volume queries
   - Mitigation: RagFlow cluster, query result caching, pre-compute embeddings for popular sessions

3. **Third bottleneck:** AG-UI event stream bandwidth for real-time UI updates
   - Mitigation: Delta-only updates (no full snapshots during active sessions), WebSocket compression, batch UI updates

## Anti-Patterns

### Anti-Pattern 1: Tight Coupling Between Hub and Notebook

**What people do:** Making the Research Hub directly call notebook APIs or share database tables for session content.

**Why it's wrong:** Violates separation of concerns (discovery vs deep analysis), makes Hub dependent on notebook internals, creates circular dependencies.

**Do this instead:** Use import flow pattern. Hub exports session metadata, creates Source entity with reference, RAG indexing happens as part of source creation. Notebook remains independent.

### Anti-Pattern 2: Polling for State Updates

**What people do:** Frontend polls backend every second for agent state changes using `setInterval` or `setTimeout`.

**Why it's wrong:** High latency, wasted bandwidth, server load, inconsistent state.

**Do this instead:** Use AG-UI protocol with Server-Sent Events or WebSockets. Agents emit events on state changes, frontend subscribes and receives updates in real-time.

### Anti-Pattern 3: Rendering Full State on Every Update

**What people do:** Sending complete agent state on every event (`{ sessions: [...], filters: {...}, ui: {...} }`).

**Why it's wrong:** Bandwidth waste, parsing overhead, poor UX with large datasets.

**Do this instead:** Snapshot-Delta pattern. Send full snapshot on connect, then only JSON Patch deltas for subsequent updates. UI components subscribe to specific state paths.

### Anti-Pattern 4: Single Agent for Both Hub and Notebook

**What people do:** Extending existing RAG agent to handle research Hub queries without clear domain boundaries.

**Why it's wrong:** Different intent (discovery vs analysis), different tools (conference DB vs RagFlow), different state needs, makes agent logic complex and unmaintainable.

**Do this instead:** Separate agents with clear responsibilities. `research_agent.py` for Hub (conference data, generative UI), `rag_agent.py` for Notebook (RagFlow retrieval, deep analysis). Share common tools via composition.

### Anti-Pattern 5: Missing Checkpoint Configuration

**What people do:** Running LangGraph agents without checkpointer configured.

**Why it's wrong:** No state persistence, no thread-based memory, cannot resume conversations, no time travel for debugging.

**Do this instead:** Always configure PostgresSaver in production. Use thread_id to isolate user sessions. Enable checkpointing for both research and RAG agents.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **RagFlow** | LangGraph tools (`tools/ragflow.py`) | Existing integration, use for both Hub session indexing and Notebook RAG |
| **OpenAI** | LangGraph agent LLM calls | Used for both agents, separate models if needed (lighter for Hub, stronger for Notebook) |
| **MinIO** | Session documents storage | Store PDFs, slides, recordings as Source files |
| **PostgreSQL** | Prisma ORM + LangGraph PostgresSaver | Dual use: application data (via Prisma) + agent checkpointing (via PostgresSaver) |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Frontend ↔ LangGraph** | AG-UI protocol (SSE/WebSocket) via CopilotKit | Real-time state sync, event-driven, bidirectional |
| **Frontend ↔ Backend API** | REST/Server Actions | CRUD operations, file uploads, import flow |
| **LangGraph Research Agent ↔ Conference DB** | Prisma client via tool wrapper | Direct database access from Python agent, or via API route for stricter separation |
| **Hub ↔ Notebook** | Import API flow (async, creates Source) | Loose coupling, Source as integration contract |
| **CopilotKit Runtime ↔ LangGraph** | HTTP API (remote action) | CopilotRuntime forwards requests to LangGraph endpoint |

## Conference Data Model Integration

### Recommended Prisma Schema Extensions

```prisma
model Conference {
  id        String   @id @default(cuid())
  name      String
  date      DateTime
  location  String?
  status    ConferenceStatus @default(DRAFT)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  sessions  Session[]
}

model Session {
  id          String   @id @default(cuid())
  conferenceId String
  conference  Conference @relation(fields: [conferenceId], references: [id])

  title       String
  abstract    String?
  speaker     String?
  speakerBio  String?
  track       String?
  startTime   DateTime?
  endTime     DateTime?

  // Import to notebook support
  importedAs  Source?   @relation(fields: [sourceId], references: [id])

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

enum ConferenceStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

// Extend existing Source model
model Source {
  // ... existing fields

  // New field for Hub import
  sessionId   String?  @unique  // Reference to Session if imported from Hub

  sessions    Session[]
}
```

## Sources

### Architecture Patterns
- [AG-UI Protocol Overview](https://www.copilotkit.ai/docs/ag-ui) - Agent-User Interaction Protocol specification (HIGH confidence)
- [Three-Agent Protocol Ecosystem](https://modelcontextprotocol.io/) - MCP, A2A, AG-UI complementary protocols (MEDIUM confidence)
- [State Synchronization Patterns](https://www.csdn.net/article/details/143582341) - Snapshot-Delta pattern with JSON Patch (MEDIUM confidence)
- [LangGraph Checkpointing Documentation](https://langchain-ai.github.io/langgraph/how-tos/persistence/) - PostgresSaver, Thread ID, state persistence (HIGH confidence)

### CopilotKit + LangGraph
- [CopilotKit for LangGraph Deep Analysis](https://blog.csdn.net/qhvssonic/article/details/158012730) - Integration patterns, hooks comparison (HIGH confidence)
- [几分钟内轻松为你的AI代理搭建界面](https://m.imooc.com/article/379654) - LangGraph + CopilotKit practical guide (MEDIUM confidence)
- [CopilotKit丝滑连接agent和应用-理论篇](https://juejin.cn/post/7435798223369279542) - Generative UI, shared state, human-in-the-loop (HIGH confidence)
- [CopilotKit Documentation](https://docs.copilotkit.ai) - Official docs (HIGH confidence)

### MCP Apps
- [MCP Apps: 让AI工具在对话里，直接用上交互式UI](https://www.toutiao.com/article/7418207518662966308) - MCP Apps launch January 2026, interactive UI components (MEDIUM confidence)
- [Xcode 26.3 Built-in MCP Tools](https://www.toutiao.com/article/7439458474584047115) - 20 MCP tools powering AI IDE (MEDIUM confidence)

### AI-Native Platform Architecture
- [Gartner 2026 Strategic Technology Trends](https://www.gartner.com/en/articles/strategic-technology-trends-2026) - AI-Native Development Platforms (HIGH confidence)
- [RAG Technology Evolution 2026](https://www.csdn.net/article/details/143582342) - Agentic RAG, multimodal RAG maturity (MEDIUM confidence)
- [AI-Native vs AI-Enabled Distinction](https://www.anthropic.com/blog/ai-native-development) - Infrastructure differences (MEDIUM confidence)

### Research Platform Patterns
- [Google NotebookLM Deep Research](https://blog.google/products/notebooklm/deep-research/) - Hub-to-notebook import pattern (MEDIUM confidence)
- [NotebookLM Importer Toolkit](https://chrome.google.com/webstore/detail/notebooklm-importer/) - Chrome extension for knowledge import (LOW confidence)
- [Conference Platform Features](https://www.gtcconf.com/) - Session catalog, tracks, speakers (LOW confidence - general observation)

### LangGraph Frontend Integration
- [LangGraph Frontend Streaming](https://www.csdn.net/article/details/143582340) - useStream hook, message streaming (HIGH confidence)
- [ag-ui with LangGraph](https://www.csdn.net/article/details/143582339) - State synchronization, event streaming (HIGH confidence)

---

*Architecture research for: AI-native insight platform with generative UI*
*Researched: 2026-03-04*
