# Project Research Summary

**Project:** DeepSense Insight Platform (Research Hub + Generative AI)
**Domain:** AI-native research platform with RAG and generative UI
**Researched:** 2026-03-04
**Confidence:** MEDIUM

## Executive Summary

DeepSense Insight Platform is an AI-native research platform that combines two complementary experiences: a Research Hub for conference session discovery and a DeepDive Notebook for RAG-powered analysis. The platform leverages generative AI to create dynamic interfaces on demand, allowing users to explore content through AI-curated views, charts, and knowledge graphs. This follows the emerging pattern of "agentic" interfaces where AI orchestrates tools and components rather than following pre-defined workflows.

The recommended approach builds on SparkFlow's existing RAG infrastructure (LangGraph + RagFlow) and extends it with CopilotKit for generative UI capabilities. Key differentiators include proactive AI suggestions that surface related content without user prompting, and a seamless import flow from Hub discovery to DeepDive analysis. Critical risks include state synchronization between frontend and agent (mitigated by AG-UI protocol with PostgresSaver), performance issues from unthrottled streaming updates (mitigated by 100ms throttling and React.memo), and tool selection hallucinations (mitigated by semantic filtering to 3-5 relevant tools and JSON Schema validation).

## Key Findings

### Recommended Stack

The research identifies CopilotKit as the leading framework for generative UI in React applications, with AG-UI protocol providing standardized agent-to-UI communication. The existing LangGraph agent can be extended with MCP tools rather than replaced, and RagFlow continues to handle RAG operations. Critical additions include FastMCP for TypeScript MCP server development, Zod for runtime validation of AI-generated component props, and react-error-boundary for graceful degradation when generative UI fails.

**Core technologies:**
- **CopilotKit (@copilotkit/react-core@1.10.6+, @copilotkit/react-ui@1.10.6+)**: Frontend framework for AI copilots with generative UI — most mature React-based framework with production-ready hooks and state synchronization
- **AG-UI Protocol (@ag-ui/core, @ag-ui/client)**: Agent-User Interaction Protocol for state sync — standardized protocol for real-time bidirectional state sync, integrates with LangGraph natively
- **LangGraph MCP Adapters (@langchain/mcp-adapters)**: MCP integration with LangGraph agents — official adapters connecting LangGraph to MCP tools/resources, well-tested for production
- **Zod (^4.3.5)**: Schema validation for AI-generated props — prevents component crashes from invalid AI-generated parameters, integrates seamlessly with TypeScript

### Expected Features

Research identifies clear feature tiers based on user expectations and competitive positioning. Table stakes include source-based chat with citations (NotebookLM has set this standard), document/webpage upload with processing, session/conference browsing, and responsive design. Differentiators include generative UI with dynamic component rendering, proactive AI suggestions, Hub-to-Notebook import flow, and AI-generated knowledge graphs. Features to defer include real-time conference streaming, mobile native apps, and public APIs.

**Must have (table stakes):**
- **Source-based chat with citations** — core value of RAG platforms, users expect verifiable AI responses
- **Conference/session list browsing** — Research Hub requires basic content discovery
- **Basic search and filtering** — users expect to find content quickly
- **Session detail view** — users expect full session information
- **Hub-to-Notebook import flow** — seamless transition from discovery to deep analysis

**Should have (competitive):**
- **Generative UI foundation** — AI creates custom interfaces on demand (charts, tables, network views)
- **Proactive AI suggestions** — AI surfaces related sessions without being asked
- **AI-generated knowledge graphs** — visualizes relationships between sessions, topics, speakers

**Defer (v2+):**
- **Real-time conference streaming** — massive complexity, focus on post-event analysis instead
- **Mobile native app** — web-first sufficient, consider PWA for offline capability
- **Public API** — internal APIs first, external API deferred until demand exists

### Architecture Approach

The recommended architecture follows a four-layer pattern: Frontend (Next.js 16 with CopilotKit Provider and MCP Apps Renderer), API Layer (Next.js routes with CopilotRuntime endpoint), Agent Layer (LangGraph Research Agent with AG-UI event emitter), and Data/Service Layer (PostgreSQL, RagFlow, OpenAI, MinIO). Key architectural patterns include AG-UI protocol for agent-UI communication with snapshot-delta state synchronization, separate agents for Hub (discovery) and Notebook (deep analysis) to avoid coupling, and a Hub-to-Notebook import flow using Source entities as the integration contract.

**Major components:**
1. **CopilotKit Provider** — AG-UI protocol bridge, state sync, event streaming via React Context + SSE client
2. **MCP Apps Renderer** — Dynamic UI component rendering from tool outputs using React component registry
3. **Research Agent (LangGraph)** — Multi-step reasoning, tool orchestration, AG-UI events with StateGraph and PostgresSaver
4. **PostgresSaver** — Agent state persistence and thread-based session memory for conversation continuity

