---
phase: 02-research-hub
verified: 2026-03-12T00:00:00Z
status: human_needed
score: 4/5 must-haves verified
human_verification:
  - test: "Ask AI assistant a question and receive a natural language response"
    expected: "Panel sends question, BuiltInAgent responds via CopilotKit; MCP server at port 3108 serves query_conferences tool"
    why_human: "Requires live MCP server + OpenAI key; cannot verify runtime message flow programmatically"
  - test: "AI generates a table that renders via MCP Apps HTML template"
    expected: "query_conferences tool returns structuredContent + _meta.ui.resourceUri='ui://table'; CopilotKit renders result in sandboxed iframe using table.html"
    why_human: "Requires MCPAppsMiddleware runtime rendering; cannot verify iframe injection programmatically"
  - test: "AI generates a chart that renders via Chart.js HTML template"
    expected: "query_conferences tool result routed to ui://chart; chart.html renders bar/line/pie via Chart.js CDN"
    why_human: "Same runtime dependency; cannot verify Chart.js rendering programmatically"
  - test: "Panel shows context-aware suggestions based on current page"
    expected: "On /explore/conferences/[id] suggestions are conference-specific; on /explore/sessions/[id] suggestions are session-specific; on default pages show generic suggestions"
    why_human: "Requires browser navigation to verify pathname-driven suggestion changes"
  - test: "Panel state resets when closed"
    expected: "Closing panel calls reset() and setThreadId(uuidv4()); reopening shows empty message list"
    why_human: "Requires live browser interaction to verify state reset behavior"
  - test: "AI knows which conference/session user is viewing"
    expected: "useCopilotReadable passes contextString ('User is viewing conference: CVPR 2024') to agent; agent incorporates it in response"
    why_human: "Requires live agent interaction to verify context injection into prompt"
---

# Phase 02: Research Hub Verification Report

**Phase Goal:** Deliver conference discovery experience with AI-powered generative UI via MCP Apps
**Verified:** 2026-03-12
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

The phase goal requires five observable truths per ROADMAP.md success criteria:

| # | Truth | Status | Evidence |
|---|-------|--------|---------|
| 1 | User can browse conferences, view sessions, filter by tag/date/venue | VERIFIED | Conference and session list pages exist with `FilterBar` and `parseConferenceFilters`/`parseSessionFilters`; conference detail page renders sessions grouped by date |
| 2 | User can ask AI assistant questions and receive natural language responses | ? NEEDS HUMAN | `BuiltInAgent` + `MCPAppsMiddleware` wired in route.ts, panel sends via `useCopilotChatInternal`; runtime behavior unverifiable without live server |
| 3 | AI assistant generates dynamic tables via MCP Apps HTML templates | ? NEEDS HUMAN | `query_conferences` tool returns `_meta.ui.resourceUri='ui://table'`; `table.html` exists with full postMessage rendering; MCPAppsMiddleware wired to MCP server — runtime rendering unverifiable |
| 4 | AI assistant generates dynamic charts via Chart.js templates | ? NEEDS HUMAN | `chart.html` exists with Chart.js CDN, postMessage handler, supports bar/line/pie — runtime rendering unverifiable |
| 5 | User can interact with generated components (tables sortable, charts interactive) | ? NEEDS HUMAN | `table.html` implements click-to-sort; `chart.html` uses Chart.js with tooltips — requires live render to confirm |

**Score:** 1/5 truths fully verified programmatically; 4/5 have all automated prerequisites satisfied, needing human confirmation

### Additional Must-Haves from Plan 02-01

| Truth | Status | Evidence |
|-------|--------|---------|
| MCP server can be started and responds to HTTP requests | VERIFIED | `server.py` exists (186 lines), uses FastMCP with `stateless_http=True`, runs on port 3108 |
| MCP server exposes database query tools via SQLDatabaseToolkit | VERIFIED | `SQLDatabase.from_uri(DATABASE_URL)` on line 37; `SQLDatabaseToolkit` on line 43; `@mcp.tool()` `query_conferences` on line 56 |
| MCP server serves HTML templates for table and chart UIs | VERIFIED | `@mcp.resource("ui://table")` line 127 reads `table.html`; `@mcp.resource("ui://chart")` line 155 reads `chart.html` |
| Old generative-ui React components are deleted | VERIFIED | `generative-table.tsx`, `generative-chart.tsx`, `index.ts` confirmed absent from disk |
| Old hub_queries.py predefined tools are deleted | VERIFIED | `apps/agent/tools/hub_queries.py` confirmed absent from disk |

### Additional Must-Haves from Plan 02-02

