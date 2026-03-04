# Project State: DeepSense Insight Platform

**Project:** DeepSense Insight Platform (Research Hub + Generative AI)
**Current Focus:** Foundation & Data (Phase 1)
**Last Updated:** 2026-03-04

## Progress Summary

```
Phase 1: Foundation & Data    [░░░░░░░░░░] 0%
Phase 2: Research Hub          [░░░░░░░░░░] 0%
Phase 3: Notebook Integration  [░░░░░░░░░░] 0%
Phase 4: Polish & Enhancement  [░░░░░░░░░░] 0%

Overall Progress: [░░░░░░░░░░] 0%
```

## Current Position

**Active Phase:** Phase 1 - Foundation & Data
**Current Plan:** TBD (awaiting phase planning)
**Status:** Not started

### Phase 1: Foundation & Data

**Goal:** Establish data model and AI infrastructure for generative UI capabilities

**Plans Complete:** 0/0
**Status:** Not started

---

## Project Reference

### Core Value

Generative UI experience — The AI assistant creates dynamic, interactive interfaces on demand based on user queries. This is the key differentiator from traditional research tools.

### Tech Stack

- Frontend: Next.js 15, React 19, TypeScript, Shadcn/UI
- Backend: LangGraph Python agent service
- RAG: RagFlow for chunking/indexing/retrieval
- Storage: MinIO (S3-compatible) for documents
- Database: PostgreSQL with Prisma ORM
- AI Integration: CopilotKit + MCP Apps + AG-UI protocol

### Architecture Pattern

- AG-UI protocol for real-time agent-UI state synchronization
- PostgresSaver for agent state persistence
- Separate agents for Hub (discovery) and Notebook (deep analysis)
- Source entities as integration contract between Hub and Notebook

---

## Performance Metrics

*No metrics collected yet (project not started)*

---

## Accumulated Context

### Decisions Made

| Decision | Date | Rationale |
|----------|------|-----------|
| CopilotKit + MCP Apps + AG-UI stack | 2026-03-04 | Standardized way to ship interactive UIs from AI tools |
| Manual curation workflow | 2026-03-04 | More control over data quality, simpler v1 implementation |
| Hub-to-Notebook import flow | 2026-03-04 | Leverage existing RAG capabilities for deep analysis |
| Domain-agnostic conference types | 2026-03-04 | Platform can serve any industry/domain |

### Todos

*None (project not started)*

### Blockers

*None (project not started)*

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | create toolbox section and move query matcher to toolbox | 2026-03-04 | dd3e8cc | [1-create-toolbox-section-and-move-query-ma](./quick/1-create-toolbox-section-and-move-query-ma/) |
| 2 | make a new header next to sessions called toolbox and design the toolbox page and move the query matcher to the toolbox page | 2026-03-04 | 0b33439 | [2-make-a-new-header-next-to-sessions-calle](./quick/2-make-a-new-header-next-to-sessions-calle/) |

### Notes

- Coarse granularity (3-5 phases) for v1 delivery
- Research Hub delivers conference discovery with generative UI
- Notebook Integration connects Hub to existing RAG capabilities
- Phase 4 is polish/enhancement work, no new requirements

---

## Session Continuity

### Previous Sessions

*No previous sessions*

### Current Session Context

**Session Date:** 2026-03-04
**Session Goal:** Create roadmap for DeepSense Insight Platform

**What was done:**
- Analyzed 28 v1 requirements across 5 categories
- Derived 4 phases based on coarse granularity
- Validated 100% requirement coverage
- Created ROADMAP.md with phase structure and success criteria
- Created STATE.md for project tracking
- Updated REQUIREMENTS.md with traceability

**Next steps:**
- Plan Phase 1 (Foundation & Data) with `/gsd:plan-phase 1`

Last activity: 2026-03-04 - Completed quick task 2: make a new header next to sessions called toolbox and design the toolbox page and move the query matcher to the toolbox page

---

*State initialized: 2026-03-04*