### Critical Pitfalls

The research identifies 10 critical pitfalls, with the most severe being state desync between CopilotKit and LangGraph agents, cascading re-renders from unthrottled streaming, and tool selection hallucinations. Governance issues are also highlighted as critical—missing audit trails and safety scanning can lead to compliance violations in 2026 regulatory environments. Proactive AI becoming an annoying interruption is a significant UX risk that can cause users to disable the feature entirely.

1. **CopilotKit State Desync with LangGraph Agent** — use PostgresSaver (never InMemorySaver), implement composite thread IDs (user+conversation), configure proper connection pooling
2. **Generative UI Cascading Re-renders** — throttle UI updates to 100ms intervals, use React.memo with deep comparison, implement virtual scrolling for lists
3. **Tool Selection Hallucination** — keep under 20 tools total (4-6 per agent), semantic filtering to top 3-5 tools, temperature 0-0.2, JSON Schema validation before execution
4. **Proactive AI Becoming Annoying Interruption** — trigger only during natural pauses (3+ seconds idle), auto-hide after 5 seconds, one-click dismiss, "silent listening" strategy
5. **Missing Governance Framework** — establish AI decision logs from day one, implement mandatory human checkpoints, build audit trails, plan for data sovereignty

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation & Core Infrastructure
**Rationale:** The generative UI infrastructure (CopilotKit + AG-UI) must be correctly implemented before any AI features can work reliably. State synchronization, checkpointer configuration, and tool architecture are foundational—getting these wrong in early stages creates cascading technical debt.
**Delivers:** CopilotKit integration with LangGraph, PostgresSaver for state persistence, AG-UI protocol implementation, base component catalog with Zod schemas
**Addresses:** Chat with citations (table stakes), Session detail view (table stakes)
**Avoids:** CopilotKit state desync (Pitfall 2), Generative UI cascading re-renders (Pitfall 3), Tool selection hallucination (Pitfall 4), Missing governance framework (Pitfall 10)

### Phase 2: Research Hub & Discovery Layer
**Rationale:** Once the AI infrastructure is solid, building the Research Hub allows users to discover and explore conference content. This phase delivers visible value (session browsing, search, filtering) and establishes the content model before adding proactive AI.
**Delivers:** Conference/session data model (Conference, Session Prisma models), conference list browsing with filters, session detail pages, basic generative UI components (charts, tables)
**Addresses:** Conference/session list browsing (table stakes), Basic search and filtering (table stakes), Generative UI foundation (differentiator)
**Uses:** CopilotKit Provider, MCP Apps Renderer, AG-UI protocol from Phase 1

### Phase 3: Hub-to-Notebook Import Flow
**Rationale:** The import flow connects discovery (Hub) to deep analysis (Notebook), leveraging existing RAG infrastructure. This creates a complete user journey and validates that both sides of the platform work together.
**Delivers:** Session import API, Source creation for imported sessions, RagFlow indexing for session content, seamless navigation from Hub to Notebook
**Addresses:** Hub-to-Notebook import flow (differentiator)
**Implements:** Architecture Pattern 4 (Hub-to-Notebook import flow)
**Avoids:** Tight coupling between Hub and Notebook (Anti-Pattern 1)

### Phase 4: Proactive AI Layer
**Rationale:** Proactive AI suggestions require solid infrastructure and content. Only after the Hub has rich content and users are actively exploring should the AI begin surfacing recommendations. This phase requires careful UX design to avoid becoming an interruption.
**Delivers:** Context-aware suggestion engine, "silent listening" timing mechanisms, related session recommendations, suggestion acceptance rate monitoring
**Addresses:** Proactive AI suggestions (differentiator)
**Uses:** AG-UI protocol for state sync, LangGraph agent orchestration
**Avoids:** Proactive AI becoming annoying interruption (Pitfall 1)

### Phase 5: Advanced Generative UI
**Rationale:** Once basic generative UI is working and users are engaged, advanced components (network views, interactive dashboards) provide additional value for power users. This is lower priority than core functionality.
**Delivers:** Network graph components for session relationships, interactive dashboards with drill-down, knowledge graph visualization, advanced filter panels
**Addresses:** AI-generated knowledge graphs (differentiator), Advanced generative UI components
**Uses:** MCP Apps Renderer, AG-UI state sync

