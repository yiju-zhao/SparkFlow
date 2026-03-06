# Phase 2: Research Hub - Context

**Gathered:** 2026-03-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver conference discovery experience with AI-powered generative UI. Users browse conferences/sessions, filter by various criteria, and interact with an AI assistant that can generate dynamic tables, charts, and filtered views on demand.

**In scope:**
- AI assistant integration with Hub agent
- Generative UI components (tables, charts) rendered inline in chat
- Context-aware AI suggestions
- Page-aware AI context
- Keyword search coexisting with AI search

**Out of scope:**
- Notebook integration (Phase 3)
- Proactive AI suggestions
- AI-driven filter application
- Conversation persistence across sessions

</domain>

<decisions>
## Implementation Decisions

### AI Assistant Integration
- **Entry point**: Floating panel with trigger button (bottom-right). Opens a slide-over panel for AI chat.
- **Agent connection**: Replace simulated responses with real Hub agent calls via CopilotKit. Agent responds with text + generative UI components.
- **Context awareness**: AI knows which conference/session the user is viewing. Can answer "Tell me about this conference" contextually.
- **Suggestions**: Context-aware suggestions that update based on current page (not static).
- **State management**: Reset on panel close. No persistence across browser sessions.

### Generative UI Placement
- **Render location**: Generated components (tables, charts) render inline in the chat panel. User scrolls chat history to see them.
- **Interactivity**: Fully interactive components:
  - Tables are sortable/filterable
  - Charts have hover details
  - Click table rows to navigate to detail pages
- **Chart types**: Bar, line, and pie charts (as per GENUI-02/03 requirements)
- **Large datasets**: Paginated results. Show first 20 rows with "Load more" or pagination controls.
- **Render mechanism**: MCP Apps structured approach. Agent returns structured data + component type. Frontend renders appropriate component.

### Hub Landing Experience
- **AI behavior**: On-demand only. No proactive engagement, greetings, or inline insights. User initiates all interactions.
- **Landing layout**: Keep existing layout (stats, year/topic charts, recent conferences). Just add AI panel availability.
- **Navigation**: Keep existing nav structure (Conferences, Sessions, Publications, Toolbox).
- **Availability**: AI panel available on ALL pages including detail pages. Consistent floating trigger everywhere.

### Filter + AI Integration
- **Filtering approach**: Manual filters only. AI does NOT apply filters to the FilterBar. Clear separation of concerns.
- **Search**: Keyword search + AI natural language search coexist. Both available for different use cases.
- **Filter UX**: Keep existing FilterBar component unchanged. AI can answer questions about filtered data but doesn't change filter state.

### Claude's Discretion
- Exact styling of generated components (tables, charts)
- Animation/transition details for panel open/close
- Error states for failed AI queries
- Empty state for generated components with no data

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/web/components/explore/research-assistant-panel.tsx`: Existing floating panel with trigger button. Replace simulated responses with CopilotKit integration.
- `apps/web/app/explore/page.tsx`: Landing page with stats, charts, recent conferences. Keep as-is.
- `apps/web/app/explore/conferences/page.tsx`: Conference list with FilterBar + ConferenceGrid. Keep as-is.
- `apps/web/components/explore/shared/filter-bar.tsx`: Filter component. Keep unchanged.
- `apps/agent/graphs/hub_agent.py`: Hub agent from Phase 1 with query tools.
- `apps/web/components/ui/`: Shadcn/UI components for tables, cards, etc.

### Established Patterns
- Floating panel pattern: ResearchAssistantTrigger + ResearchAssistantPanel
- Filter bar: FilterBar component with FilterConfig array
- Data fetching: Server components with Suspense + async queries
- Layout: ExploreHeader with nav links, consistent page structure

### Integration Points
- CopilotKit provider already wraps app (Phase 1)
- Hub agent already has query tools (Phase 1)
- Replace simulated responses in research-assistant-panel.tsx
- Add MCP Apps middleware for generative UI rendering
- Connect generated component clicks to navigation (router.push)

</code_context>

<specifics>
## Specific Ideas

- Keep the existing floating trigger button design (green with Sparkles icon)
- Generated tables should match the visual style of existing conference/session lists
- Charts should use the same color palette as the existing hub charts
- Context-aware suggestions could be: "What topics are trending at [current conference]?" or "Compare sessions at this venue"

</specifics>

<deferred>
## Deferred Ideas

- AI-driven filter application — keeping manual filters only for simplicity
- Conversation persistence across sessions — resets on close for v1
- Proactive AI suggestions/greetings — on-demand only for v1
- Additional chart types (scatter, area, radar) — bar/line/pie sufficient for v1

</deferred>

---

*Phase: 02-research-hub*
*Context gathered: 2026-03-06*