| Truth | Status | Evidence |
|-------|--------|---------|
| User can ask AI questions and receive responses in the panel | ? NEEDS HUMAN | Infrastructure complete; runtime unverifiable |
| AI responses include generated tables rendered via MCP Apps | ? NEEDS HUMAN | All wiring in place; runtime unverifiable |
| AI responses include generated charts rendered via MCP Apps | ? NEEDS HUMAN | All wiring in place; runtime unverifiable |
| Panel shows context-aware suggestions | VERIFIED | `useContextSuggestions` hook returns pathname-matched suggestions (3 sets: conference detail, session detail, default); `suggestions.map()` renders them in panel |
| Panel state resets when closed | VERIFIED (code) | `handleClose` calls `reset()` then `setThreadId(uuidv4())` then `setInput("")` — behavior requires human confirmation |
| AI knows which conference/session user is viewing | VERIFIED (code) | `useCopilotReadable` passes `contextString` derived from `contextData`; `SetAIContext` component sets `AIContextProvider` state on conference/session detail pages; `ExploreShell` passes `context` to panel — runtime verification needed |

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `apps/mcp-server/server.py` | VERIFIED | 186 lines; `SQLDatabase.from_uri`, `SQLDatabaseToolkit`, `@mcp.tool`, `@mcp.resource("ui://table")`, `@mcp.resource("ui://chart")` all present |
| `apps/mcp-server/ui/table.html` | VERIFIED | 254 lines; full postMessage listener, renderTable, sortTable, empty state; self-contained |
| `apps/mcp-server/ui/chart.html` | VERIFIED | 238 lines; Chart.js CDN loaded, postMessage listener, renderChart for bar/line/pie; color palette matches hub theme |
| `apps/mcp-server/requirements.txt` | VERIFIED | Contains `mcp`, `langchain-community`, `langchain-openai`, `langchain-core`, `psycopg[binary]`, `python-dotenv` |
| `apps/web/app/api/copilotkit/route.ts` | VERIFIED | `MCPAppsMiddleware` imported and used; `BuiltInAgent` configured; `mcpServers` pointing to `http://localhost:3108/mcp`; committed to git |
| `apps/web/components/explore/research-assistant-panel.tsx` | VERIFIED | `useCopilotChatInternal` present; NO `useGenerativeComponents` import; sends messages with `sendMessage`; renders suggestions |
| `apps/web/package.json` | VERIFIED | `"@ag-ui/mcp-apps-middleware": "latest"` on line 12; package installed in node_modules |
| `apps/web/components/explore/ai-context.tsx` | VERIFIED | `AIContextProvider`, `useAIContext`, `useSetAIContext` with auto-clear on unmount |
| `apps/web/components/explore/set-ai-context.tsx` | VERIFIED | Client component using `useSetAIContext`; used in conference and session detail pages |
| `apps/web/components/explore/explore-shell.tsx` | VERIFIED | Wraps `AIContextProvider`, passes `context` to `ResearchAssistantPanel`, renders `ResearchAssistantTrigger` |
| `apps/agent/graphs/hub_agent.py` | VERIFIED | Simplified to stub as intended; 7 lines; no old imports |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `route.ts` | MCP server | `MCPAppsMiddleware mcpServers` | WIRED | `mcpServers: [{ type: "http", url: MCP_SERVER_URL \|\| "http://localhost:3108/mcp" }]` found on lines 27-34 |
| `route.ts` | CopilotKit | `BuiltInAgent` in `CopilotRuntime` | WIRED | `new CopilotRuntime({ agents: { default: agent } })` on lines 37-41 |
| `research-assistant-panel.tsx` | CopilotKit | `useCopilotChatInternal` | WIRED | Imported and called on line 74; `sendMessage` used on line 104 |
| `server.py` | PostgreSQL | `SQLDatabase.from_uri(DATABASE_URL)` | WIRED | Pattern found on line 37; raises `ValueError` if `DATABASE_URL` missing |
| `server.py` | `ui/table.html` | `@mcp.resource("ui://table")` | WIRED | Reads file via `get_ui_path("table.html")` on line 135; falls back to inline stub |
| `server.py` | `ui/chart.html` | `@mcp.resource("ui://chart")` | WIRED | Reads file via `get_ui_path("chart.html")` on line 163; falls back to inline stub |
| `ConferenceDetailPage` | `AIContextProvider` | `SetAIContext` component | WIRED | `<SetAIContext context={{ conferenceId: id, conferenceName: ... }} />` on lines 127-132 |
| `SessionDetailPage` | `AIContextProvider` | `SetAIContext` component | WIRED | `<SetAIContext context={{ sessionId: id, sessionTitle: ... }} />` on lines 23-28 |
| `ExploreShell` | `ResearchAssistantPanel` | `contextData={context}` prop | WIRED | `context` from `useAIContext()` passed as `contextData` on line 67 |
| `ResearchAssistantPanel` | CopilotKit readable | `useCopilotReadable` | WIRED | Called on lines 62-68 with `contextString` derived from `contextData` |

### Requirements Coverage

The PLAN files reference requirements GENUI-01 through GENUI-06 and RHUB-01 through RHUB-07. REQUIREMENTS.md was not checked directly (not in scope), but plan-level requirements mapping is complete:

