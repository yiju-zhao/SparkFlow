# Search Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace keyword-matching search (ILIKE) with an iterative LangGraph search agent that uses LLM intelligence and notebook wiki context to find semantically relevant results.

**Architecture:** A new `search` LangGraph graph with tool-calling loop (max 3 iterations). The Next.js API extracts wiki context from NotebookGraph, passes it to the agent. The agent generates smart keywords, calls source-specific search tools, evaluates results, and refines. Database queries upgraded from ILIKE to PostgreSQL full-text search (tsvector/tsquery).

**Tech Stack:** LangGraph, LangChain, Python 3.11+, PostgreSQL full-text search, httpx, tavily-python, Next.js API routes, Prisma raw queries

---

## File Structure

### New Files (Python — apps/agent/)
| File | Responsibility |
|------|---------------|
| `graphs/search_agent.py` | Search agent LangGraph graph (state, nodes, edges, iteration control) |
| `tools/search_tools.py` | Three search tools: web (Tavily), publications (API), wechat (API) |
| `config/search_agent.py` | SearchAgentContext dataclass for runtime config |
| `prompts/search_agent.py` | System prompt template for the search agent |

### New Files (TypeScript — apps/web/)
| File | Responsibility |
|------|---------------|
| `app/api/explore/search/publications/route.ts` | Full-text publication search endpoint |
| `app/api/explore/search/wechat/route.ts` | Full-text WeChat article search endpoint |
| `lib/services/wiki-context.ts` | Extract lightweight wiki context from NotebookGraph |

### Modified Files
| File | Change |
|------|--------|
| `apps/agent/langgraph.json` | Add `"search"` graph entry |
| `apps/web/app/api/notebooks/[id]/sources/search/route.ts` | Call search agent for all 3 source types |

---

### Task 1: PostgreSQL Full-Text Search — Publication Endpoint

**Files:**
- Create: `apps/web/app/api/explore/search/publications/route.ts`

- [ ] **Step 1: Create the full-text publication search endpoint**

