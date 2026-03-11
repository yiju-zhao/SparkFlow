# Roadmap: DeepSense Insight Platform

**Project:** DeepSense Insight Platform (Research Hub + Generative AI)
**Granularity:** Coarse (3-5 phases)
**Created:** 2026-03-04

## Phases

- [ ] **Phase 1: Foundation & Data** - Data model and AI infrastructure for generative UI
- [ ] **Phase 2: Research Hub** - Conference discovery with AI-powered generative UI
- [ ] **Phase 3: Notebook Integration** - Import sessions from Hub for deep RAG analysis
- [ ] **Phase 4: Polish & Enhancement** - Performance, edge cases, UX refinements

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Data | 5/5 | Complete | 2026-03-05 |
| 2. Research Hub | 0/2 | Replanning | - |
| 3. Notebook Integration | 0/0 | Not started | - |
| 4. Polish & Enhancement | 0/0 | Not started | - |

## Phase Details

### Phase 1: Foundation & Data

**Goal**: Establish data model and AI infrastructure for generative UI capabilities

**Depends on**: Nothing (first phase)

**Requirements**: DATA-01, DATA-02, DATA-03, DATA-04, DATA-05, DATA-06, INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05

**Success Criteria** (what must be TRUE):
1. Admin can create/edit conferences and sessions via UI
2. Conference, Session, Speaker, and Tag models exist in database with proper relationships
3. CopilotKit provider wraps the application and can receive messages from LangGraph agent
4. AG-UI protocol streams state updates between agent and UI in real-time
5. Research agent can query conference/session data and respond with structured state updates

**Plans**: 5 plans in 4 waves

Plans:
- [x] 01-01-PLAN.md — Verify and extend Prisma models for conference domain
- [x] 01-02-PLAN.md — Create admin curation UI for Venue, Instance, Session
- [x] 01-03-PLAN.md — Integrate CopilotKit provider with AG-UI protocol
- [x] 01-04-PLAN.md — Create Hub agent config, prompt, and query tools
- [x] 01-05-PLAN.md — Assemble Hub agent with PostgresSaver and register

---

### Phase 2: Research Hub

**Goal**: Deliver conference discovery experience with AI-powered generative UI via MCP Apps

**Depends on**: Phase 1 (Foundation & Data)

**Requirements**: RHUB-01, RHUB-02, RHUB-03, RHUB-04, RHUB-05, RHUB-06, RHUB-07, GENUI-01, GENUI-02, GENUI-03, GENUI-04, GENUI-05, GENUI-06

**Success Criteria** (what must be TRUE):
1. User can browse conferences, view sessions, filter by tag/date/speaker, and search by keyword
2. User can ask AI assistant questions about hub content and receive natural language responses
3. AI assistant generates dynamic tables that display filtered query results via MCP Apps HTML templates
4. AI assistant generates dynamic charts (bar, line, pie) that visualize session data via Chart.js templates
5. User can interact with generated components (tables sortable, charts interactive)

**Plans**: 2 plans in 2 waves

Plans:
- [ ] 02-01-PLAN.md — Create MCP server with SQLDatabaseToolkit and HTML templates
- [ ] 02-02-PLAN.md — Integrate MCPAppsMiddleware with CopilotKit BuiltInAgent

---

### Phase 3: Notebook Integration

**Goal**: Enable seamless import from Research Hub to DeepDive Notebook for RAG analysis

**Depends on**: Phase 2 (Research Hub)

**Requirements**: NOTE-01, NOTE-02, NOTE-03, NOTE-04

**Success Criteria** (what must be TRUE):
1. User can import a session to notebook as a source from session detail page
2. Imported session content is indexed in RagFlow for RAG retrieval
3. User can analyze imported sessions with existing chat capabilities
4. Import preserves session metadata (conference, speakers, tags) in the source

**Plans**: TBD

---

### Phase 4: Polish & Enhancement

**Goal**: Refine performance, handle edge cases, and improve UX

**Depends on**: Phase 3 (Notebook Integration)

**Requirements**: (All v1 requirements delivered - this phase is enhancement work)

**Success Criteria** (what must be TRUE):
1. Generative UI components render efficiently with no cascading re-renders or performance issues
2. Agent state persists reliably across browser sessions and conversation threads
3. Edge cases are handled gracefully (empty results, API failures, malformed data)
4. User experience is polished with smooth transitions and clear feedback

**Plans**: TBD

---

## Requirement Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| RHUB-01 | Phase 2 | Pending |
| RHUB-02 | Phase 2 | Pending |
| RHUB-03 | Phase 2 | Pending |
| RHUB-04 | Phase 2 | Pending |
| RHUB-05 | Phase 2 | Pending |
| RHUB-06 | Phase 2 | Pending |
| RHUB-07 | Phase 2 | Pending |
| GENUI-01 | Phase 2 | Pending |
| GENUI-02 | Phase 2 | Pending |
| GENUI-03 | Phase 2 | Pending |
| GENUI-04 | Phase 2 | Pending |
| GENUI-05 | Phase 2 | Pending |
| GENUI-06 | Phase 2 | Pending |
| NOTE-01 | Phase 3 | Pending |
| NOTE-02 | Phase 3 | Pending |
| NOTE-03 | Phase 3 | Pending |
| NOTE-04 | Phase 3 | Pending |
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 1 | Complete |
| DATA-01 | Phase 1 | Complete |
| DATA-02 | Phase 1 | Complete |
| DATA-03 | Phase 1 | Complete |
| DATA-04 | Phase 1 | Complete |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Roadmap created: 2026-03-04*
*Last updated: 2026-03-11 (Phase 2 replan - MCP Apps architecture)*