### Phase 6: Multi-Agent Orchestration (Optional)
**Rationale:** Multi-agent coordination (separate RAG, curation, and proactive agents) is only needed if the platform scales significantly. Early phases should use a single Research Agent to avoid complexity.
**Delivers:** Separate RAG agent, curation agent, and proactive agent with clear role contracts, deadlock guards, scoped memory isolation, central orchestrator
**Addresses:** Cross-session pattern detection (future feature)
**Avoids:** Multi-agent coordination collapse (Pitfall 6)

### Phase Ordering Rationale

The phase order follows dependency patterns from research: generative UI infrastructure (Phase 1) enables all AI features; Research Hub (Phase 2) provides the content context for discovery; Hub-to-Notebook import (Phase 3) creates a complete user journey; Proactive AI (Phase 4) requires rich content and established usage patterns; Advanced generative UI (Phase 5) builds on basic components; Multi-agent orchestration (Phase 6) is an optimization for scale.

The grouping separates infrastructure from features, ensuring that each phase delivers user-visible value. Phase 1 delivers no user-visible features but is critical—skipping it guarantees Pitfalls 2-4 will occur. Phases 2-3 deliver a complete Hub experience. Phase 4 adds AI intelligence. Phase 5 enhances power user experience. Phase 6 is optional until scale requires it.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Research Hub):** Conference data ingestion patterns — requires research on how to parse conference schedules, handle varying formats, and extract structured session data
- **Phase 4 (Proactive AI):** Context-aware timing mechanisms — requires UX research on natural user pause detection and suggestion acceptance patterns
- **Phase 5 (Advanced Generative UI):** Network graph visualization libraries — requires research on d3.js alternatives, performance for large datasets, and accessibility patterns

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** CopilotKit + LangGraph integration is well-documented with official examples
- **Phase 3 (Hub-to-Notebook import):** Pattern established by NotebookLM, straightforward API implementation
- **Phase 6 (Multi-Agent Orchestration):** LangGraph multi-agent patterns are documented, though complex

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | CopilotKit, AG-UI, and LangGraph have official documentation and production deployments |
| Features | MEDIUM | Table stakes clear from competitors (NotebookLM, Perplexity), but differentiator features are emerging with sparse implementation examples |
| Architecture | MEDIUM | AG-UI protocol and CopilotKit integration well-documented, but Hub-to-Notebook import pattern needs validation |
| Pitfalls | MEDIUM | Based on production blog posts and community reports, but some patterns are newly identified in 2026 |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Conference data ingestion strategy:** Research didn't cover how to obtain conference data in production. During planning, need to decide between manual upload, automated scraping, or API integration with conference platforms.
- **Session content format:** Unclear whether sessions have full transcripts, summaries only, or structured abstracts. This impacts RAG quality and generative UI capabilities.
- **Proactive AI performance metrics:** No clear benchmarks for acceptable suggestion acceptance rates or timing thresholds. Will need to monitor and tune in production.
- **Network graph scalability:** Research indicates performance challenges with large graphs (>500 nodes). Phase 5 may need performance testing and potential alternative approaches.

## Sources

### Primary (HIGH confidence)
- [CopilotKit Documentation](https://docs.copilotkit.ai) — Generative UI framework, hooks, state synchronization
- [AG-UI Protocol Documentation](https://docs.ag-ui.com) — Agent-User Interaction Protocol specification
- [AG-UI GitHub](https://github.com/ag-ui-protocol/ag-ui) — 12K+ stars, community implementations
- [LangGraph Checkpointing Documentation](https://langchain-ai.github.io/langgraph/how-tos/persistence/) — PostgresSaver, Thread ID, state persistence
- [Zod Documentation](https://zod.dev) — Schema validation standard for AI-generated props

### Secondary (MEDIUM confidence)
- [RAG Platform Evolution](https://www.csdn.net/article/details/143582342) — RAG 2.0 platforms, Agentic RAG maturity
- [NotebookLM Deep Research](https://blog.google/products/notebooklm/deep-research/) — Hub-to-notebook import pattern
- [CopilotKit for LangGraph Deep Analysis](https://blog.csdn.net/qhvssonic/article/details/158012730) — Integration patterns, hooks comparison
- [Generative UI Best Practices](https://juejin.cn/post/7607003319794089999) — Zod validation, error boundaries, streaming performance
- [CopilotKit GitHub Issues](https://github.com/CopilotKit/CopilotKit) — Production bugs (#2605, #1717), caching issues

### Tertiary (LOW confidence)
- [React 19 + AI Integration Trends (2025)] — Server Components + AI patterns (single source, needs validation)
- [Conference Platform Features](https://www.gtcconf.com/) — Session catalog patterns (general observation)
- [NotebookLM Importer Toolkit](https://chrome.google.com/webstore/detail/notebooklm-importer/) — Chrome extension for knowledge import

---
*Research completed: 2026-03-04*
*Ready for roadmap: yes*
