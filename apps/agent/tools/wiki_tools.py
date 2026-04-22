"""
LangChain tools for reading source documents.
Used by the notebook surface to access original source content when wiki
summaries lack detail.

P2 note: ``notebook_id`` is now passed explicitly as an argument to each
tool. The old process-global ``_current_notebook_id`` and ``set_notebook_id``
are retained as no-ops for backward compatibility with
``graphs/rag_agent.py`` until that module is deleted post-P2.
"""

import os
import httpx
from langchain_core.tools import tool

from hermes.registry import registry

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")

# Deprecated: retained as a no-op so graphs/rag_agent.py keeps importing.
_current_notebook_id: str = ""


def set_notebook_id(notebook_id: str) -> None:
    """Deprecated no-op. The notebook_id is now an explicit argument to
    each wiki tool. This stub remains only to keep ``graphs/rag_agent.py``
    importing until it is deleted in a post-P2 cleanup."""


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
        content = data.get("content", "")
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


wiki_tools = [source_read, source_list]

registry.register(
    name=source_read.name,
    toolset="wiki",
    tool=source_read,
    description=source_read.description or "",
)

registry.register(
    name=source_list.name,
    toolset="wiki",
    tool=source_list,
    description=source_list.description or "",
)
