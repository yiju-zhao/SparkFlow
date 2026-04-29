"""LangChain tools for reading the notebook's wiki pages and source documents.

`source_*` tools fetch the original uploaded content (PDFs, web pages,
markdown) — use them when the wiki summary lacks detail.

`wiki_*` tools fetch the auto-generated wiki: per-community pages built
from the knowledge graph (entities → topics → markdown summaries with
[source:id] backlinks). Use them for the big picture and for connecting
concepts across multiple sources.

Both rely on `notebook_id` being available to the LLM via the session
metadata block emitted by `prompt_builder.build_system_prompt`. The
endpoints they hit are intentionally unauthenticated GETs (see
apps/web/app/api/notebooks/[id]/wiki/route.ts) so the langgraph agent
can call them without forwarding session cookies.
"""

import os

import httpx
from langchain_core.tools import tool

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")


@tool
def source_read(notebook_id: str, source_id: str) -> str:
    """Read the raw markdown content of a source document.

    Use this when you need specific details, exact quotes, methodology,
    or data not available in the wiki summary.

    Args:
        notebook_id: The notebook containing the source. Get this from the
            session metadata in the system prompt.
        source_id: The Source ID to read (found in wiki as [source:xxx])
    """
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
        # `dict.get(key, default)` returns the default ONLY if the key is
        # absent. Prisma serializes a nullable column with the key present
        # and value `null`, so .get returns None — `len(None)` then crashes
        # the tool, which the LLM reports back to the user as "backend
        # parse error". Coerce explicitly with `or ""`.
        content = data.get("content") or ""
        # Truncate very long content to fit in context
        if len(content) > 30000:
            content = content[:30000] + "\n\n[... content truncated ...]"
        return content or "Source has no content."
    except Exception as e:
        return f"Error reading source: {e}"


@tool
def source_list(notebook_id: str) -> str:
    """List all source documents in the notebook with their titles and IDs.

    Returns a formatted list of all raw source documents.

    Args:
        notebook_id: The notebook to list sources for. Get this from the
            session metadata in the system prompt.
    """
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
            lines.append(f"- **{s['title']}** [source:{s['id']}]")
        return "\n".join(lines)
    except Exception as e:
        return f"Error listing sources: {e}"


@tool
def wiki_list(notebook_id: str) -> str:
    """List the auto-generated wiki pages for the notebook.

    Wiki pages are markdown summaries auto-built from the knowledge
    graph: each page groups related entities into a topic and cites the
    original sources via [source:id] backlinks. Call this first to
    discover what topics the notebook covers, then call `wiki_read` to
    drill into a specific page.

    Args:
        notebook_id: The notebook (from session metadata).
    """
    if not notebook_id:
        return "No notebook context available."

    try:
        res = httpx.get(
            f"{SPARKFLOW_API_URL}/api/notebooks/{notebook_id}/wiki",
            timeout=30,
        )
        if not res.is_success:
            return f"Failed to list wiki pages: {res.status_code}"
        pages = res.json().get("pages", [])
        if not pages:
            return "No wiki pages in this notebook yet (sources may still be ingesting)."
        lines = ["# Wiki Pages\n"]
        for p in pages:
            page_type = p.get("pageType", "PAGE")
            lines.append(f"- **{p['title']}** [{p['slug']}] (type: {page_type})")
        return "\n".join(lines)
    except Exception as e:
        return f"Error listing wiki pages: {e}"


@tool
def wiki_read(notebook_id: str, slug: str) -> str:
    """Read the full markdown content of a single wiki page.

    Use this after `wiki_list` to read a specific topic page — it gives
    a synthesized overview across multiple sources, with [source:id]
    citations you can follow up on with `source_read`.

    Args:
        notebook_id: The notebook (from session metadata).
        slug: The wiki page slug (from `wiki_list`, e.g. "community-3").
    """
    if not notebook_id:
        return "No notebook context available."

    try:
        res = httpx.get(
            f"{SPARKFLOW_API_URL}/api/notebooks/{notebook_id}/wiki/{slug}",
            timeout=30,
        )
        if res.status_code == 404:
            return f"Wiki page '{slug}' not found."
        if not res.is_success:
            return f"Failed to read wiki page: {res.status_code}"
        data = res.json()
        title = data.get("title") or ""
        # See note in source_read above — `or ""` to coerce JSON null safely.
        content = data.get("content") or ""
        # Truncate aggressively — wiki pages can be large after several
        # ingest passes, and the LLM also has the source_read fallback.
        if len(content) > 20000:
            content = content[:20000] + "\n\n[... content truncated, use source_read for specifics ...]"
        return f"# {title}\n\n{content}" if content else "Wiki page has no content."
    except Exception as e:
        return f"Error reading wiki page: {e}"


wiki_tools = [source_read, source_list, wiki_list, wiki_read]
