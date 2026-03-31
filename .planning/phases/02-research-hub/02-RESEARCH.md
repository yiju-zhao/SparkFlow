# Phase 2: Research Hub - Research

**Researched:** 2026-03-11
**Domain:** MCP Apps Architecture, LangChain SQLDatabaseToolkit, CopilotKit Integration
**Confidence:** HIGH

## Summary

This phase implements an AI-powered conference discovery experience using the **MCP Apps architecture** - a paradigm shift from React components with useComponent hooks to HTML templates served by a Python MCP server and rendered in sandboxed iframes by CopilotKit.

**Key architecture changes:**
1. **MCP Server replaces predefined tools** - A Python MCP server using LangChain SQLDatabaseToolkit provides dynamic SQL query generation instead of hardcoded `list_venues`, `search_sessions` tools
2. **HTML templates replace React components** - GenerativeTable and GenerativeChart React components are deleted; HTML templates with Chart.js are served via `ui://` resources
3. **MCPAppsMiddleware replaces CopilotKit hooks** - The `@ag-ui/mcp-apps-middleware` package handles UI rendering, synchronization via AG-UI protocol

**Primary recommendation:** Follow the MCP Apps pattern strictly - tools return structured data + `ui://` references, HTML templates declare Chart.js visualizations, CopilotKit's MCPAppsMiddleware handles rendering and state synchronization.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Architecture**: Create a Python MCP server that handles database queries and serves UI templates
- **Database access**: Use LangChain SQLDatabaseToolkit for dynamic query generation with full database access
- **Tool approach**: Replace predefined tools (list_venues, search_sessions) with dynamic SQL query generation
- **Query scope**: Agent can query any table with automatic schema discovery
- **Server type**: HTTP MCP server (not SSE) for simplicity
- **UI mechanism**: MCP Apps HTML templates served by MCP server, rendered in sandboxed iframe by CopilotKit
- **UI resources**: Declare `ui://table` and `ui://chart` resources in MCP server
- **Tool responses**: Tools return structured data + `ui://` reference (not just text)
- **Chart types**: Bar, line, and pie charts (as per GENUI-02/03 requirements)
- **Remove existing**: Delete `useComponent` hooks and React GenerativeTable/GenerativeChart components
- **Middleware**: Use `@ag-ui/mcp-apps-middleware` package
- **Runtime**: Configure MCPAppsMiddleware in CopilotKit API route
- **Agent**: Use `BuiltInAgent` with MCP middleware (or connect existing LangGraph agent via MCP bridge)
- **Sync protocol**: AG-UI protocol keeps agent ↔ UI ↔ app synchronized automatically
- **Entry point**: Floating panel with trigger button (bottom-right). Opens a slide-over panel for AI chat.
- **Context awareness**: AI knows which conference/session the user is viewing. Can answer "Tell me about this conference" contextually.
- **Suggestions**: Context-aware suggestions that update based on current page (not static).
- **State management**: Reset on panel close. No persistence across browser sessions.
- **AI behavior**: On-demand only. No proactive engagement, greetings, or inline insights. User initiates all interactions.
- **Landing layout**: Keep existing layout (stats, year/topic charts, recent conferences). Just add AI panel availability.
- **Navigation**: Keep existing nav structure (Conferences, Sessions, Publications, Toolbox).
- **Availability**: AI panel available on ALL pages including detail pages. Consistent floating trigger everywhere.
- **Filtering approach**: Manual filters only. AI does NOT apply filters to the FilterBar. Clear separation of concerns.
- **Search**: Keyword search + AI natural language search coexist. Both available for different use cases.
- **Filter UX**: Keep existing FilterBar component unchanged. AI can answer questions about filtered data but doesn't change filter state.

### Claude's Discretion
- Exact HTML/CSS styling of MCP App templates
- Animation/transition details for panel open/close
- Error states for failed AI queries
- Empty state for generated components with no data

