# LLM Wiki Backend + Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PageIndex-based RAG retrieval with the LLM Wiki pattern — persistent, compounding wiki pages per notebook maintained by the agent.

**Architecture:** WikiPage records in PostgreSQL store LLM-generated markdown pages per notebook. The agent reads/writes wiki pages through CRUD API routes. An index page catalogs all pages; the agent reads it first on every query. Ingest processes sources into wiki pages in the background. No vector search — the LLM IS the retrieval engine.

**Tech Stack:** Prisma 7, Next.js 16 API routes, LangGraph Python agent, LangChain tools

**Spec:** `docs/superpowers/specs/2026-04-07-llm-wiki-notebook-design.md`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `apps/web/app/api/notebooks/[id]/wiki/route.ts` | List all wiki pages for a notebook |
| `apps/web/app/api/notebooks/[id]/wiki/[slug]/route.ts` | GET/PUT a single wiki page by slug |
| `apps/web/app/api/notebooks/[id]/wiki/log/route.ts` | POST append to log page |
| `apps/web/app/api/notebooks/[id]/ingest/[sourceId]/route.ts` | POST trigger wiki ingest for a source |
| `apps/agent/tools/wiki_tools.py` | Agent tools: wiki_read, wiki_write, wiki_list, wiki_log, source_read, source_list |

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/prisma/schema.prisma` | Add WikiPage model, WikiPageType enum, wikiSchema on Notebook, remove Source.indexData |
| `apps/agent/graphs/rag_agent.py` | Replace pageindex_tools with wiki_tools |
| `apps/agent/config/rag_agent.py` | Update AgentContext with wiki_schema field |
| `apps/agent/prompts/rag_agent.py` | Rewrite system prompt for wiki-based workflow |
| `apps/agent/middleware/sources_context.py` | Simplify — no more tree summaries, just pass wiki schema |
| `apps/web/lib/services/source-processors/pdf-processor.ts` | Trigger wiki ingest after processing |
| `apps/web/lib/services/source-processors/webpage-processor.ts` | Trigger wiki ingest after processing |
| `apps/web/lib/services/source-processors/text-processor.ts` | Trigger wiki ingest after processing |

### Files to Delete
| File | Reason |
|------|--------|
| `apps/agent/tools/pageindex_tools.py` | Replaced by wiki_tools.py |
| `apps/agent/utils/pageindex_client.py` | PageIndex no longer used |
| `apps/agent/api/index_endpoint.py` | Replaced by wiki ingest endpoint |
| `apps/web/app/api/notebooks/[id]/sources/[sourceId]/index/route.ts` | Replaced by wiki ingest |

---

## Task 1: Database Schema — WikiPage Model

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add WikiPageType enum and WikiPage model**

Add after the `Source` model block in `apps/web/prisma/schema.prisma`:

```prisma
enum WikiPageType {
  ENTITY
  CONCEPT
  SUMMARY
  COMPARISON
  INDEX
  LOG
}

model WikiPage {
  id         String       @id @default(cuid())
  notebookId String
  slug       String
  title      String
  content    String       @db.Text
  pageType   WikiPageType
  sourceRefs String[]     // Source IDs that contributed to this page
  createdAt  DateTime     @default(now())
  updatedAt  DateTime     @updatedAt

  notebook Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)

  @@unique([notebookId, slug])
  @@index([notebookId])
  @@map("wiki_pages")
}
```

- [ ] **Step 2: Add wikiSchema and wikiPages to Notebook model**

In the `Notebook` model, add after `description String?`:

```prisma
  wikiSchema  Json?       // Wiki structure conventions (searchCollections, pageTypes, emphasis)
```

And add to the relations section:

```prisma
  wikiPages    WikiPage[]
```

- [ ] **Step 3: Remove Source.indexData field**

In the `Source` model, delete this line:

```prisma
  indexData         Json?                 // PageIndex tree
