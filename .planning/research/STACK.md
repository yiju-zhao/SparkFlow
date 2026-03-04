# Stack Research: AI-Native Generative UI Applications

**Domain:** AI-native insight platform with generative UI capabilities
**Researched:** 2026-03-04
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **CopilotKit** | @copilotkit/react-core@1.10.6+, @copilotkit/react-ui@1.10.6+ | Frontend framework for AI copilots with generative UI | Most mature React-based generative UI framework, provides production-ready UI components, hooks for agent integration, and comprehensive state synchronization |
| **AG-UI Protocol** | @ag-ui/core@latest, @ag-ui/client@latest | Agent-User Interaction Protocol for state sync | Standardized protocol for agent-app communication, enables real-time bidirectional state sync, integrates with LangGraph and other agent frameworks |
| **LangGraph MCP Adapters** | @langchain/mcp-adapters@latest | MCP integration with LangGraph agents | Official LangChain adapters for connecting LangGraph agents to MCP tools/resources, well-tested pattern for production |
| **Zod** | ^4.3.5 (already installed) | Schema validation for AI-generated props | Industry standard for runtime validation, prevents component crashes from invalid AI-generated parameters, integrates seamlessly with TypeScript types |

### Agent Infrastructure

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **FastMCP (TypeScript)** | fastmcp@latest | MCP server framework for additional tools | Simplifies building MCP servers in TypeScript, provides type-safe tool definitions with Zod integration, supports stdio/HTTP/SSE transports |
| **LangGraph** | Existing installation | Agent orchestration (already in use) | Already integrated in SparkFlow, supports AG-UI protocol natively, can be extended with MCP tools without major rewrites |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **Zustand** | ^4.x | Lightweight state management for conversation state | When you need simple, fast state for conversation threads and AI agent interactions |
| **react-error-boundary** | ^4.x | Error boundary for graceful fallbacks | ALWAYS use in generative UI components to prevent crashes from AI errors |
| **Zod** | ^4.3.5 (existing) | Component schema validation | Define prop schemas for all generative UI components, validate AI-generated props before rendering |
| **TanStack React Query** | ^5.90.16 (existing) | Server state management | Already installed, continue using for API data fetching outside of AI agent context |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| **TypeScript** | ^5 (existing) | Type safety | Strict mode enabled, define all generative component props with Zod schemas |
| **Tailwind CSS** | ^4 (existing) | Styling | Already configured, use existing design tokens for consistency |
| **ESLint** | ^9 (existing) | Code linting | Add rules for Zod schema validation completeness |

## Installation

```bash
# Core generative UI framework
npm install @copilotkit/react-core@latest @copilotkit/react-ui@latest

# AG-UI protocol for state sync
npm install @ag-ui/core@latest @ag-ui/client@latest

# MCP integration
npm install @langchain/mcp-adapters@latest

# MCP server framework (TypeScript)
npm install fastmcp@latest

# Error handling for generative UI
npm install react-error-boundary@latest

# Lightweight state management (if needed)
npm install zustand@latest
```

## Integration with Existing Stack

### Next.js 16 + React 19 (Existing)
**No conflicts.** CopilotKit and AG-UI are framework-agnostic and work seamlessly with Next.js. React 19's Server Components can be used for initial UI rendering while Client Components handle AI interactions.

### LangGraph Python Agent (Existing)
**Extend, don't replace.** The existing LangGraph agent can be:
1. Extended with MCP tools using `langchain_mcp_adapters` (Python) or `@langchain/mcp-adapters` (TypeScript)
2. Modified to emit AG-UI events for frontend state synchronization
3. Kept as-is for RAG functionality while adding new agent endpoints for Research Hub

### Prisma + PostgreSQL (Existing)
**Schema extensions only.** Add new models for:
- `Conference` (name, description, dates, domain)
- `Session` (title, speakers, abstract, conferenceId)
- `GenerativeUISession` (state snapshot for reproducible UI)

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| CopilotKit | **Tambo AI** | If you want component registration with Zod schemas only (no chat UI), or prefer a different generative UI philosophy. Tambo is newer but growing fast (9K+ stars). |
| CopilotKit | **Vercel AI SDK** | If you want deep Next.js integration with Server Components and minimal custom UI. Note: Vercel SDK is tightly bound to Next.js ecosystem. |
| AG-UI + CopilotKit | **Custom implementation** | Only if you have very specific protocol requirements that AG-UI doesn't support. AG-UI is now the de facto standard with 12K+ GitHub stars. |
| Zustand | **Recoil** | Only for extremely complex state logic (analytics platforms with many data filters). Zustand is simpler and faster for most use cases. |
| FastMCP TypeScript | **FastMCP Python** | Use Python version if building tools in the existing Python agent service. Use TypeScript version if building tools in the Next.js app context. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **Vercel AI SDK** | Tightly bound to Next.js and React Server Components, less flexible than CopilotKit for complex agent workflows | CopilotKit (framework-agnostic, better agent support) |
| **Code generation approach** (AI generates React code) | Security risk, hard to validate, inconsistent design system | Component selection approach (AI selects from pre-defined, tested components with Zod schemas) |
| **Custom WebSocket implementation** | Reinventing the wheel, error-prone, hard to maintain | AG-UI protocol + CopilotKit (standardized, well-tested) |
| **No schema validation** | AI will generate invalid props 100% of the time, causes crashes | Zod validation on all AI-generated props before rendering |
| **Global Redux store for agent state** | Overkill, boilerplate-heavy, hard to sync with agent | AG-UI protocol for bidirectional state sync, Zustand for local UI state |