### Deferred Ideas (OUT OF SCOPE)
- AI-driven filter application — keeping manual filters only for simplicity
- Conversation persistence across sessions — resets on close for v1
- Proactive AI suggestions/greetings — on-demand only for v1
- Additional chart types (scatter, area, radar) — bar/line/pie sufficient for v1
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RHUB-01 | User can view list of all conferences with basic stats | SQLDatabaseToolkit queries `venues` + `instances` tables |
| RHUB-02 | User can browse sessions within a conference | SQLDatabaseToolkit queries `conference_sessions` table |
| RHUB-03 | User can view session detail page | Existing page structure, AI context via `SetAIContext` |
| RHUB-04 | User can filter sessions by topic tag | FilterBar component unchanged, AI answers questions about filtered data |
| RHUB-05 | User can filter sessions by date | FilterBar component unchanged |
| RHUB-06 | User can filter sessions by speaker name | FilterBar component unchanged |
| RHUB-07 | User can search sessions by keyword | Keyword search + AI natural language search coexist |
| GENUI-01 | User can ask AI assistant questions about the hub content | BuiltInAgent with MCP middleware, context-aware via AIContextProvider |
| GENUI-02 | AI assistant can generate dynamic tables from query results | MCP App `ui://table` resource with HTML template |
| GENUI-03 | AI assistant can generate dynamic charts (bar, line, pie) | MCP App `ui://chart` resource with Chart.js HTML template |
| GENUI-04 | AI assistant can generate filtered views based on user constraints | SQLDatabaseToolkit generates WHERE clauses dynamically |
| GENUI-05 | Generated UI components render in assistant panel | MCPAppsMiddleware renders in CopilotKit chat panel |
| GENUI-06 | User can interact with generated components | Chart.js interactivity, HTML table sorting/filtering |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `mcp` (Python SDK) | 1.12.4+ | MCP server implementation | Official Python SDK with FastMCP decorator API |
| `langchain-community` | latest | SQLDatabaseToolkit | Dynamic SQL query generation from natural language |
| `@ag-ui/mcp-apps-middleware` | latest | CopilotKit MCP Apps integration | Official CopilotKit middleware for MCP Apps |
| `@copilotkit/runtime` | 1.52.1+ | CopilotKit backend runtime | Already installed, adds MCPAppsMiddleware |
| Chart.js | 3.9.1+ | Charting library for HTML templates | CDN-loadable, supports bar/line/pie |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `psycopg[binary]` | installed | PostgreSQL driver for LangChain | SQLDatabaseToolkit database connection |
| `langchain-openai` | installed | ChatOpenAI LLM | SQLDatabaseToolkit requires LLM for query validation |
| `copilotkit` | installed | CopilotKitState for LangGraph agent | Optional: BuiltInAgent alternative |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SQLDatabaseToolkit | Predefined tools | Toolkit provides dynamic queries, better for ad-hoc user questions |
| FastMCP | FastAPI-MCP wrapper | FastMCP is official SDK, more control over resources |
| BuiltInAgent | LangGraphAgent via MCP bridge | BuiltInAgent is simpler for MCP Apps; LangGraphAgent requires server setup |

**Installation:**
```bash
# Python MCP server
pip install mcp langchain-community langchain-openai

# Frontend middleware
npm install @ag-ui/mcp-apps-middleware
```

## Architecture Patterns

### Recommended Project Structure
```
apps/
├── mcp-server/                    # NEW: Python MCP server package
│   ├── server.py                  # FastMCP server with SQLDatabaseToolkit
│   ├── ui/
│   │   ├── table.html            # HTML template for generative tables
│   │   └── chart.html            # HTML template for Chart.js charts
│   └── requirements.txt           # mcp, langchain-community, langchain-openai
├── agent/
│   ├── graphs/
│   │   └── hub_agent.py          # MODIFY: Connect to MCP server (or use BuiltInAgent)
│   └── tools/
│       └── hub_queries.py        # DELETE: Replace with SQLDatabaseToolkit
├── web/
│   ├── app/api/copilotkit/
│   │   └── route.ts              # MODIFY: Add MCPAppsMiddleware
│   └── components/explore/
│       └── generative-ui/
│           ├── generative-table.tsx    # DELETE
│           ├── generative-chart.tsx    # DELETE
│           └── index.ts                # DELETE (useComponent hooks)
```

### Pattern 1: MCP Server with SQLDatabaseToolkit
**What:** Python MCP server exposes database queries via LangChain's SQLDatabaseToolkit, allowing natural language to SQL translation with automatic schema discovery.

**When to use:** When the agent needs flexible, ad-hoc database queries without predefined tools.