```typescript
// apps/web/app/api/explore/search/publications/route.ts
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { query, limit = 20 } = (await req.json()) as {
    query: string;
    limit?: number;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // Use plainto_tsquery for safe, automatic tokenization of user input.
  // Falls back to ILIKE if tsquery produces no matches (handles cases where
  // tsvector column doesn't exist yet or query has no lexemes).
  const results = await prisma.$queryRaw`
    SELECT
      p.id,
      p.title,
      LEFT(p.abstract, 300) AS abstract,
      p.authors,
      p."pdfUrl",
      v.name AS venue,
      i.year,
      ts_rank(
        setweight(to_tsvector('english', coalesce(p.title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(p.abstract, '')), 'B'),
        plainto_tsquery('english', ${query})
      ) AS rank
    FROM "Publication" p
    LEFT JOIN "Instance" i ON p."instanceId" = i.id
    LEFT JOIN "Venue" v ON i."venueId" = v.id
    WHERE (
      to_tsvector('english', coalesce(p.title, '')) ||
      to_tsvector('english', coalesce(p.abstract, ''))
    ) @@ plainto_tsquery('english', ${query})
    ORDER BY rank DESC
    LIMIT ${limit}
  `;

  return NextResponse.json(results);
}
```

- [ ] **Step 2: Verify the endpoint works**

Run: `curl -X POST http://localhost:3001/api/explore/search/publications -H 'Content-Type: application/json' -d '{"query": "attention mechanism transformer"}'`

Expected: JSON array of publications ranked by relevance. If the publication table is empty, an empty array `[]`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/explore/search/publications/route.ts
git commit -m "feat(search): add full-text publication search endpoint"
```

---

### Task 2: PostgreSQL Full-Text Search — WeChat Endpoint

**Files:**
- Create: `apps/web/app/api/explore/search/wechat/route.ts`

- [ ] **Step 1: Create the full-text WeChat article search endpoint**

```typescript
// apps/web/app/api/explore/search/wechat/route.ts
import { NextRequest, NextResponse } from "next/server";
import { wechatPool } from "@/lib/wechat-db";

export async function POST(req: NextRequest) {
  if (!wechatPool) {
    return NextResponse.json(
      { error: "WeChat database not configured" },
      { status: 503 },
    );
  }

  const { query, limit = 20 } = (await req.json()) as {
    query: string;
    limit?: number;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // 'simple' config: tokenizes on whitespace, works for Chinese + English mixed content.
  // No language-specific stemming, but handles CJK reasonably.
  const result = await wechatPool.query(
    `SELECT
      a.id,
      a.title,
      LEFT(a.content_text, 300) AS content_text,
      a.author,
      a.publish_time,
      a.original_url,
      s.name AS source_name,
      ts_rank(
        setweight(to_tsvector('simple', coalesce(a.title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(a.content_text, '')), 'B'),
        plainto_tsquery('simple', $1)
      ) AS rank
    FROM wechat_articles.articles a
    JOIN wechat_articles.sources s ON a.source_id = s.id
    WHERE (
      to_tsvector('simple', coalesce(a.title, '')) ||
      to_tsvector('simple', coalesce(a.content_text, ''))
    ) @@ plainto_tsquery('simple', $1)
    ORDER BY rank DESC
    LIMIT $2`,
    [query, limit],
  );

  return NextResponse.json(result.rows);
}
```

- [ ] **Step 2: Verify the endpoint works**

Run: `curl -X POST http://localhost:3001/api/explore/search/wechat -H 'Content-Type: application/json' -d '{"query": "大模型"}'`

Expected: JSON array of WeChat articles ranked by relevance, or empty array.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/explore/search/wechat/route.ts
git commit -m "feat(search): add full-text WeChat article search endpoint"
```

---

### Task 3: Wiki Context Extraction Utility

**Files:**
- Create: `apps/web/lib/services/wiki-context.ts`

- [ ] **Step 1: Create the wiki context extraction function**

This extracts the top entities and relationships from a notebook's knowledge graph, formatted as a compact string the search agent can use for domain awareness.

```typescript
// apps/web/lib/services/wiki-context.ts
import prisma from "@/lib/prisma";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  summary: string;
  sourceRefs: string[];
  community?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  weight: number;
  sourceRef: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Extract a lightweight wiki context string for the search agent.
 * Returns top entities by connectivity + top relationships.
 * Target: ~500 tokens max.
 */
export async function getWikiContextForSearch(
  notebookId: string,
): Promise<string> {
  const graph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  if (!graph?.graphData) return "";

  const data = graph.graphData as unknown as GraphData;
  if (!data.nodes?.length) return "";

  // Count edges per node to find most connected (central) entities
  const edgeCount = new Map<string, number>();
  for (const node of data.nodes) {
    edgeCount.set(node.id, 0);
  }
  for (const edge of data.edges) {
    edgeCount.set(edge.source, (edgeCount.get(edge.source) || 0) + 1);
    edgeCount.set(edge.target, (edgeCount.get(edge.target) || 0) + 1);
  }

  // Top 10 entities by edge count
  const topNodes = [...data.nodes]
    .sort((a, b) => (edgeCount.get(b.id) || 0) - (edgeCount.get(a.id) || 0))
    .slice(0, 10);

  const topNodeIds = new Set(topNodes.map((n) => n.id));

  // Top 10 relationships between top entities (by weight)
  const topEdges = data.edges
    .filter((e) => topNodeIds.has(e.source) && topNodeIds.has(e.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  const parts: string[] = [];

  const topicsList = topNodes
    .map((n) => `${n.label} (${n.type})`)
    .join(", ");
  parts.push(`Topics: ${topicsList}`);

  if (topEdges.length > 0) {
    const nodeLabel = new Map(data.nodes.map((n) => [n.id, n.label]));
    const relsList = topEdges
      .map(
        (e) =>
          `${nodeLabel.get(e.source)} → ${e.relation} → ${nodeLabel.get(e.target)}`,
      )
      .join("; ");
    parts.push(`Relationships: ${relsList}`);
  }

  return parts.join("\n");
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit lib/services/wiki-context.ts 2>&1 | head -20`

If there are import resolution issues with `npx tsc` on a single file, just verify the dev server doesn't crash:

Run: `curl -s http://localhost:3001 > /dev/null && echo "OK" || echo "Server not running — skip manual check"`

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/services/wiki-context.ts
git commit -m "feat(search): add wiki context extraction for search agent"
```

---

### Task 4: Search Agent — Config and Prompt (Python)

**Files:**
- Create: `apps/agent/config/search_agent.py`
- Create: `apps/agent/prompts/search_agent.py`

- [ ] **Step 1: Create the search agent context dataclass**

Follow the same pattern as `config/rag_agent.py` and `config/hub_agent.py`.

```python
# apps/agent/config/search_agent.py
"""Search agent configuration."""

import os
from dataclasses import dataclass, field


@dataclass
class SearchAgentContext:
    """Runtime context for the search agent."""

    model_provider: str = os.getenv("DEFAULT_MODEL_PROVIDER", "openai")
    model_name: str = os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")
    source_type: str = "web"  # "web" | "publication" | "wechat"
    domains: list[str] = field(default_factory=list)
    wiki_context: str = ""
```

- [ ] **Step 2: Create the search agent system prompt**

```python
# apps/agent/prompts/search_agent.py
"""System prompt for the search agent."""

SEARCH_AGENT_SYSTEM_PROMPT = """You are a search agent. Your job is to find the most relevant {source_type} results for the user's query.

{wiki_section}

INSTRUCTIONS:
1. Analyze the query to understand the user's intent. Consider synonyms, related terms, and the research domain.
2. Call the search tool with well-chosen keywords. Do NOT just repeat the user's query verbatim — reformulate it to maximize relevant hits.
3. Evaluate the results: are they relevant to the query? Are there enough good results?
4. If results are insufficient or too generic, try a different angle:
   - Use synonyms or related technical terms
   - Narrow down with domain-specific keywords
   - Try a broader or more specific query
   - DO NOT repeat the same keywords you already tried
5. After at most 3 search calls, or when you have enough relevant results, return your final answer.

FINAL OUTPUT FORMAT:
When you are done searching, respond with ONLY a JSON array (no markdown, no explanation). Each item:
{{"id": "...", "title": "...", "snippet": "...", "meta": "...", "url": "...", "sourceType": "{source_type}"}}

Order results by relevance (most relevant first). Return at most 10 results.
If no relevant results were found across all searches, return an empty array: []
"""


def build_search_prompt(source_type: str, wiki_context: str) -> str:
    """Build the complete system prompt with wiki context injected."""
    if wiki_context.strip():
        wiki_section = (
            "NOTEBOOK CONTEXT (what the user is researching):\n"
            f"{wiki_context}\n\n"
            "Use this context to understand the user's research domain. "
            "Bias your keyword choices toward this domain when relevant."
        )
    else:
        wiki_section = ""

    return SEARCH_AGENT_SYSTEM_PROMPT.format(
        source_type=source_type,
        wiki_section=wiki_section,
    )
```

- [ ] **Step 3: Commit**

```bash
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent
git add config/search_agent.py prompts/search_agent.py
git commit -m "feat(search): add search agent config and prompt"
```

---

### Task 5: Search Agent — Tools (Python)

**Files:**
- Create: `apps/agent/tools/search_tools.py`

- [ ] **Step 1: Create the search tools module**

Three tools following the same pattern as `tools/wiki_tools.py` (using httpx to call back to SparkFlow API). The web search tool uses `tavily-python` directly.

```python
# apps/agent/tools/search_tools.py
"""Search tools for the search agent.

Each tool searches one source type:
- search_web: Tavily web search with optional domain filtering
- search_publications: Full-text search on SparkFlow publication DB
- search_wechat: Full-text search on WeChat article DB
"""

import json
import os

import httpx
from langchain_core.tools import tool

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")


@tool
def search_web(query: str, domains: list[str] | None = None) -> str:
    """Search the web for relevant pages.

    Args:
        query: Search keywords (reformulated for best results).
        domains: Optional list of domains to restrict search to (e.g. ["arxiv.org"]).
    """
    try:
        from tavily import TavilyClient

        api_key = os.getenv("TAVILY_API_KEY", "")
        if not api_key:
            return json.dumps({"error": "TAVILY_API_KEY not configured"})

        client = TavilyClient(api_key=api_key)
        kwargs: dict = {
            "query": query,
            "max_results": 15,
            "search_depth": "advanced",
        }
        if domains:
            kwargs["include_domains"] = domains

        response = client.search(**kwargs)
        results = []
        for r in response.get("results", []):
            results.append({
                "id": r.get("url", ""),
                "title": r.get("title", "Untitled"),
                "snippet": r.get("content", "")[:300],
                "url": r.get("url", ""),
                "published_date": r.get("published_date", ""),
            })
        return json.dumps(results, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def search_publications(query: str, limit: int = 20) -> str:
    """Search the academic publication database for papers matching the query.

    Args:
        query: Search keywords — use technical terms, paper concepts, or method names.
        limit: Maximum number of results to return.
    """
    try:
        res = httpx.post(
            f"{SPARKFLOW_API_URL}/api/explore/search/publications",
            json={"query": query, "limit": limit},
            timeout=30,
        )
        if not res.is_success:
            return json.dumps({"error": f"Search failed: {res.status_code}"})
        data = res.json()
        # Format for the agent
        results = []
        for pub in data:
            results.append({
                "id": pub.get("id", ""),
                "title": pub.get("title", ""),
                "snippet": pub.get("abstract", ""),
                "meta": " · ".join(
                    filter(None, [pub.get("venue"), str(pub.get("year", ""))])
                ),
                "url": pub.get("pdfUrl", ""),
                "authors": pub.get("authors", []),
                "rank": pub.get("rank", 0),
            })
        return json.dumps(results, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def search_wechat(query: str, limit: int = 20) -> str:
    """Search the WeChat article database for articles matching the query.

    Args:
        query: Search keywords — can be Chinese or English terms.
        limit: Maximum number of results to return.
    """
    try:
        res = httpx.post(
            f"{SPARKFLOW_API_URL}/api/explore/search/wechat",
            json={"query": query, "limit": limit},
            timeout=30,
        )
        if not res.is_success:
            return json.dumps({"error": f"Search failed: {res.status_code}"})
        data = res.json()
        results = []
        for article in data:
            publish_time = article.get("publish_time", "")
            if publish_time:
                publish_time = publish_time[:10]  # Just the date part
            results.append({
                "id": str(article.get("id", "")),
                "title": article.get("title", ""),
                "snippet": article.get("content_text", ""),
                "meta": " · ".join(
                    filter(None, ["WeChat", article.get("source_name", ""), publish_time])
                ),
                "url": article.get("original_url", ""),
                "rank": article.get("rank", 0),
            })
        return json.dumps(results, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


# Tool lookup by source type
SEARCH_TOOLS_BY_TYPE = {
    "web": [search_web],
    "publication": [search_publications],
    "wechat": [search_wechat],
}
```

- [ ] **Step 2: Add tavily-python to dependencies**

Add `tavily-python` to `apps/agent/pyproject.toml` dependencies:

```toml
# In the [project] dependencies list, add:
    "tavily-python",
```

And to `apps/agent/requirements.txt`:

```
# After the "# Utilities" section, add:
tavily-python
```

- [ ] **Step 3: Install the new dependency**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent && pip install tavily-python`

- [ ] **Step 4: Commit**

```bash
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent
git add tools/search_tools.py pyproject.toml requirements.txt
git commit -m "feat(search): add search tools (web, publication, wechat)"
```

---

### Task 6: Search Agent — LangGraph Graph (Python)

**Files:**
- Create: `apps/agent/graphs/search_agent.py`
- Modify: `apps/agent/langgraph.json`

- [ ] **Step 1: Create the search agent graph**

```python
# apps/agent/graphs/search_agent.py
"""LangGraph search agent with iterative tool-calling loop.

Searches one source type at a time (web/publication/wechat) with
wiki context awareness. Iterates up to 3 times to refine results.
"""

from __future__ import annotations

import json
import os
from typing import Annotated, Any

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.runtime import Runtime
from typing_extensions import TypedDict

from config.search_agent import SearchAgentContext
from prompts.search_agent import build_search_prompt
from tools.search_tools import SEARCH_TOOLS_BY_TYPE

MAX_ITERATIONS = 3

_model_cache: dict[str, Any] = {}


class SearchState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    iteration: int


def _get_model(provider: str, name: str):
    key = f"{provider}:{name}"
    if key not in _model_cache:
        if provider == "google":
            _model_cache[key] = ChatGoogleGenerativeAI(model=name)
        else:
            _model_cache[key] = init_chat_model(f"{provider}:{name}")
    return _model_cache[key]


async def agent_node(
    state: SearchState, runtime: Runtime[SearchAgentContext]
) -> dict[str, Any]:
    """LLM decides: call a search tool or return final results."""
    source_type = runtime.context.source_type
    tools = SEARCH_TOOLS_BY_TYPE.get(source_type, [])

    provider = runtime.context.model_provider or os.getenv(
        "DEFAULT_MODEL_PROVIDER", "openai"
    )
    model_name = runtime.context.model_name or os.getenv(
        "DEFAULT_MODEL_NAME", "gpt-4o"
    )
    model = _get_model(provider, model_name)

    # Once max iterations reached, don't bind tools — force the LLM to return final JSON
    if tools and state.get("iteration", 0) < MAX_ITERATIONS:
        bound_model = model.bind_tools(tools)
    else:
        bound_model = model

    # Build system prompt with wiki context
    system_prompt = build_search_prompt(
        source_type=source_type,
        wiki_context=runtime.context.wiki_context,
    )

    # Inject domain filter hint for web searches
    if source_type == "web" and runtime.context.domains:
        domain_list = ", ".join(runtime.context.domains)
        system_prompt += f"\n\nDOMAIN FILTER: Restrict web search to these domains: {domain_list}"

    response = await bound_model.ainvoke(
        [SystemMessage(content=system_prompt)] + list(state["messages"]),
    )

    new_iteration = state.get("iteration", 0)
    # Only increment if the model made tool calls (a search round happened)
    if isinstance(response, AIMessage) and response.tool_calls:
        new_iteration += 1

    return {"messages": [response], "iteration": new_iteration}


async def tool_node(state: SearchState, runtime: Runtime[SearchAgentContext]) -> dict[str, Any]:
    """Execute tool calls from the LLM response."""
    source_type = runtime.context.source_type
    tools = SEARCH_TOOLS_BY_TYPE.get(source_type, [])
    tools_by_name = {t.name: t for t in tools}

    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage):
        return {"messages": []}

    results: list[ToolMessage] = []
    for call in last_message.tool_calls:
        tool = tools_by_name.get(call["name"])
        if tool is None:
            results.append(
                ToolMessage(
                    content=json.dumps({"error": f"Unknown tool: {call['name']}"}),
                    tool_call_id=call["id"],
                )
            )
            continue

        try:
            # Inject domains for web search tool
            args = dict(call.get("args", {}))
            if call["name"] == "search_web" and runtime.context.domains:
                args.setdefault("domains", runtime.context.domains)
            observation = await tool.ainvoke(args)
        except Exception as e:
            observation = json.dumps({"error": str(e)})

        results.append(
            ToolMessage(content=str(observation), tool_call_id=call["id"])
        )

    return {"messages": results}


def should_continue(state: SearchState) -> str:
    """Decide whether to continue searching or stop."""
    last_message = state["messages"][-1]

    # If the LLM didn't make tool calls, it returned final results — stop
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return END

    # Always execute pending tool calls, even on the last iteration.
    # The iteration count is checked in agent_node: once iteration >= MAX_ITERATIONS,
    # the model is invoked without tools bound, forcing it to return final JSON.
    return "tools"


# Build the graph
builder = StateGraph(SearchState, context_schema=SearchAgentContext)
builder.add_node("agent", agent_node)
builder.add_node("tools", tool_node)
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
builder.add_edge("tools", "agent")

agent = builder.compile()
```

- [ ] **Step 2: Register the search graph in langgraph.json**

Edit `apps/agent/langgraph.json` to add the search graph:

```json
{
    "dependencies": [
        "."
    ],
    "graphs": {
        "agent": "./graphs/rag_agent.py:agent",
        "hub": "./graphs/hub_agent.py:agent",
        "search": "./graphs/search_agent.py:agent"
    },
    "env": ".env",
    "image_distro": "wolfi"
}
```

- [ ] **Step 3: Verify the agent loads**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent && python -c "from graphs.search_agent import agent; print('Graph compiled:', agent)"`

Expected: `Graph compiled: <langgraph.graph.state.CompiledStateGraph object at ...>`

- [ ] **Step 4: Commit**

```bash
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent
git add graphs/search_agent.py langgraph.json
git commit -m "feat(search): add search agent LangGraph graph"
```

---

### Task 7: Refactor Search API Route to Use Search Agent

**Files:**
- Modify: `apps/web/app/api/notebooks/[id]/sources/search/route.ts`

- [ ] **Step 1: Read the current search route**

Read `apps/web/app/api/notebooks/[id]/sources/search/route.ts` to confirm current state before editing.

- [ ] **Step 2: Refactor performSearch to call the search agent for all source types**

Replace the entire `performSearch` function. The new version:
1. Fetches wiki context from NotebookGraph
2. Calls the LangGraph search agent (for all 3 source types, not just web)
3. Parses the agent's JSON response into SearchResult[]

```typescript
// Replace the import section at the top of route.ts.
// Remove: import { searchWechatArticles } from "@/lib/services/wechat-client";
// Add: import { getWikiContextForSearch } from "@/lib/services/wiki-context";
```

Replace the `performSearch` function:

```typescript
async function performSearch(
  taskId: string,
  notebookId: string,
  query: string,
  sourceType: string,
  domains?: string[],
  modelProvider?: string,
  modelName?: string,
) {
  const task = searchTasks.get(taskId);
  if (!task) return;

  try {
    // 1. Fetch wiki context for the notebook
    const wikiContext = await getWikiContextForSearch(notebookId);

    // 2. Call the search agent
    const agentUrl =
      process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";
    const response = await fetch(`${agentUrl}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistant_id: "search",
        input: {
          messages: [{ role: "user", content: query }],
          iteration: 0,
        },
        config: {
          configurable: {
            source_type: sourceType,
            domains: domains || [],
            wiki_context: wikiContext,
            model_provider: modelProvider,
            model_name: modelName,
          },
        },
      }),
    });

    let results: SearchResult[] = [];

    if (response.ok) {
      const data = await response.json();
      // The agent's last message should be a JSON array of results
      const lastMessage = data?.output?.messages?.slice(-1)?.[0];
      const content =
        typeof lastMessage === "string"
          ? lastMessage
          : lastMessage?.content;
      if (content) {
        try {
          // Strip markdown code fences if the LLM wrapped them
          const cleaned = content
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            results = parsed.map((r: any) => ({
              id: r.id || r.url || "",
              title: r.title || "Untitled",
              snippet: r.snippet || "",
              meta: r.meta || "",
              url: r.url || undefined,
              sourceType: sourceType as SearchResult["sourceType"],
            }));
          }
        } catch {
          // Agent returned non-JSON, leave results empty
        }
      }
    }

    task.results = results;
    task.status = "completed";
  } catch (err) {
    task.status = "failed";
    task.error = err instanceof Error ? err.message : "Search failed";
  }
}
```

Also update the `performSearch` call in the `POST` handler to pass `notebookId`:

```typescript
// In the POST handler, change the performSearch call:
performSearch(
  taskId,
  notebookId,  // <-- add this parameter
  query,
  sourceType,
  domains,
  searchModelProvider,
  searchModelName,
).catch((err) => {
  // ... error handling unchanged
});
```

Remove the `wechatExcludedSourceIds` parameter since filtering is now handled by the search agent's tool.

- [ ] **Step 3: Verify the refactored route compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors related to the search route.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/notebooks/[id]/sources/search/route.ts
git commit -m "refactor(search): route all source types through search agent"
```

---

### Task 8: End-to-End Integration Test

**Files:** None (manual testing)

- [ ] **Step 1: Verify the LangGraph agent server starts with the new graph**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/agent && langgraph dev --host 0.0.0.0 --port 2024`

Expected: Server starts without errors. Logs should show 3 graphs registered: `agent`, `hub`, `search`.

- [ ] **Step 2: Test publication search through the full stack**

1. Open the app at `http://localhost:3001`
2. Open a notebook that has some wiki content (sources already ingested)
3. Click "Add Source" → select "Publication"
4. Search for a concept (e.g., "attention in vision") rather than an exact title
5. Verify: results are semantically relevant, not just keyword matches

- [ ] **Step 3: Test WeChat search through the full stack**

Same flow but select "WeChat Article". Search for a conceptual term.

- [ ] **Step 4: Test web search through the full stack**

Same flow but select "Web". Add a domain filter (e.g., `arxiv.org`). Verify domain filtering works.

- [ ] **Step 5: Test with empty notebook (no wiki context)**

Create a new empty notebook, try searching. Verify the agent still works (just without domain bias).

- [ ] **Step 6: Commit any fixes discovered during testing**

```bash
git add -A
git commit -m "fix(search): integration test fixes"
```

---

### Task 9: Add GIN Indexes for Performance (Optional, Recommended)

**Files:** None (raw SQL migration)

This is optional but recommended for production. Without GIN indexes, full-text search computes tsvector on every row per query. With GIN indexes, it's sub-millisecond.

- [ ] **Step 1: Add GIN index to Publication table**

Run against the main database:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_publication_fts
ON "Publication"
USING GIN (
  (setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
   setweight(to_tsvector('english', coalesce(abstract, '')), 'B'))
);
```

Note: `CONCURRENTLY` avoids locking the table during index creation. This is safe to run on a live database.

- [ ] **Step 2: Add GIN index to WeChat articles table**

Run against the WeChat database:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wechat_articles_fts
ON wechat_articles.articles
USING GIN (
  (setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
   setweight(to_tsvector('simple', coalesce(content_text, '')), 'B'))
);
```

- [ ] **Step 3: Verify indexes exist**

```sql
-- Main DB
SELECT indexname FROM pg_indexes WHERE tablename = 'Publication' AND indexname LIKE '%fts%';

-- WeChat DB
SELECT indexname FROM pg_indexes WHERE tablename = 'articles' AND indexname LIKE '%fts%';
```

Expected: Both return one row each.