```

- [ ] **Step 4: Generate Prisma client**

Run:
```bash
cd apps/web && npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat(schema): add WikiPage model, remove Source.indexData"
```

---

## Task 2: Wiki CRUD API Routes

**Files:**
- Create: `apps/web/app/api/notebooks/[id]/wiki/route.ts`
- Create: `apps/web/app/api/notebooks/[id]/wiki/[slug]/route.ts`
- Create: `apps/web/app/api/notebooks/[id]/wiki/log/route.ts`

- [ ] **Step 1: Create wiki list route**

Create `apps/web/app/api/notebooks/[id]/wiki/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;

  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const pages = await prisma.wikiPage.findMany({
    where: { notebookId },
    select: {
      id: true,
      slug: true,
      title: true,
      pageType: true,
      sourceRefs: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ pages });
}
```

- [ ] **Step 2: Create wiki page read/write route**

Create `apps/web/app/api/notebooks/[id]/wiki/[slug]/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, slug } = await params;

  const page = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug } },
    include: { notebook: { select: { userId: true } } },
  });

  if (!page || page.notebook.userId !== session.user.id) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: page.id,
    slug: page.slug,
    title: page.title,
    content: page.content,
    pageType: page.pageType,
    sourceRefs: page.sourceRefs,
    updatedAt: page.updatedAt,
  });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, slug } = await params;

  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const body = await request.json();
  const { title, content, pageType, sourceRefs } = body;

  if (!title || !content || !pageType) {
    return NextResponse.json(
      { error: "title, content, and pageType are required" },
      { status: 400 }
    );
  }

  const page = await prisma.wikiPage.upsert({
    where: { notebookId_slug: { notebookId, slug } },
    create: {
      notebookId,
      slug,
      title,
      content,
      pageType,
      sourceRefs: sourceRefs || [],
    },
    update: {
      title,
      content,
      pageType,
      sourceRefs: sourceRefs || [],
    },
  });

  return NextResponse.json({ page });
}
```

- [ ] **Step 3: Create wiki log append route**

Create `apps/web/app/api/notebooks/[id]/wiki/log/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;

  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const { entry } = await request.json();
  if (!entry) {
    return NextResponse.json({ error: "entry is required" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] ${entry}`;

  // Upsert the log page — create if doesn't exist, append if it does
  const existing = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug: "log" } },
  });

  if (existing) {
    await prisma.wikiPage.update({
      where: { id: existing.id },
      data: { content: existing.content + logEntry },
    });
  } else {
    await prisma.wikiPage.create({
      data: {
        notebookId,
        slug: "log",
        title: "Activity Log",
        content: `# Activity Log\n${logEntry}`,
        pageType: "LOG",
        sourceRefs: [],
      },
    });
  }

  return NextResponse.json({ success: true });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/notebooks/
