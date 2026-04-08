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
