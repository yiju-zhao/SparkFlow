# Phase 2: Research Hub - Context

**Gathered:** 2026-03-06
**Updated:** 2026-03-11
**Status:** Ready for replan - MCP Apps architecture change

<domain>
## Phase Boundary

Deliver conference discovery experience with AI-powered generative UI. Users browse conferences/sessions, filter by various criteria, and interact with an AI assistant that can generate dynamic tables, charts, and filtered views on demand.

**In scope:**
- AI assistant integration with Hub agent via MCP
- Generative UI components (tables, charts) rendered via MCP Apps
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

### MCP Server for Hub Agent
- **Architecture**: Create a Python MCP server that handles database queries and serves UI templates
- **Database access**: Use LangChain SQLDatabaseToolkit for dynamic query generation with full database access
- **Tool approach**: Replace predefined tools (list_venues, search_sessions) with dynamic SQL query generation
- **Query scope**: Agent can query any table with automatic schema discovery
- **Server type**: HTTP MCP server (not SSE) for simplicity

### Generative UI via MCP Apps
- **UI mechanism**: MCP Apps HTML templates served by MCP server, rendered in sandboxed iframe by CopilotKit
- **UI resources**: Declare `ui://table` and `ui://chart` resources in MCP server
- **Tool responses**: Tools return structured data + `ui://` reference (not just text)
- **Chart types**: Bar, line, and pie charts (as per GENUI-02/03 requirements)
- **Remove existing**: Delete `useComponent` hooks and React GenerativeTable/GenerativeChart components

### CopilotKit Integration
- **Middleware**: Use `@ag-ui/mcp-apps-middleware` package
- **Runtime**: Configure MCPAppsMiddleware in CopilotKit API route
- **Agent**: Use `BuiltInAgent` with MCP middleware (or connect existing LangGraph agent via MCP bridge)
- **Sync protocol**: AG-UI protocol keeps agent ↔ UI ↔ app synchronized automatically

### AI Assistant Integration
- **Entry point**: Floating panel with trigger button (bottom-right). Opens a slide-over panel for AI chat.
- **Context awareness**: AI knows which conference/session the user is viewing. Can answer "Tell me about this conference" contextually.
- **Suggestions**: Context-aware suggestions that update based on current page (not static).
- **State management**: Reset on panel close. No persistence across browser sessions.

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
- Exact HTML/CSS styling of MCP App templates
- Animation/transition details for panel open/close
- Error states for failed AI queries
- Empty state for generated components with no data

</decisions>

<code_context>
## Existing Code Insights

### To Remove
- `apps/web/components/explore/generative-ui/index.ts`: useComponent hooks — replace with MCP Apps
- `apps/web/components/explore/generative-ui/generative-table.tsx`: React component — replace with HTML template
- `apps/web/components/explore/generative-ui/generative-chart.tsx`: React component — replace with HTML template
- `apps/agent/tools/hub_queries.py`: Predefined tools — replace with SQLDatabaseToolkit

### To Modify
- `apps/agent/graphs/hub_agent.py`: Reconfigure to use MCP server instead of direct tools
- `apps/web/app/api/copilotkit/route.ts`: Add MCPAppsMiddleware configuration
- `apps/web/lib/copilotkit-provider.tsx`: May need updates for MCP Apps integration

### To Create
- `apps/mcp-server/`: New Python MCP server package
  - `server.py`: MCP server with SQLDatabaseToolkit
  - `ui/table.html`: HTML template for tables
  - `ui/chart.html`: HTML template for charts
- `apps/agent/requirements.txt`: Add `mcp`, `langchain-community` packages
- `apps/web/package.json`: Add `@ag-ui/mcp-apps-middleware` package

### Reusable Assets (Keep)
- `apps/web/components/explore/research-assistant-panel.tsx`: Floating panel UI — keep
- `apps/web/app/explore/page.tsx`: Landing page — keep
- `apps/web/components/explore/shared/filter-bar.tsx`: Filter component — keep

### Integration Points
- CopilotKit provider already wraps app (Phase 1)
- PostgreSQL database accessible from MCP server
- AG-UI packages already installed in frontend

</code_context>

<specifics>
## Specific Ideas

- Keep the existing floating trigger button design (green with Sparkles icon)
- MCP App HTML templates should match the visual style of existing conference/session lists
- Charts should use the same color palette as the existing hub charts
- Context-aware suggestions could be: "What topics are trending at [current conference]?" or "Compare sessions at this venue"
- Reference: https://docs.copilotkit.ai/langgraph/generative-ui/mcp-apps
- Reference: https://www.copilotkit.ai/blog/bring-mcp-apps-into-your-own-app-with-copilotkit-and-ag-ui

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
*Context updated: 2026-03-11*