git commit -m "feat(api): add wiki CRUD routes (list, read, write, log)"
```

---

## Task 3: Wiki Ingest API Route

**Files:**
- Create: `apps/web/app/api/notebooks/[id]/ingest/[sourceId]/route.ts`

This endpoint is called after a source is processed. It sends the source content to the agent for wiki integration.

- [ ] **Step 1: Create the ingest endpoint**

Create `apps/web/app/api/notebooks/[id]/ingest/[sourceId]/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, sourceId } = await params;

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { userId: true, wikiSchema: true } } },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const content = source.markdownContent || source.content;
  if (!content) {
    return NextResponse.json(
      { error: "Source has no content to ingest" },
      { status: 400 }
    );
  }

  try {
    // Call the agent's ingest endpoint
    const agentUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";

    const res = await fetch(`${agentUrl}/wiki/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notebook_id: notebookId,
        source_id: sourceId,
        source_title: source.title,
        source_content: content,
        wiki_schema: source.notebook.wikiSchema || {},
        sparkflow_api_url: process.env.NEXTAUTH_URL || "http://localhost:3001",
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Agent ingest failed: ${res.status} ${error}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Ingest failed";
    console.error("Wiki ingest failed:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
```

- [ ] **Step 2: Update source processors to trigger ingest**

In each of the three source processors (`pdf-processor.ts`, `webpage-processor.ts`, `text-processor.ts`), replace the existing PageIndex indexing trigger with a wiki ingest trigger.

Find this block in each file (added in the previous migration):
```typescript
    // Trigger PageIndex indexing in background (non-blocking)
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3001";
    fetch(
      `${baseUrl}/api/notebooks/${context.notebookId}/sources/${sourceId}/index`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    ).catch((err) => console.error("PageIndex indexing trigger failed:", err));
```

Replace with:
```typescript
    // Trigger wiki ingest in background (non-blocking)
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3001";
    fetch(
      `${baseUrl}/api/notebooks/${context.notebookId}/ingest/${sourceId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    ).catch((err) => console.error("Wiki ingest trigger failed:", err));
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/notebooks/ apps/web/lib/services/source-processors/
git commit -m "feat(api): add wiki ingest endpoint, wire into source processors"
```

---

## Task 4: Agent Wiki Tools

**Files:**
- Create: `apps/agent/tools/wiki_tools.py`
- Delete: `apps/agent/tools/pageindex_tools.py`
- Delete: `apps/agent/utils/pageindex_client.py`

- [ ] **Step 1: Create wiki_tools.py**

Create `apps/agent/tools/wiki_tools.py`:

```python
"""
LangChain tools for LLM Wiki — read, write, and manage wiki pages.
The agent uses these to maintain a persistent knowledge base per notebook.
"""

import os

import httpx
from langchain_core.tools import tool
from langchain.tools import ToolRuntime

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")


def _get_notebook_id(runtime: ToolRuntime) -> str | None:
    """Get notebook ID from runtime context."""
    ctx = runtime.context if runtime else None
    if not ctx:
        return None
    return getattr(ctx, "notebook_id", None)


def _api_url(notebook_id: str, path: str) -> str:
    """Build API URL for wiki operations."""
    return f"{SPARKFLOW_API_URL}/api/notebooks/{notebook_id}/wiki/{path}"


@tool
def wiki_list(runtime: ToolRuntime = None) -> str:
    """Read the wiki index — a catalog of all wiki pages with titles and summaries.

    Always call this first when answering a question to find relevant pages.
    Returns the index page content (markdown with page listings).
    """
    notebook_id = _get_notebook_id(runtime)
    if not notebook_id:
        return "No notebook context available."

    try:
        res = httpx.get(_api_url(notebook_id, "index"), timeout=30)
        if res.status_code == 404:
            return "Wiki is empty. No pages yet."
        if not res.is_success:
            return f"Failed to read wiki index: {res.status_code}"
        data = res.json()
        return data.get("content", "Wiki index is empty.")
    except Exception as e:
        return f"Error reading wiki index: {e}"


@tool
def wiki_read(slug: str, runtime: ToolRuntime = None) -> str:
    """Read a specific wiki page by its slug.

    Use this after wiki_list to read pages relevant to the user's question.

    Args:
        slug: The page slug (e.g., "transformer-architecture", "vaswani-2017-summary")
    """
    notebook_id = _get_notebook_id(runtime)
    if not notebook_id:
        return "No notebook context available."

    try:
        res = httpx.get(_api_url(notebook_id, slug), timeout=30)
        if res.status_code == 404:
            return f"Wiki page '{slug}' not found."
        if not res.is_success:
            return f"Failed to read page: {res.status_code}"
        data = res.json()
        return f"# {data['title']}\n\n{data['content']}"
    except Exception as e:
        return f"Error reading wiki page: {e}"


@tool
def wiki_write(
    slug: str,
    title: str,
    content: str,
    page_type: str,
    source_refs: list[str] | None = None,
    runtime: ToolRuntime = None,
) -> str:
    """Create or update a wiki page.

    Use this during ingest to create/update entity, concept, summary, and comparison pages.
    Also use this to update the index page after creating/updating other pages.

    Args:
        slug: URL-friendly page identifier (e.g., "attention-mechanism")
        title: Display title for the page
        content: Full markdown content. Use [[slug]] for wiki links, [source:id] for source refs.
        page_type: One of: ENTITY, CONCEPT, SUMMARY, COMPARISON, INDEX, LOG
        source_refs: List of Source IDs that contributed to this page
    """
    notebook_id = _get_notebook_id(runtime)
    if not notebook_id:
        return "No notebook context available."

    try:
        res = httpx.put(
            _api_url(notebook_id, slug),
            json={
                "title": title,
                "content": content,
                "pageType": page_type,
                "sourceRefs": source_refs or [],
            },
            timeout=30,
        )
        if not res.is_success:
            return f"Failed to write page: {res.status_code} {res.text}"
        return f"Wiki page '{slug}' saved successfully."
    except Exception as e:
        return f"Error writing wiki page: {e}"


@tool
def wiki_log(entry: str, runtime: ToolRuntime = None) -> str:
    """Append an entry to the wiki activity log.

    Call this after completing an ingest or significant wiki update.

    Args:
        entry: Log entry text (e.g., "ingest | Attention Is All You Need")
    """
    notebook_id = _get_notebook_id(runtime)
    if not notebook_id:
        return "No notebook context available."

    try:
        res = httpx.post(
            f"{SPARKFLOW_API_URL}/api/notebooks/{notebook_id}/wiki/log",
            json={"entry": entry},
            timeout=30,
        )
        if not res.is_success:
            return f"Failed to write log: {res.status_code}"
        return "Log entry added."
    except Exception as e:
        return f"Error writing log: {e}"


@tool
def source_read(source_id: str, runtime: ToolRuntime = None) -> str:
    """Read the raw markdown content of a source document.

    Use this during ingest to read the full source content.

    Args:
        source_id: The Source ID to read
    """
    notebook_id = _get_notebook_id(runtime)
    if not notebook_id:
        return "No notebook context available."

    try:
        res = httpx.get(
            f"{SPARKFLOW_API_URL}/api/notebooks/{notebook_id}/sources/{source_id}/content",
            timeout=30,
        )
        if res.status_code == 404:
            return f"Source '{source_id}' not found."
        if not res.is_success:
            return f"Failed to read source: {res.status_code}"
        data = res.json()
        return data.get("content", "Source has no content.")
    except Exception as e:
        return f"Error reading source: {e}"


@tool
def source_list(runtime: ToolRuntime = None) -> str:
    """List all sources in the notebook with their titles and IDs.

    Returns a formatted list of all raw source documents.
    """
    notebook_id = _get_notebook_id(runtime)
    if not notebook_id:
        return "No notebook context available."

    try:
        res = httpx.get(
            f"{SPARKFLOW_API_URL}/api/notebooks/{notebook_id}/sources/status",
            timeout=30,
        )
        if not res.is_success:
            return f"Failed to list sources: {res.status_code}"
        data = res.json()
        sources = data.get("sources", [])
        if not sources:
            return "No sources in this notebook."

        lines = ["# Sources\n"]
        for s in sources:
            status = s.get("status", "UNKNOWN")
            lines.append(f"- **{s['title']}** [source:{s['id']}] ({status})")
        return "\n".join(lines)
    except Exception as e:
        return f"Error listing sources: {e}"


wiki_tools = [wiki_list, wiki_read, wiki_write, wiki_log, source_read, source_list]
```

- [ ] **Step 2: Create source content API route**

The `source_read` tool needs an endpoint. Create `apps/web/app/api/notebooks/[id]/sources/[sourceId]/content/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, sourceId } = await params;

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { userId: true } } },
  });

  if (!source || source.notebook.userId !== session.user.id || source.notebookId !== notebookId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    content: source.markdownContent || source.content || "",
    title: source.title,
  });
}
```

- [ ] **Step 3: Delete old PageIndex files**

```bash
rm apps/agent/tools/pageindex_tools.py
rm apps/agent/utils/pageindex_client.py
rm apps/agent/api/index_endpoint.py
rm -rf "apps/web/app/api/notebooks/[id]/sources/[sourceId]/index"
```

- [ ] **Step 4: Remove pageindex from requirements.txt**

In `apps/agent/requirements.txt`, remove the line:
```
# PageIndex for document indexing
pageindex
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(agent): add wiki tools, delete PageIndex tools and client"
```

---

## Task 5: Update Agent Graph and Prompts

**Files:**
- Modify: `apps/agent/graphs/rag_agent.py`
- Modify: `apps/agent/config/rag_agent.py`
- Modify: `apps/agent/prompts/rag_agent.py`
- Modify: `apps/agent/middleware/sources_context.py`

- [ ] **Step 1: Update AgentContext**

Replace `apps/agent/config/rag_agent.py` with:

```python
"""RAG agent configuration."""

