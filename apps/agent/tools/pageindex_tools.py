"""
LangChain tools for PageIndex-based document retrieval.
Replaces the RagFlow tools (explore, search, probe, get_first_chunk).
"""

import json
import os

import httpx
from langchain_core.tools import tool
from langchain.tools import ToolRuntime

from utils.pageindex_client import (
    retrieve,
    get_tree_summary,
    find_section,
)

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")


def _get_sources_context(runtime: ToolRuntime) -> list[dict]:
    """Get sources context from runtime."""
    ctx = runtime.context if runtime else None
    if not ctx:
        return []
    return getattr(ctx, "sources_context", []) or []


@tool
def explore(runtime: ToolRuntime = None) -> str:
    """List all available documents in this notebook with their structure overview.

    Returns a summary of each document's hierarchical structure so you can
    understand what content is available before searching.
    """
    sources = _get_sources_context(runtime)

    if not sources:
        return "No documents available in this notebook."

    lines = []
    for source in sources:
        title = source.get("title", "Untitled")
        source_id = source.get("id", "unknown")
        index_data = source.get("index_data")

        lines.append(f"## {title} [source:{source_id}]")

        if index_data:
            summary = get_tree_summary(index_data)
            lines.append(summary)
        else:
            lines.append("  (not indexed — content available for preview only)")

        lines.append("")

    return "\n".join(lines)


@tool
def search(query: str, runtime: ToolRuntime = None) -> str:
    """Search across all notebook documents using reasoning-based retrieval.

    This searches through document tree structures using LLM reasoning,
    not keyword matching. Ask natural questions.

    Args:
        query: Natural language question or search query.

    Returns:
        Relevant sections from documents with source references for citations.
    """
    sources = _get_sources_context(runtime)

    if not sources:
        return "No documents available to search."

    results = []
    for source in sources:
        title = source.get("title", "Untitled")
        source_id = source.get("id", "unknown")
        index_data = source.get("index_data")

        if not index_data:
            continue

        try:
            sections = retrieve(query, index_data)
            for section in sections:
                results.append(
                    f"[source:{source_id} | {title}]\n{section.get('content', '')}"
                )
        except Exception as e:
            results.append(f"[source:{source_id} | {title}] Search error: {e}")

    if not results:
        return "No relevant content found for your query."

    return "\n\n---\n\n".join(results)


@tool
def read_section(
    source_id: str,
    section_path: str,
    runtime: ToolRuntime = None,
) -> str:
    """Read the full content of a specific section in a document.

    Use this for traceability — to read the actual text of a section
    referenced in search results.

    Args:
        source_id: The source ID from search results (e.g., "clxxx...").
        section_path: The node_id (e.g., "n2.1") or section title to read.

    Returns:
        The full content of the requested section.
    """
    sources = _get_sources_context(runtime)

    source = next((s for s in sources if s.get("id") == source_id), None)
    if not source:
        return f"Source {source_id} not found in this notebook."

    index_data = source.get("index_data")
    if not index_data:
        return f"Source {source_id} has no index data."

    node = find_section(index_data, section_path)
    if not node:
        return f"Section '{section_path}' not found in source {source_id}."

    title = node.get("title", "Untitled")
    summary = node.get("summary", "No summary available")
    start = node.get("start_index", "?")
    end = node.get("end_index", "?")
    node_id = node.get("node_id", "?")

    children_info = ""
    for child in node.get("nodes", []):
        child_title = child.get("title", "")
        child_summary = child.get("summary", "")
        if child_title:
            children_info += f"\n  - {child_title}: {child_summary[:200]}"

    return (
        f"## {title} (node: {node_id}, pages {start}-{end})\n\n"
        f"{summary}\n"
        f"{children_info}"
    )


pageindex_tools = [explore, search, read_section]