## Stack Patterns by Variant

**If building chat-heavy interfaces with occasional generative UI:**
- Use CopilotKit's `useCopilotChat()` and `useCopilotAction()` hooks
- Implement generative UI via `useCopilotAction()` returning component specifications
- Use AG-UI for complex multi-agent workflows

**If building UI-heavy interfaces with AI triggering components:**
- Use CopilotKit's `useCoAgent()` hook for agent state management
- Implement generative UI via component registration with Zod schemas
- Use AG-UI's `HttpAgent` for direct agent communication

**If existing LangGraph agent needs minimal changes:**
- Keep LangGraph agent as-is
- Add MCP adapter for new Research Hub tools
- Emit AG-UI events from LangGraph node outputs
- Use CopilotKit frontend to consume AG-UI events

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| CopilotKit@1.10.6+ | React 19.2.3 | React 19 is required for latest CopilotKit features |
| CopilotKit@1.10.6+ | Next.js 16.1.6 | Full compatibility with Next.js App Router and Server Components |
| @ag-ui/client@latest | LangGraph (Python) | AG-UI has official LangGraph integration |
| @langchain/mcp-adapters@latest | LangGraph@1.x | Adapter bridges MCP protocol to LangGraph tools |
| FastMCP@latest | Node.js 20+ | Requires Node.js 20+, matches existing frontend runtime |
| Zod@4.3.5 | TypeScript 5+ | Full type inference support |

## Generative UI Implementation Patterns

### Pattern 1: Component Selection (Recommended)
AI selects from pre-defined components with Zod schemas:
```typescript
// Define component catalog
const ResearchComponentSchema = z.object({
  type: z.enum(['chart', 'table', 'network', 'filter']),
  props: z.object({
    // Component-specific props
  })
});

// Register with CopilotKit
useCopilotAction({
  name: "render_research_ui",
  description: "Render a research visualization component",
  parameters: z.object({
    components: z.array(ResearchComponentSchema)
  }),
  handler: async ({ components }) => {
    // Validate with Zod (already done by CopilotKit)
    // Render components
  }
});
```

### Pattern 2: AG-UI State Sync (For complex workflows)
Use AG-UI protocol for bidirectional agent-app state sync:
```typescript
import { HttpAgent } from "@ag-ui/client";

const agent = new HttpAgent({
  endpoint: `${process.env.LANGGRAPH_API_URL}/research-agent`,
  threadId: sessionId
});

// Stream events and update UI
await agent.run({
  messages: [{ role: "user", content: query }],
  onEvent: (event) => {
    if (event.type === "tool-result") {
      // Update local state
      updateResearchState(event.value);
    }
  }
});
```

### Pattern 3: Error Handling (ALWAYS use)
```typescript
import { ErrorBoundary } from "react-error-boundary";

function GenerativeUIWrapper({ children }) {
  return (
    <ErrorBoundary
      FallbackComponent={GenerativeUIFallback}
      onError={(error) => {
        console.error("Generative UI error:", error);
        // Log to monitoring service
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
```

## Sources

- [CopilotKit Documentation](https://docs.copilotkit.ai) — Official docs, HIGH confidence
- [AG-UI Protocol Documentation](https://docs.ag-ui.com) — Official docs, HIGH confidence
- [AG-UI GitHub](https://github.com/ag-ui-protocol/ag-ui) — 12K+ stars, HIGH confidence
- [FastMCP GitHub](https://github.com/punkpeye/fastmcp) — TypeScript MCP framework, MEDIUM confidence
- [Tambo AI GitHub](https://github.com/tambo-ai/tambo) — 9K+ stars, alternative approach, MEDIUM confidence
- [Zod Documentation](https://zod.dev) — Schema validation standard, HIGH confidence
- [LangGraph MCP Integration Examples (CSDN, 2025)](https://blog.csdn.net/lovechris00/article/details/148036779) — Integration patterns, MEDIUM confidence
- [Generative UI Best Practices (Juejin, 2025)](https://juejin.cn/post/7607003319794089999) — Zod validation, error boundaries, MEDIUM confidence
- [React 19 + AI Integration Trends (2025)] — Server Components + AI patterns, LOW confidence (single source)

---
*Stack research for: AI-native insight platform with generative UI capabilities*
*Researched: 2026-03-04*