**Example:**
```python
# apps/mcp-server/server.py
from mcp.server.fastmcp import FastMCP
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase
from langchain_openai import ChatOpenAI

mcp = FastMCP("HubMCPServer", stateless_http=True, json_response=True)

# Initialize SQLDatabaseToolkit
db = SQLDatabase.from_uri(os.getenv("DATABASE_URL"))
llm = ChatOpenAI(model="gpt-4o", temperature=0)
toolkit = SQLDatabaseToolkit(db=db, llm=llm)

# Tools are automatically created: sql_db_query, sql_db_schema, sql_db_list_tables, etc.
tools = toolkit.get_tools()

# Expose as MCP tools (wrapping toolkit tools)
@mcp.tool()
def query_database(question: str) -> str:
    """Query the conference database with natural language."""
    # LangChain agent internally uses toolkit tools
    # Returns structured data for MCP Apps
    pass

if __name__ == "__main__":
    mcp.run(transport="streamable-http", port=3108)
```

**Source:** https://docs.langchain.com/oss/python/langchain/sql-agent

### Pattern 2: MCP Apps UI Resources
**What:** Declare `ui://` resources in MCP server that return HTML templates. Tools reference these resources via `_meta.ui.resourceUri`.

**When to use:** When tools need to render interactive UI components.

**Example:**
```python
# apps/mcp-server/server.py
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("HubMCPServer")

# Register UI resource
@mcp.resource("ui://table")
def get_table_template() -> str:
    """HTML template for generative tables."""
    return """
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px; border: 1px solid #ddd; }
        </style>
    </head>
    <body>
        <div id="data"></div>
        <script>
            // Receive data from MCP tool via postMessage
            window.addEventListener('message', (event) => {
                const { columns, rows } = event.data;
                // Render table...
            });
        </script>
    </body>
    </html>
    """

# Tool returns structured data + UI reference
@mcp.tool()
def show_conferences() -> dict:
    """List conferences with table UI."""
    conferences = query_database("list all conferences")
    return {
        "content": [{"type": "text", "text": json.dumps(conferences)}],
        "structuredContent": conferences,
        "_meta": {"ui": {"resourceUri": "ui://table"}}
    }
```

**Source:** https://github.com/modelcontextprotocol/ext-apps

### Pattern 3: CopilotKit MCPAppsMiddleware
**What:** Configure CopilotKit runtime with MCPAppsMiddleware to automatically fetch and render MCP App UIs when tools return `ui://` references.

**When to use:** Always - this is the bridge between CopilotKit and MCP Apps.

**Example:**
```typescript
// apps/web/app/api/copilotkit/route.ts
import { CopilotRuntime, ExperimentalEmptyAdapter, copilotRuntimeNextJSAppRouterEndpoint } from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { MCPAppsMiddleware } from "@ag-ui/mcp-apps-middleware";

const agent = new BuiltInAgent({
  model: "openai/gpt-4o",
  prompt: "You are a helpful conference research assistant.",
}).use(
  new MCPAppsMiddleware({
    mcpServers: [
      {
        type: "http",
        url: "http://localhost:3108/mcp",
        serverId: "hub-mcp-server"  // Stable identifier
      }
    ]
  })
);

const runtime = new CopilotRuntime({
  agents: { default: agent }
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/copilotkit"
  });
  return handleRequest(req);
};
```

**Source:** https://docs.copilotkit.ai/langgraph/generative-ui/mcp-apps

### Pattern 4: Chart.js HTML Template
**What:** HTML template with Chart.js CDN that receives data from MCP tool and renders interactive charts.

**When to use:** When generating bar, line, or pie charts (GENUI-03).

**Example:**
```html
<!-- apps/mcp-server/ui/chart.html -->
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: system-ui; padding: 16px; }
        canvas { max-width: 100%; }
    </style>
</head>
<body>
    <div style="width: 600px;">
        <canvas id="chart"></canvas>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
        window.addEventListener('message', (event) => {
            const { type, data, labels, title } = event.data;
            
            new Chart(document.getElementById('chart'), {
                type: type || 'bar',  // 'bar', 'line', or 'pie'
                data: {
                    labels: labels,
                    datasets: [{
                        label: title,
                        data: data,
                        backgroundColor: [
                            'rgba(54, 162, 235, 0.5)',
                            'rgba(255, 99, 132, 0.5)',
                            'rgba(255, 206, 86, 0.5)'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    scales: type === 'pie' ? {} : {
                        y: { beginAtZero: true }
                    }
                }
            });
        });
    </script>
</body>
</html>
```

**Source:** https://www.chartjs.org/docs/latest/getting-started/