import os
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RAGAgentConfig:
    """Configuration for RAG agent."""

    model_provider: str = os.getenv("DEFAULT_MODEL_PROVIDER", "openai")
    model_name: str = os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")


@dataclass
class AgentContext:
    """Runtime context for RAG agent tools and middleware."""

    notebook_id: str = ""
    wiki_schema: dict[str, Any] = field(default_factory=dict)
    model_provider: str = os.getenv("DEFAULT_MODEL_PROVIDER", "openai")
    model_name: str = os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")


RAG_AGENT_CONFIG = RAGAgentConfig()
```

Key change: replaced `sources_context` with `notebook_id` and `wiki_schema`. The agent now accesses wiki pages via API calls (tools), not via context injection.

- [ ] **Step 2: Update agent graph**

In `apps/agent/graphs/rag_agent.py`, change the tool import:

```python
# Change this line:
from tools.pageindex_tools import pageindex_tools
# To:
from tools.wiki_tools import wiki_tools
```

And update `_build_agent`:

```python
def _build_agent(model):
    """Build a deep agent with the given model."""
    return create_deep_agent(
        model=model,
        backend=FilesystemBackend(root_dir="."),
        skills=["./skills/"],
        tools=wiki_tools,
        system_prompt=RAG_AGENT_SYSTEM_PROMPT,
        middleware=[inject_wiki_context, optimize_query],
        context_schema=AgentContext,
    )
