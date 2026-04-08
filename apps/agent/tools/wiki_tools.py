"""
LangChain tools for reading source documents.
Used by the RAG agent to access original source content when wiki summaries lack detail.
"""

import os
import httpx
from langchain_core.tools import tool

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")

# Global notebook_id — set by the agent graph before tool execution
_current_notebook_id: str = ""


def set_notebook_id(notebook_id: str):
    """Set the current notebook ID for tool calls."""
    global _current_notebook_id
    _current_notebook_id = notebook_id


@tool
def source_read(source_id: str) -> str:
    """Read the raw markdown content of a source document.

    Use this when you need specific details, exact quotes, methodology,
    or data not available in the wiki summary.

    Args:
        source_id: The Source ID to read (found in wiki as [source:xxx])
    """
    if not _current_notebook_id:
        return "No notebook context available."

    try:
        res = httpx.get(
            f"{SPARKFLOW_API_URL}/api/notebooks/{_current_notebook_id}/sources/{source_id}/content",
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
def source_list() -> str:
    """List all source documents in the notebook with their titles and IDs.

    Returns a formatted list of all raw source documents.
    """
    if not _current_notebook_id:
        return "No notebook context available."

    try:
        res = httpx.get(
            f"{SPARKFLOW_API_URL}/api/notebooks/{_current_notebook_id}/sources/status",
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