| Plan | Requirements Claimed | Status |
|------|---------------------|--------|
| 02-01 | GENUI-01, GENUI-02, GENUI-03, GENUI-04 | Infrastructure delivered |
| 02-02 | RHUB-01 through RHUB-07, GENUI-05, GENUI-06 | Wiring delivered; runtime needs human verification |

Note: A third plan (02-03) was executed (commits `1d19f14` and `351e793`) covering GENUI-04 and GENUI-06 — page context wiring. Its planning docs (02-03-PLAN.md, 02-03-SUMMARY.md) are staged for deletion in the working tree (unstaged `D` in git status) but its code artifacts are committed and present. The ROADMAP lists only 2 plans (Plans Complete: 2/2), meaning 02-03 was absorbed into the phase without updating the ROADMAP plan count. The code from 02-03 is verified present.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `server.py` | 95 | `("placeholder", "{agent_scratchpad}")` | Info | This is a LangChain prompt template placeholder name — correct usage, not an anti-pattern |
| `hub_agent.py` | All | Stub file with `# Empty - MCP server handles all functionality` | Info | Intentional per plan (Option A). Not blocking — BuiltInAgent replaces LangGraph for this phase |
| `research-assistant-panel.tsx` | 219 | `(msg as any).generativeUI?.()` | Warning | Uses `any` cast with optional chaining to call hypothetical `generativeUI` function on message objects. This pattern may not match how MCPAppsMiddleware actually injects UI into messages. If MCPAppsMiddleware uses a different mechanism, this renders nothing without error. |

### Human Verification Required

#### 1. End-to-End AI Chat

**Test:** Start MCP server (`cd apps/mcp-server && python server.py`), start Next.js (`cd apps/web && npm run dev`), navigate to `http://localhost:3001/[locale]/explore`, open Research Assistant, ask "What conferences are available?"
**Expected:** Panel sends question; BuiltInAgent responds; response appears in message list
**Why human:** Requires live OpenAI API, MCP server, and CopilotKit runtime

#### 2. MCP Apps Table Rendering

**Test:** In the Research Assistant panel, ask "Show me a table of all venues"
**Expected:** `query_conferences` tool fires, returns `_meta.ui.resourceUri='ui://table'`; MCPAppsMiddleware fetches `ui://table` resource from MCP server; CopilotKit renders `table.html` in a sandboxed iframe inside the chat panel; table shows venue rows
**Why human:** Iframe injection by MCPAppsMiddleware cannot be verified without browser runtime

#### 3. MCP Apps Chart Rendering

**Test:** Ask "Create a bar chart showing session counts by year"
**Expected:** `chart.html` rendered in iframe; Chart.js bar chart displays session counts per year; chart responds to hover tooltips
**Why human:** Chart.js rendering requires browser canvas

#### 4. Context-Aware AI Responses

**Test:** Navigate to a conference detail page (e.g. `/explore/conferences/[id]`), open Research Assistant, ask "Tell me about this conference"
**Expected:** AI response references the specific conference name (e.g. "CVPR 2024") because `useCopilotReadable` injected "User is viewing conference: CVPR 2024" into the agent context
**Why human:** Requires live agent to confirm context injection in prompt

#### 5. Generative UI Rendering Mechanism Concern

**Test:** After receiving an AI response that should include a table, inspect the DOM in browser DevTools
**Expected:** The message with table data should render an iframe (from MCPAppsMiddleware), not rely on `(msg as any).generativeUI?.()`
**Why human:** The `generativeUI` cast in `research-assistant-panel.tsx` line 219 is suspicious. MCPAppsMiddleware likely injects UI through CopilotKit's own rendering pipeline rather than adding a `.generativeUI` property to message objects. Manual inspection needed to confirm tables/charts actually appear.

#### 6. Panel State Reset

**Test:** Send a message in the panel, close it (click X or backdrop), reopen it
**Expected:** Message list is empty; new thread ID generated; previous conversation not shown
**Why human:** React state lifecycle requires live interaction

### Gaps Summary

All automated checks pass. The MCP server infrastructure (Plan 02-01) is fully substantive and wired. The CopilotKit integration (Plan 02-02) has all imports, instantiations, and key links correctly wired. The context awareness system (Plan 02-03, absorbed without ROADMAP update) is fully wired with `AIContextProvider`, `SetAIContext`, and `useSetAIContext`.

One potential implementation concern: `research-assistant-panel.tsx` line 219 uses `(msg as any).generativeUI?.()` to attempt to render generative UI. This pattern suggests the original developer expected MCPAppsMiddleware to attach a `.generativeUI` callable to CopilotKit message objects. If MCPAppsMiddleware uses a different rendering mechanism (e.g., a separate hook, a wrapper component, or a message type), this code silently renders nothing for tables and charts. This must be verified during human testing — if tables/charts do not appear in the panel, this is the likely root cause.

No missing artifacts. No stub implementations in critical path files. No missing wiring for any key link.

---

_Verified: 2026-03-12_
_Verifier: Claude (gsd-verifier)_