```

Note: `inject_sources_context` renamed to `inject_wiki_context`.

- [ ] **Step 3: Rewrite system prompt**

Replace `apps/agent/prompts/rag_agent.py` with:

```python
"""System prompts for RAG agent."""

RAG_AGENT_SYSTEM_PROMPT = """
# Role
You are a knowledge base assistant that maintains a personal wiki for the user's research notebook.

# How the Wiki Works
You maintain a collection of interlinked markdown wiki pages. Each notebook has:
- **index** page: catalog of all wiki pages with one-line summaries
- **log** page: chronological record of operations
- **Entity pages**: people, organizations, methods, datasets, tools
- **Concept pages**: themes, topics, theories, research areas
- **Summary pages**: per-source summaries with key takeaways
- **Comparison pages**: cross-source analyses and contrasts

# Tools
- `wiki_list()` — Read the index page. **Always call this first** when answering questions.
- `wiki_read(slug)` — Read a specific wiki page for detailed content.
- `wiki_write(slug, title, content, page_type, source_refs)` — Create or update a wiki page.
- `wiki_log(entry)` — Append to the activity log.
- `source_read(source_id)` — Read raw source document content.
- `source_list()` — List all source documents in the notebook.

# Answering Questions
1. Call `wiki_list()` to read the index
2. Identify relevant wiki pages from the index
3. Call `wiki_read()` on those pages
4. Synthesize an answer from the compiled wiki knowledge
5. Cite wiki pages with [[slug]] and sources with [source:id]
6. If the answer produces a valuable synthesis, offer to save it as a wiki page

# Ingesting Sources
When asked to ingest a source:
1. Call `source_read(source_id)` to read the raw content
2. Call `wiki_list()` to understand current wiki state
3. Create a summary page for the source
4. Create or update entity pages for key people, methods, datasets
5. Create or update concept pages for themes and topics
6. Update the index page with all new/changed pages
7. Call `wiki_log()` to record the ingest
8. Report what you created and updated

# Wiki Link Syntax
- Link to wiki pages: [[slug]] (e.g., [[transformer-architecture]])
- Link to sources: [source:id] (e.g., [source:cm123abc])

# Output Format
- Respond in the user's language
- Cite inline with [[slug]] and [source:id]
- Be specific — reference exact wiki pages, not vague summaries
- If wiki has no relevant content, say so and suggest adding sources
"""
```

- [ ] **Step 4: Simplify middleware**

Replace `apps/agent/middleware/sources_context.py` with:

```python
"""Wiki context middleware for the RAG agent.

Injects wiki schema into the system prompt so the agent knows
the notebook's conventions and emphasis areas.
"""

from langchain.agents.middleware import before_agent, AgentState
from langchain.messages import SystemMessage
from langgraph.runtime import Runtime


@before_agent
def inject_wiki_context(state: AgentState, runtime: Runtime) -> dict | None:
    """Inject wiki schema context into the conversation."""
    if not runtime or not runtime.context:
        return None

    ctx = runtime.context if not isinstance(runtime.context, dict) else type("Ctx", (), runtime.context)()
    wiki_schema = getattr(ctx, "wiki_schema", None)
    if not wiki_schema:
        return None

    emphasis = wiki_schema.get("emphasis", [])
    if not emphasis:
        return None

    messages = state.get("messages", [])

    # Check for duplicate injection
    for msg in messages:
        if isinstance(msg, SystemMessage) and "Wiki Focus" in msg.content:
            return None

    focus_text = "\n## Wiki Focus\n\nFor this notebook, emphasize:\n"
    for item in emphasis:
        focus_text += f"- {item}\n"

    return {"messages": [SystemMessage(content=focus_text)] + list(messages)}
