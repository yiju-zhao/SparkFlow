---
phase: 02-research-hub
plan: 01
subsystem: mcp-server
tags: [mcp, fastmcp, sqldatabasetoolkit, langchain, html-templates, chart.js, copilotkit]

# Dependency graph
requires:
  - phase: 01-foundation-data
    provides: PostgreSQL database with venues, instances, conference_sessions tables
provides:
  - Python MCP server with SQLDatabaseToolkit for dynamic database queries
  - HTML templates for generative table and chart UIs
  - ui://table and ui://chart resources for MCP Apps
affects: [02-02, copilotkit-integration, generative-ui]

# Tech tracking
tech-stack:
  added: [mcp, langchain-community, chart.js]
  patterns: [MCP Apps, HTML templates, postMessage communication]

key-files:
  created:
    - apps/mcp-server/server.py
    - apps/mcp-server/requirements.txt
    - apps/mcp-server/ui/table.html
    - apps/mcp-server/ui/chart.html
  modified:
    - apps/agent/requirements.txt
    - apps/agent/graphs/hub_agent.py

key-decisions:
  - "Use FastMCP with streamable-http transport on port 3108"
  - "SQLDatabaseToolkit provides dynamic SQL queries instead of predefined tools"
  - "HTML templates with postMessage for MCP Apps communication"
  - "Chart.js CDN for chart rendering (bar, line, pie)"

patterns-established:
  - "MCP Apps pattern: tools return structuredContent + ui:// reference"
  - "HTML templates receive data via postMessage event listener"
  - "FastMCP resource decorators for ui:// URIs"

requirements-completed: [GENUI-01, GENUI-02, GENUI-03, GENUI-04]

# Metrics
duration: 5min
completed: 2026-03-11
---

# Phase 02 Plan 01: MCP Server with SQLDatabaseToolkit Summary

**Python MCP server with LangChain SQLDatabaseToolkit for dynamic database queries and HTML templates for generative table/chart UIs via MCP Apps architecture**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T20:57:04Z
- **Completed:** 2026-03-11T21:02:09Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Deleted old React-based generative UI components (GenerativeTable, GenerativeChart, useComponent hooks)
- Created Python MCP server with FastMCP and SQLDatabaseToolkit for dynamic SQL query generation
- Built HTML templates for table and chart UIs with postMessage communication for MCP Apps
- Removed predefined hub_queries.py tools in favor of dynamic toolkit queries

## Task Commits

Each task was committed atomically:

1. **Task 1: Delete old generative-ui components and hub_queries.py** - `afe73fa` (feat)
2. **Task 2: Create MCP server with SQLDatabaseToolkit** - `e170051` (feat)
3. **Task 3: Create HTML templates for MCP Apps UI** - `a59b552` (feat)

**Plan metadata:** pending (will be committed after this summary)

## Files Created/Modified

- `apps/mcp-server/server.py` - FastMCP server with SQLDatabaseToolkit and ui:// resources
- `apps/mcp-server/requirements.txt` - Python dependencies (mcp, langchain-community)
- `apps/mcp-server/ui/table.html` - HTML template with postMessage, sorting, empty state
- `apps/mcp-server/ui/chart.html` - HTML template with Chart.js (bar, line, pie)
- `apps/agent/requirements.txt` - Added mcp and langchain-community dependencies
- `apps/agent/graphs/hub_agent.py` - Removed old tool imports (awaiting 02-02 integration)
- `apps/agent/tools/hub_queries.py` - DELETED (replaced by SQLDatabaseToolkit)
- `apps/web/components/explore/generative-ui/` - DELETED (replaced by HTML templates)

## Decisions Made

- **FastMCP over raw MCP SDK**: Decorator API simplifies tool/resource registration
- **SQLDatabaseToolkit over predefined tools**: Dynamic query generation handles any user question
- **HTML templates over React components**: Simpler architecture, no React maintenance needed
- **Chart.js CDN over npm package**: Self-contained templates load Chart.js from CDN
- **streamable-http transport**: Simpler than SSE for this use case

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed without issues.

## User Setup Required

None - no external service configuration required.

**Note:** The MCP server requires:
1. `DATABASE_URL` environment variable (same as agent service)
2. `OPENAI_API_KEY` environment variable (for SQLDatabaseToolkit LLM)
3. Install dependencies: `cd apps/mcp-server && pip install -r requirements.txt`

## Next Phase Readiness

- MCP server infrastructure complete
- HTML templates ready for CopilotKit MCPAppsMiddleware integration
- Next: Plan 02-02 will integrate MCPAppsMiddleware with CopilotKit BuiltInAgent

---

*Phase: 02-research-hub*
*Completed: 2026-03-11*

## Self-Check: PASSED

Verified:
- All created files exist on disk
- All deleted files removed
- 3 commits with 02-01 tag found in git history
