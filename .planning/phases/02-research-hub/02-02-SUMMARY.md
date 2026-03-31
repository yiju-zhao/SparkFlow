---
phase: 02-research-hub
plan: 02
subsystem: ui
tags: [copilotkit, mcp-apps, builtin-agent, middleware, langgraph, generative-ui]

# Dependency graph
requires:
  - phase: 02-01
    provides: MCP server with SQLDatabaseToolkit and HTML templates for generative UI
provides:
  - CopilotKit route with BuiltInAgent + MCPAppsMiddleware connected to MCP server
  - Research assistant panel without useGenerativeComponents (MCP Apps handles rendering)
  - Simplified hub_agent.py stub (LangGraph no longer used for hub queries)
  - @ag-ui/mcp-apps-middleware installed in web frontend
affects: [03-notebook-integration, research-assistant-panel, copilotkit-route]

# Tech tracking
tech-stack:
  added: ["@ag-ui/mcp-apps-middleware"]
  patterns:
    - BuiltInAgent + MCPAppsMiddleware replaces LangGraphAgent for hub queries
    - MCP server handles all tool execution and generative UI rendering
    - Hub agent is now pure MCP-based, no LangGraph required

key-files:
  created: []
  modified:
    - apps/web/package.json
    - apps/web/app/api/copilotkit/route.ts
    - apps/web/components/explore/research-assistant-panel.tsx
    - apps/agent/graphs/hub_agent.py

key-decisions:
  - "BuiltInAgent with MCPAppsMiddleware replaces LangGraphAgent - simpler architecture, no LangGraph server needed for hub"
  - "MCP_SERVER_URL env var added for connecting CopilotKit to MCP server at port 3108"
  - "hub_agent.py simplified to a stub - MCP server handles all functionality; kept for potential Phase 3 use"

patterns-established:
  - "BuiltInAgent pattern: new BuiltInAgent({ model, prompt }).use(new MCPAppsMiddleware({ mcpServers }))"
  - "Agent name must be 'default' for BuiltInAgent convention"
  - "MCP server connects via type: 'http', url: MCP_SERVER_URL, serverId: 'hub-mcp-server'"

requirements-completed: [RHUB-01, RHUB-02, RHUB-03, RHUB-04, RHUB-05, RHUB-06, RHUB-07, GENUI-05, GENUI-06]

# Metrics
duration: 15min
completed: 2026-03-12
---

# Phase 2 Plan 02: MCPAppsMiddleware + CopilotKit BuiltInAgent Integration Summary

**CopilotKit route migrated from LangGraphAgent to BuiltInAgent + MCPAppsMiddleware, connecting the AI assistant to the MCP server for automatic generative UI rendering**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-12T00:00:00Z
- **Completed:** 2026-03-12T00:15:00Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Replaced LangGraphAgent with BuiltInAgent using openai/gpt-4o in the CopilotKit route
- Added MCPAppsMiddleware connecting to MCP server at port 3108 for automatic table/chart rendering
- Removed `useGenerativeComponents` import and call from research assistant panel (MCP Apps handles rendering)
- Simplified hub_agent.py to a stub comment since the MCP server now handles all hub queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Add @ag-ui/mcp-apps-middleware package** - `65da293` (feat)
2. **Task 2: Update CopilotKit route with BuiltInAgent + MCPAppsMiddleware** - `db78dfd` (feat)
3. **Task 3: Remove useGenerativeComponents from research assistant panel** - `97e30df` (feat)
4. **Task 4: Simplify hub_agent.py to stub** - `7db005b` (chore)

## Files Created/Modified

- `apps/web/package.json` - Added `@ag-ui/mcp-apps-middleware: latest` dependency
- `apps/web/app/api/copilotkit/route.ts` - Replaced LangGraphAgent with BuiltInAgent + MCPAppsMiddleware
- `apps/web/components/explore/research-assistant-panel.tsx` - Removed useGenerativeComponents import and hook call
- `apps/agent/graphs/hub_agent.py` - Simplified to stub; MCP server handles all functionality

## Decisions Made

- **BuiltInAgent over LangGraphAgent:** Simpler architecture for the hub use case. No need to run a separate LangGraph server. MCPAppsMiddleware provides all the tool execution and rendering needed.
- **MCP_SERVER_URL env var:** Added `process.env.MCP_SERVER_URL || "http://localhost:3108/mcp"` so the MCP server URL is configurable without code changes.
- **hub_agent.py as stub:** Kept the file to avoid breaking LangGraph server configuration, but stripped all logic since it's no longer called by CopilotKit. Marked for potential Phase 3 use.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Build failed because generative-ui module was deleted in Plan 02-01**
- **Found during:** Task 2 verification (npm run build)
- **Issue:** The `generative-ui` directory was deleted in Plan 02-01, but `research-assistant-panel.tsx` still imported `useGenerativeComponents` from it, causing a module-not-found build error
- **Fix:** Removed the import and hook call as specified in Task 3; fixed during Task 3 execution
- **Files modified:** `apps/web/components/explore/research-assistant-panel.tsx`
- **Verification:** npm run build passes after removal
- **Committed in:** `97e30df` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (blocking - missing module)
**Impact on plan:** Auto-fix was essential - the deleted generative-ui module was a direct result of Plan 02-01 work. Task 3 was already planned to fix this; the deviation was executing it before the build verification of Task 2 rather than after.

## Issues Encountered

- The route.ts file had uncommitted changes from a previous execution attempt. These were staged and committed as Task 2 rather than re-writing the file.

## User Setup Required

Environment variables needed for full functionality:
- `OPENAI_API_KEY` - Required for BuiltInAgent (openai/gpt-4o)
- `MCP_SERVER_URL` - Optional; defaults to `http://localhost:3108/mcp`

No external service dashboards or manual configuration steps beyond env vars.

## Next Phase Readiness

- CopilotKit AI assistant is fully wired to the MCP server for generative UI (tables, charts)
- AI knows current conference/session context via `useCopilotReadable` in the panel
- Panel resets state on close via `reset()` + `setThreadId(uuidv4())`
- Requires MCP server running on port 3108 and OPENAI_API_KEY set for end-to-end testing
- Phase 3 (Notebook Integration) can proceed; hub_agent.py stub is in place for potential LangGraph reuse

---
*Phase: 02-research-hub*
*Completed: 2026-03-12*
