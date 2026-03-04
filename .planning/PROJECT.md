# DeepSense Insight Platform

## What This Is

A two-part insight platform for industry analysts and conference attendees:
1. **Research Hub** — Curated conference/session information with AI-native exploration via generative UI
2. **Notebook System** — Deep research and analysis with RAG-powered document understanding

Users can discover insights through an AI assistant that dynamically generates custom interfaces (charts, tables, filters, network views) based on their queries, then import sessions to notebooks for deeper analysis.

## Core Value

**Generative UI experience** — The AI assistant creates dynamic, interactive interfaces on demand based on user queries. This is the key differentiator from traditional research tools.

## Requirements

### Validated

- ✓ Notebook-based research workflow — existing
- ✓ Document ingestion and RAG (RagFlow + MinIO) — existing
- ✓ Chat with citations — existing
- ✓ User authentication (NextAuth) — existing
- ✓ Document/webpage sources with processing status — existing

### Active

- [ ] Research Hub with conference/session curation
- [ ] Research Hub overview (conference list, recent activity, quick filters)
- [ ] AI assistant with generative UI capabilities
- [ ] Proactive AI that suggests, surfaces, connects without being asked
- [ ] Hub → Notebook flow (import session as source for deep analysis)
- [ ] CopilotKit + MCP Apps + AG-UI integration for dynamic interfaces
- [ ] Manual curation workflow for conference/session data

### Out of Scope

- Real-time conference streaming — focus on post-event analysis
- Video content processing — defer to future version
- Public API for third-party integrations — not needed for v1
- Mobile app — web-first approach

## Context

**Existing Codebase (SparkFlow):**
- Next.js 15 frontend with React 19, TypeScript
- LangGraph Python agent service for RAG reasoning
- RagFlow for document chunking/indexing/retrieval
- MinIO (S3-compatible) for document storage
- PostgreSQL with Prisma ORM
- Current app is "less AI native" — AI is present but not the primary interaction model

**Target Experience:**
- AI as entry point, not sidebar feature
- Generative UI creates custom interfaces on demand
- Proactive AI surfaces insights without explicit prompts
- Seamless flow from discovery (Hub) to deep analysis (Notebook)

## Constraints

- **Tech Stack**: Build on existing Next.js + LangGraph + RagFlow foundation
- **UI Framework**: CopilotKit for AI integration, MCP Apps for generative UI, AG-UI protocol for state sync
- **Data Model**: Extend existing Prisma schema for conferences/sessions
- **Backward Compatible**: Existing notebook functionality must continue working

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| CopilotKit + MCP Apps + AG-UI | Standardized way to ship interactive UIs from AI tools, keeps agent ↔ UI ↔ app synchronized | — Pending |
| Manual curation over scraping | More control over data quality, simpler v1 implementation | — Pending |
| Hub → Notebook import flow | Leverage existing RAG capabilities for deep analysis | — Pending |
| Domain-agnostic conference types | Platform can serve any industry/domain | — Pending |

---
*Last updated: 2026-03-03 after initialization*