### Anti-Patterns to Avoid
- **Predefined tools with SQLDatabaseToolkit:** Don't create `list_venues`, `search_sessions` tools - let the toolkit generate queries dynamically
- **React components for generative UI:** Delete GenerativeTable/GenerativeChart - use HTML templates instead
- **useComponent hooks:** Delete CopilotKit useComponent hooks - MCP Apps middleware handles rendering
- **SSE transport:** Use HTTP transport (`streamable-http`) for simplicity per user decision
- **Applying filters from AI:** AI answers questions but does NOT modify FilterBar state

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SQL query generation | Custom SQL builder | SQLDatabaseToolkit | Handles schema discovery, query validation, error correction |
| UI state synchronization | Manual postMessage wiring | AG-UI protocol via MCPAppsMiddleware | Handles tool lifecycle, state deltas, event streaming |
| Chart rendering | Custom SVG/Canvas | Chart.js | Battle-tested, accessible, responsive |
| MCP server setup | Raw JSON-RPC | FastMCP SDK | Decorator API, HTTP transport, resource management |

**Key insight:** MCP Apps architecture eliminates the need for custom React components, state management, and communication wiring. The middleware handles everything from tool execution to UI rendering to state synchronization.

## Common Pitfalls

### Pitfall 1: Mixing Old and New Architecture
**What goes wrong:** Keeping useComponent hooks alongside MCPAppsMiddleware causes rendering conflicts
**Why it happens:** Incomplete migration from Phase 1's useComponent pattern
**How to avoid:** Delete ALL generative-ui components and useComponent hooks before implementing MCP Apps
**Warning signs:** React components render instead of HTML templates, state synchronization fails

### Pitfall 2: Incorrect MCP Server URL
**What goes wrong:** MCPAppsMiddleware can't connect to MCP server, tools fail silently
**Why it happens:** Wrong port, missing `/mcp` path, or SSE vs HTTP confusion
**How to avoid:** Use exact URL: `http://localhost:3108/mcp` (FastMCP mounts at `/mcp` by default)
**Warning signs:** Network errors in console, tools return "connection refused"

### Pitfall 3: Missing serverId in MCPAppsMiddleware
**What goes wrong:** Conversation history lost when server URL changes (local → staging → prod)
**Why it happens:** serverId not specified, CopilotKit uses URL as identifier
**How to avoid:** Always specify stable `serverId: "hub-mcp-server"`
**Warning signs:** AI forgets context after environment changes

### Pitfall 4: SQLDatabaseToolkit Without LLM
**What goes wrong:** Toolkit fails with "LLM required" error
**Why it happens:** SQLDatabaseToolkit needs LLM for QuerySQLCheckerTool
**How to avoid:** Always pass `llm` parameter: `SQLDatabaseToolkit(db=db, llm=llm)`
**Warning signs:** Import error or runtime exception on toolkit creation

### Pitfall 5: HTML Template Not Receiving Data
**What goes wrong:** Chart.js or table renders empty, no data displayed
**Why it happens:** Tool returns text content without `structuredContent` field
**How to avoid:** Return both `content` (text fallback) and `structuredContent` (for UI):
```python
return {
    "content": [{"type": "text", "text": json.dumps(data)}],
    "structuredContent": data,  # This is what UI receives
    "_meta": {"ui": {"resourceUri": "ui://chart"}}
}
```
**Warning signs:** Empty charts, "undefined" errors in template console

### Pitfall 6: DATABASE_URL Not Set in MCP Server
**What goes wrong:** SQLDatabaseToolkit can't connect to database
**Why it happens:** MCP server runs in separate process, doesn't inherit agent's environment
**How to avoid:** Ensure `DATABASE_URL` is set in MCP server's environment (`.env` or export)
**Warning signs:** Connection errors, "database url not set" exceptions

## Code Examples

