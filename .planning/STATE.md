---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_plan: Plan 05
status: executing
last_updated: "2026-03-05T15:38:22.181Z"
last_activity: "2026-03-05 - Completed Phase 1 Plan 04: Hub Agent Config, Prompt, Query Tools"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 5
  completed_plans: 4
---

# Project State: DeepSense Insight Platform

**Project:** DeepSense Insight Platform (Research Hub + Generative AI)
**Current Focus:** Foundation & Data (Phase 1)
**Last Updated:** 2026-03-05

## Progress Summary

```
Phase 1: Foundation & Data    [██░░░░░░░░] 20%
Phase 2: Research Hub          [░░░░░░░░░░] 0%
Phase 3: Notebook Integration  [░░░░░░░░░░] 0%
Phase 4: Polish & Enhancement  [░░░░░░░░░░] 0%

Overall Progress: [█░░░░░░░░░] 5%
```

## Current Position

**Active Phase:** Phase 1 - Foundation & Data
**Current Plan:** Plan 05
**Status:** In progress

### Phase 1: Foundation & Data

**Goal:** Establish data model and AI infrastructure for generative UI capabilities

**Plans Complete:** 4/5
**Status:** In progress

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

| Phase | Plan | Duration | Tasks | Files | Date |
|-------|------|----------|-------|-------|------|
| 01-foundation-data | 01 | 5min | 2 | 0 | 2026-03-05 |
| 01-foundation-data | 02 | 4min | 5 | 9 | 2026-03-05 |
| 01-foundation-data | 04 | 2min | 3 | 3 | 2026-03-05 |

---

## Accumulated Context

### Decisions Made

| Decision | Date | Rationale |
|----------|------|-----------|
| CopilotKit + MCP Apps + AG-UI stack | 2026-03-04 | Standardized way to ship interactive UIs from AI tools |
| Manual curation workflow | 2026-03-04 | More control over data quality, simpler v1 implementation |
| Hub-to-Notebook import flow | 2026-03-04 | Leverage existing RAG capabilities for deep analysis |
| Domain-agnostic conference types | 2026-03-04 | Platform can serve any industry/domain |
| DATA-03/DATA-04: speaker/topic as String[] arrays | 2026-03-05 | No separate Speaker/Tag models needed; arrays sufficient for v1 |
| Conference abstraction: Venue=permanent, Instance=yearly | 2026-03-05 | Clean separation of conference identity from occurrence data |
| Native HTML select for admin dropdowns | 2026-03-05 | Simpler than Shadcn Select for internal admin tooling |
| Comma-separated inputs for string[] fields | 2026-03-05 | Straightforward UX for admin; no tag/chip UI needed at v1 |
| psycopg3 for hub query tools | 2026-03-05 | requirements.txt specifies psycopg[binary] which is psycopg3 |
| Hub agent config uses dataclass | 2026-03-05 | Consistent with RAGAgentConfig pattern — simpler than pydantic_settings |

### Todos

*None (project not started)*

### Blockers

*None (project not started)*

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | create toolbox section and move query matcher to toolbox | 2026-03-04 | dd3e8cc | [1-create-toolbox-section-and-move-query-ma](./quick/1-create-toolbox-section-and-move-query-ma/) |
| 2 | make a new header next to sessions called toolbox and design the toolbox page and move the query matcher to the toolbox page | 2026-03-04 | 0b33439 | [2-make-a-new-header-next-to-sessions-calle](./quick/2-make-a-new-header-next-to-sessions-calle/) |
| 4 | fix query matcher excel input format and add translation before matching | 2026-03-05 | 9d56606 | [4-fix-query-matcher-excel-file-input-forma](./quick/4-fix-query-matcher-excel-file-input-forma/) |

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

**Session Date:** 2026-03-05
**Session Goal:** Execute Phase 1 Plans 03-04

**What was done:**
- Plan 03: CopilotKit integration (AppProviders wrapper, CopilotKitProvider, root layout update)
- Plan 04: Hub agent config (HubAgentConfig), system prompt (HUB_AGENT_SYSTEM_PROMPT), query tools (list_venues, list_instances, list_sessions, search_sessions)

**Next steps:**
- Execute Phase 1 Plan 05: Hub agent assembly and registration

Last activity: 2026-03-05 - Completed Phase 1 Plan 04: Hub Agent Config, Prompt, Query Tools

---

*State initialized: 2026-03-04*
