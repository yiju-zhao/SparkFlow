# Phase 1: Foundation & Data - Context

**Gathered:** 2026-03-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish data model and AI infrastructure for generative UI capabilities. This phase delivers:
- Data models for conferences, sessions, speakers, and tags
- Admin curation UI for managing conference data
- CopilotKit provider integration with AG-UI protocol
- Research agent that can query conference/session data with structured state updates

Out of scope: Research Hub discovery UI, generative UI components (tables, charts), notebook integration.

</domain>

<decisions>
## Implementation Decisions

### Data Model Alignment
- Keep existing Prisma model names: `Venue`, `Instance`, `ConferenceSession`, `Publication`
- Do NOT rename to match requirements naming (Conference/Session) - avoids migration complexity
- Extend existing models with any missing fields identified during planning
- Rationale: Existing models already have data and working code; renaming adds risk with minimal value

### Speaker & Tag Handling
- Keep speakers as `String[]` on ConferenceSession model (existing pattern)
- Keep topics as `String[]` on ConferenceSession model (existing pattern)
- Do NOT create separate Speaker or Tag models for v1
- Rationale: Simplicity first; can extract to relations in v2 if curation needs grow

### Admin Curation UI
- Simple CRUD forms for Venue, Instance, and ConferenceSession
- Use existing Shadcn/UI component patterns from apps/web/components/ui/
- Follow existing form patterns from notebook/source management
- Create new `/admin` route section for curation interface
- No bulk import for v1 - manual form-based entry aligns with "manual curation" decision

### AI Infrastructure Integration
- Create new Research Hub agent (separate from existing RAG agent)
- Hub agent uses CopilotKit provider for AI integration
- AG-UI protocol streams state updates from agent to UI
- MCP Apps middleware renders dynamic components
- Existing RAG agent continues handling notebook/document queries unchanged
- Both agents coexist - Hub agent for discovery, RAG agent for deep analysis

### Agent State Persistence
- Use PostgresSaver for Research Hub agent state (per requirements INFRA-05)
- Follow existing LangGraph persistence patterns
- State persists across browser sessions and conversation threads

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/prisma/schema.prisma`: Venue, Instance, ConferenceSession, Publication models already exist
- `apps/agent/graphs/rag_agent.py`: Agent structure with tools and middleware pattern
- `apps/web/components/ui/`: Shadcn/UI components for forms, dialogs, tables
- `apps/web/lib/prisma.ts`: Database client pattern
- `apps/web/lib/actions/`: Server actions pattern for mutations

### Established Patterns
- Prisma schema: camelCase fields, PascalCase models, @@map for snake_case tables
- Agent: Deep Agents library with FilesystemBackend for skills
- Forms: Server Actions with try/catch, validation before mutation
- API routes: NextRequest/NextResponse with error handling

### Integration Points
- New `/admin` routes for curation UI
- New Research Hub agent entry point (similar to rag_agent.py)
- CopilotKit provider wraps app (new dependency)
- AG-UI protocol connects agent state to UI components

</code_context>

<specifics>
## Specific Ideas

- Admin UI should be functional, not fancy - this is internal tooling
- Conference sessions already have good coverage (title, speakers, topics, abstract, transcript)
- Focus Phase 1 on infrastructure, not UI polish

</specifics>

<deferred>
## Deferred Ideas

- Separate Speaker model with bio/affiliation - v2 if needed
- Separate Tag model with categories - v2 if needed
- Bulk import from CSV/Excel - v2 if manual curation becomes tedious
- Proactive AI suggestions - Phase 4 or later

</deferred>

---

*Phase: 01-foundation-data*
*Context gathered: 2026-03-04*