### MCP Server with SQLDatabaseToolkit (Complete)
```python
# apps/mcp-server/server.py
import os
import json
from mcp.server.fastmcp import FastMCP
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase
from langchain_openai import ChatOpenAI

mcp = FastMCP("HubMCPServer", stateless_http=True, json_response=True)

# Initialize database toolkit
db = SQLDatabase.from_uri(os.getenv("DATABASE_URL"))
llm = ChatOpenAI(model="gpt-4o", temperature=0)
toolkit = SQLDatabaseToolkit(db=db, llm=llm)

# Get toolkit tools for internal use
tools = toolkit.get_tools()
# Available: sql_db_query, sql_db_schema, sql_db_list_tables, sql_db_query_checker

@mcp.tool()
def query_conferences(question: str) -> dict:
    """Query conference database with natural language.
    
    Examples:
    - "List all CVPR conferences"
    - "Show sessions about transformers at NeurIPS 2024"
    - "Count publications by topic"
    """
    from langchain.agents import AgentExecutor, create_tool_calling_agent
    from langchain_core.prompts import ChatPromptTemplate
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a SQL expert. Use tools to answer questions about conferences."),
        ("human", "{question}"),
        ("placeholder", "{agent_scratchpad}")
    ])
    
    agent = create_tool_calling_agent(llm, tools, prompt)
    executor = AgentExecutor(agent=agent, tools=tools, verbose=True)
    
    result = executor.invoke({"question": question})
    data = result.get("output", {})
    
    return {
        "content": [{"type": "text", "text": json.dumps(data)}],
        "structuredContent": data,
        "_meta": {"ui": {"resourceUri": "ui://table"}}
    }

# Register UI resources
@mcp.resource("ui://table")
def table_template() -> str:
    """Generative table UI."""
    return open("ui/table.html").read()

@mcp.resource("ui://chart")
def chart_template() -> str:
    """Generative chart UI."""
    return open("ui/chart.html").read()

if __name__ == "__main__":
    mcp.run(transport="streamable-http", port=3108)
```

### CopilotKit Route with MCPAppsMiddleware (Complete)
```typescript
// apps/web/app/api/copilotkit/route.ts
import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { MCPAppsMiddleware } from "@ag-ui/mcp-apps-middleware";
import { NextRequest } from "next/server";

const agent = new BuiltInAgent({
  model: "openai/gpt-4o",
  prompt: `You are a conference research assistant with access to a database of academic conferences, sessions, and publications.

You can:
- Query conferences, sessions, and publications
- Generate tables to display data
- Create charts (bar, line, pie) to visualize trends
- Answer questions about specific conferences or sessions

Always provide helpful, accurate information about academic conferences.`,
}).use(
  new MCPAppsMiddleware({
    mcpServers: [
      {
        type: "http",
        url: process.env.MCP_SERVER_URL || "http://localhost:3108/mcp",
        serverId: "hub-mcp-server"
      }
    ]
  })
);

const runtime = new CopilotRuntime({
  agents: {
    default: agent
  }
});

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter: new ExperimentalEmptyAdapter(),
    endpoint: "/api/copilotkit"
  });
  return handleRequest(req);
};
```