```

- [ ] **Step 5: Update the import in rag_agent.py**

Change:
```python
from middleware.sources_context import inject_sources_context
```
To:
```python
from middleware.sources_context import inject_wiki_context
```

- [ ] **Step 6: Commit**

```bash
git add apps/agent/
git commit -m "feat(agent): rewrite agent for wiki-based workflow"
```

---

## Task 6: Wire Notebook Context to Agent

**Files:**
- Modify: `apps/web/components/deepdive/chat/chat-panel.tsx`

The chat panel needs to pass `notebook_id` and `wiki_schema` to the agent instead of `dataset_ids` and `sources_context`.

- [ ] **Step 1: Read current chat-panel.tsx to find where context is passed**

Find where the CopilotKit context or LangGraph context is configured. Look for `dataset_ids` or `sources_context` being set. Update to pass:

```typescript
context: {
  notebook_id: notebookId,
  wiki_schema: notebook.wikiSchema || {},
  model_provider: modelProvider,
  model_name: modelName,
}
```

The exact location depends on how CopilotKit/LangGraph runtime is configured in the chat panel. Read the file and update accordingly.

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/deepdive/chat/chat-panel.tsx
git commit -m "feat(chat): pass notebook_id and wiki_schema to agent context"
```

---

## Task 7: Auto-Create Wiki on Notebook Creation

**Files:**
- Modify: `apps/web/lib/actions/notebooks.ts`

When a notebook is created, auto-create the index and log wiki pages.

- [ ] **Step 1: Update createNotebook**

In `apps/web/lib/actions/notebooks.ts`, after the notebook is created, add wiki initialization:

```typescript
export async function createNotebook(name: string, description?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const notebook = await prisma.notebook.create({
    data: {
      name,
      description,
      userId: session.user.id,
      wikiSchema: {
        searchCollections: ["publications", "sessions"],
        pageTypes: {
          entity: "People, organizations, methods, datasets, tools",
          concept: "Themes, topics, theories, research areas",
          summary: "Per-source summaries with key takeaways",
          comparison: "Cross-source analyses, contrasts, debates",
        },
        emphasis: [],
      },
    },
  });

  // Auto-create index and log wiki pages
  await prisma.wikiPage.createMany({
    data: [
      {
        notebookId: notebook.id,
        slug: "index",
        title: "Wiki Index",
        content: `# ${name} — Wiki Index\n\nThis wiki is empty. Add sources to start building your knowledge base.\n\n## Entities\n\n(none yet)\n\n## Concepts\n\n(none yet)\n\n## Summaries\n\n(none yet)\n\n## Comparisons\n\n(none yet)\n`,
        pageType: "INDEX",
        sourceRefs: [],
      },
      {
        notebookId: notebook.id,
        slug: "log",
        title: "Activity Log",
        content: `# Activity Log\n\n## [${new Date().toISOString().split("T")[0]}] created | Notebook initialized`,
        pageType: "LOG",
        sourceRefs: [],
      },
    ],
  });

  revalidatePath("/deepdive");
  return notebook;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/actions/notebooks.ts
git commit -m "feat: auto-create wiki index and log on notebook creation"
```

---

## Task 8: Delete Old PageIndex Ingest Route

**Files:**
- Delete: `apps/web/app/api/notebooks/[id]/sources/[sourceId]/index/route.ts`

- [ ] **Step 1: Delete the route**

```bash
rm -rf "apps/web/app/api/notebooks/[id]/sources/[sourceId]/index"
```

If already deleted in Task 4, skip this.

- [ ] **Step 2: Verify no remaining PageIndex references**

```bash
cd apps/web && grep -r "pageindex\|PageIndex\|indexData\|Source\.indexData" --include="*.ts" --include="*.tsx" -l
cd apps/agent && grep -r "pageindex\|PageIndex" --include="*.py" -l
```

Fix any remaining references found.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove all PageIndex references"
```

---

## Task 9: Verify TypeScript and Agent Startup

- [ ] **Step 1: Regenerate Prisma client**

```bash
cd apps/web && npx prisma generate
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Fix any errors. Expected: only the pre-existing matcher Buffer error.

- [ ] **Step 3: Start agent and verify**

```bash
cd apps/agent && .venv/bin/langgraph dev --host localhost --port 2024
```

Verify it starts without import errors.

- [ ] **Step 4: Test wiki API routes**

```bash
# Create a test notebook (use Prisma Studio or the UI)
# Then test the wiki routes:
curl http://localhost:3001/api/notebooks/<notebook-id>/wiki
curl http://localhost:3001/api/notebooks/<notebook-id>/wiki/index
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: verify wiki backend integration"
```
