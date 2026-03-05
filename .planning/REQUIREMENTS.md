# Requirements: DeepSense Insight Platform

**Defined:** 2026-03-04
**Core Value:** Generative UI experience — AI creates dynamic, interactive interfaces on demand

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Research Hub - Core

- [ ] **RHUB-01**: User can view list of all conferences with basic stats (session count, date range)
- [ ] **RHUB-02**: User can browse sessions within a conference (title, speakers, tags)
- [ ] **RHUB-03**: User can view session detail page (full description, speaker info, related sessions)
- [ ] **RHUB-04**: User can filter sessions by topic tag
- [ ] **RHUB-05**: User can filter sessions by date
- [ ] **RHUB-06**: User can filter sessions by speaker name
- [ ] **RHUB-07**: User can search sessions by keyword (title, description, speaker)

### Research Hub - Generative UI

- [ ] **GENUI-01**: User can ask AI assistant questions about the hub content
- [ ] **GENUI-02**: AI assistant can generate dynamic tables from query results
- [ ] **GENUI-03**: AI assistant can generate dynamic charts (bar, line, pie) from data
- [ ] **GENUI-04**: AI assistant can generate filtered views based on user constraints
- [ ] **GENUI-05**: Generated UI components render in assistant panel
- [ ] **GENUI-06**: User can interact with generated components (click, sort, select)

### Notebook Integration

- [ ] **NOTE-01**: User can import a session to notebook as a source
- [ ] **NOTE-02**: Imported session content is indexed for RAG retrieval
- [ ] **NOTE-03**: User can analyze imported sessions with existing chat capabilities
- [ ] **NOTE-04**: Import preserves session metadata (conference, speakers, tags)

### AI Infrastructure

- [ ] **INFRA-01**: CopilotKit provider wraps the application
- [ ] **INFRA-02**: AG-UI protocol streams state updates between agent and UI
- [ ] **INFRA-03**: MCP Apps middleware renders dynamic components
- [x] **INFRA-04**: Research agent connects to conference/session data
- [x] **INFRA-05**: Agent state persists across conversations (PostgresSaver)

### Data Model

- [ ] **DATA-01**: Conference model (name, description, date range, venue)
- [ ] **DATA-02**: Session model (title, description, speakers, tags, conference reference)
- [ ] **DATA-03**: Speaker model (name, bio, affiliation)
- [ ] **DATA-04**: Tag model (name, category)
- [x] **DATA-05**: Admin can create/edit conferences via UI
- [x] **DATA-06**: Admin can create/edit sessions via UI

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Proactive AI

- **PROAI-01**: AI suggests related sessions based on current view
- **PROAI-02**: AI surfaces connections between sessions user hasn't seen
- **PROAI-03**: AI highlights trending topics across conferences

### Advanced Generative UI

- **GENUI-07**: AI generates network graphs showing topic/speaker relationships
- **GENUI-08**: AI generates timeline views of industry discourse
- **GENUI-09**: AI generates comparison tables across multiple sessions

### Collaboration

- **COLLAB-01**: User can share notebook with team members
- **COLLAB-02**: User can share AI-generated views with team

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time conference streaming | Massive complexity — focus on post-event analysis |
| Mobile native app | Web-first approach; PWA for offline capability later |
| Public API | Internal APIs first; external API when demand exists |
| Social features (likes, comments) | Distracts from core research value |
| Video content processing | Text-first approach; defer video analysis |
| Proactive AI for v1 | Requires foundation first; add in v1.x |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

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
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 1 | Complete |
| DATA-01 | Phase 1 | Pending |
| DATA-02 | Phase 1 | Pending |
| DATA-03 | Phase 1 | Pending |
| DATA-04 | Phase 1 | Pending |
| DATA-05 | Phase 1 | Complete |
| DATA-06 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after roadmap creation*