### Chart.js Template for MCP Apps
```html
<!-- apps/mcp-server/ui/chart.html -->
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 16px;
            background: var(--background, #fff);
        }
        .chart-container { 
            width: 100%; 
            max-width: 600px;
            margin: 0 auto;
        }
        h3 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--foreground, #000);
        }
    </style>
</head>
<body>
    <div class="chart-container">
        <h3 id="title"></h3>
        <canvas id="chart"></canvas>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
    <script>
        // Receive structured data from MCP tool
        window.addEventListener('message', (event) => {
            const { type, data, labels, title, colors } = event.data;
            
            document.getElementById('title').textContent = title || 'Chart';
            
            const ctx = document.getElementById('chart').getContext('2d');
            
            new Chart(ctx, {
                type: type || 'bar',
                data: {
                    labels: labels || [],
                    datasets: [{
                        label: title,
                        data: data || [],
                        backgroundColor: colors || [
                            'rgba(54, 162, 235, 0.7)',
                            'rgba(255, 99, 132, 0.7)',
                            'rgba(255, 206, 86, 0.7)',
                            'rgba(75, 192, 192, 0.7)',
                            'rgba(153, 102, 255, 0.7)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            display: type === 'pie'
                        }
                    },
                    scales: type === 'pie' ? {} : {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            }
                        }
                    }
                }
            });
        });
    </script>
</body>
</html>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Predefined tools (`list_venues`, `search_sessions`) | SQLDatabaseToolkit dynamic queries | 2026-03-11 | Agent handles any query, not just predefined ones |
| React GenerativeTable/GenerativeChart components | HTML templates via MCP Apps | 2026-03-11 | No React component maintenance, simpler architecture |
| useComponent hooks | MCPAppsMiddleware | 2026-03-11 | Automatic UI synchronization via AG-UI protocol |
| Custom state management | AG-UI protocol | 2026-03-11 | Built-in tool lifecycle, state deltas, event streaming |

**Deprecated/outdated:**
- `apps/agent/tools/hub_queries.py`: Predefined tools replaced by SQLDatabaseToolkit
- `apps/web/components/explore/generative-ui/`: React components replaced by HTML templates
- `copilotkit.actions` / `useComponent`: Replaced by MCP Apps middleware

## Open Questions

1. **SQLDatabaseToolkit vs Custom Tools for Common Queries**
   - What we know: SQLDatabaseToolkit handles ad-hoc queries well
   - What's unclear: Should we keep `list_venues` as a simple tool for performance?
   - Recommendation: Start with pure SQLDatabaseToolkit; add caching if needed

2. **BuiltInAgent vs LangGraphAgent MCP Bridge**
   - What we know: BuiltInAgent is simpler, LangGraphAgent requires server setup
   - What's unclear: Does BuiltInAgent support all needed features?
   - Recommendation: Use BuiltInAgent for Phase 2; migrate to LangGraphAgent in Phase 3 if needed

3. **HTML Template Styling Consistency**
   - What we know: Templates need to match existing app design
   - What's unclear: How to share CSS variables between Next.js and HTML templates
   - Recommendation: Use inline styles with CSS custom properties passed via `postMessage`

## Validation Architecture

> Configuration: `workflow.nyquist_validation` is `true` in `.planning/config.json`

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None detected — Wave 0 setup required |
| Config file | None — create `vitest.config.ts` or `pytest.ini` |
| Quick run command | TBD after framework setup |
| Full suite command | TBD after framework setup |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RHUB-01 | View conference list with stats | integration | TBD | ❌ Wave 0 |
| RHUB-02 | Browse sessions within conference | integration | TBD | ❌ Wave 0 |
| RHUB-03 | View session detail page | e2e | TBD | ❌ Wave 0 |
| RHUB-04 | Filter sessions by topic | unit | TBD | ❌ Wave 0 |
| RHUB-05 | Filter sessions by date | unit | TBD | ❌ Wave 0 |
| RHUB-06 | Filter sessions by speaker | unit | TBD | ❌ Wave 0 |
| RHUB-07 | Search sessions by keyword | unit | TBD | ❌ Wave 0 |
| GENUI-01 | Ask AI questions about hub | integration | TBD | ❌ Wave 0 |
| GENUI-02 | Generate dynamic tables | integration | TBD | ❌ Wave 0 |
| GENUI-03 | Generate dynamic charts | integration | TBD | ❌ Wave 0 |
| GENUI-04 | Generate filtered views | integration | TBD | ❌ Wave 0 |
| GENUI-05 | Components render in assistant panel | e2e | TBD | ❌ Wave 0 |
| GENUI-06 | Interact with generated components | e2e | TBD | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** TBD after test framework setup
- **Per wave merge:** TBD after test framework setup
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` — Frontend test framework configuration
- [ ] `pytest.ini` — Python MCP server test configuration
- [ ] `apps/web/__tests__/` — Frontend test directory
- [ ] `apps/mcp-server/tests/` — MCP server test directory
- [ ] Framework install: `npm install -D vitest @testing-library/react` (frontend)
- [ ] Framework install: `pip install pytest pytest-asyncio` (Python)

**Note:** No test infrastructure exists. Wave 0 must establish testing foundation before implementation begins.

## Sources

### Primary (HIGH confidence)
- /copilotkit/copilotkit - MCP Apps middleware configuration, BuiltInAgent setup
- /modelcontextprotocol/python-sdk - FastMCP server implementation, HTTP transport
- /modelcontextprotocol/ext-apps - MCP Apps spec, ui:// resources, structuredContent pattern
- /websites/langchain - SQLDatabaseToolkit usage, agent executor patterns
- /chartjs/chart.js - Chart.js HTML template patterns, CDN usage

### Secondary (MEDIUM confidence)
- https://www.copilotkit.ai/blog/bring-mcp-apps-into-your-own-app-with-copilotkit-and-ag-ui - Architecture overview, AG-UI protocol explanation

### Tertiary (LOW confidence)
- None - all core patterns verified with Context7 or official docs

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries verified via Context7 with official docs
- Architecture: HIGH - MCP Apps pattern documented in official CopilotKit docs and MCP spec
- Pitfalls: HIGH - Based on official documentation patterns and common integration issues

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (1 month - stable architecture, but MCP Apps is evolving)
