"""
Chunk accumulator middleware for RAG agent.

Automatically accumulates chunks from search/probe tool results into state,
providing persistent context that the agent can reference when answering.

Based on LangChain's context engineering patterns:
- Life-cycle context: intercepts tool results
- State writes: persists chunks for future steps
- Model context: injects gathered chunks before model call
"""

import re
from typing import Callable

from langchain.agents.middleware import (
    after_tool,
    wrap_model_call,
    ToolRequest,
    ToolResponse,
    ModelRequest,
    ModelResponse,
)


def _parse_chunks(content: str, source: str) -> list[dict]:
    """Parse chunks from tool output. Format: [Doc Name | doc:ID] #chunk_id pos=N"""
    chunks = []
    parts = content.split("\n\n---\n\n")

    for part in parts:
        # Pattern: [Doc Name | doc:ID] #chunk_id pos=N
        header_match = re.match(
            r'\[([^|\]]+)(?:\s*\|\s*doc:([^\]]+))?\]\s*#(\w+)(?:\s+pos=(\d+))?',
            part
        )
        if header_match:
            doc_name = header_match.group(1).strip()
            doc_id = header_match.group(2).strip() if header_match.group(2) else None
            chunk_id = header_match.group(3)
            position = int(header_match.group(4)) if header_match.group(4) else None
            content_start = part.find("\n")
            text = part[content_start + 1:].strip() if content_start > 0 else ""

            chunks.append({
                "chunk_id": chunk_id,
                "doc_name": doc_name,
                "document_id": doc_id,
                "content": text,
                "source": source,
                "position": position,
            })

    return chunks


@after_tool
def chunk_accumulator(request: ToolRequest, response: ToolResponse) -> ToolResponse:
    """Accumulate chunks from search/probe results into state.

    This middleware intercepts tool results and extracts chunk information,
    storing it in state["gathered_chunks"] for the agent to reference.
    """
    tool_name = request.tool.name
    result_content = str(response.result)

    # Skip if error or no results
    if "Error" in result_content or "No " in result_content[:20]:
        return response

    # Parse chunks (same format for search and probe)
    new_chunks = []
    if tool_name in ("search", "probe"):
        new_chunks = _parse_chunks(result_content, source=tool_name)

    if not new_chunks:
        return response

    # Get existing chunks from state
    gathered = response.state.get("gathered_chunks", [])

    # Merge new chunks (avoid duplicates by chunk_id + source)
    existing_keys = {(c["chunk_id"], c["source"]) for c in gathered}
    for chunk in new_chunks:
        key = (chunk["chunk_id"], chunk["source"])
        if key not in existing_keys:
            gathered.append(chunk)
            existing_keys.add(key)

    # Update state with accumulated chunks
    return response.update_state({"gathered_chunks": gathered})


def _organize_chunks(chunks: list[dict]) -> str:
    """Organize chunks by document, merge related chunks, note sequence gaps.

    Returns formatted string with:
    - Chunks grouped by document (using document_id when available)
    - Related chunks (same chunk_id from search+probe) merged
    - Chunks sorted by position within document
    - Sequence gaps noted (using actual positions)
    """
    # Group by document_id (preferred) or doc_name (fallback)
    by_doc: dict[str, tuple[str, list[dict]]] = {}  # key -> (display_name, chunks)
    for chunk in chunks:
        doc_id = chunk.get("document_id")
        doc_name = chunk["doc_name"]
        # Use document_id as key if available for reliable grouping
        key = doc_id if doc_id else doc_name
        if key not in by_doc:
            by_doc[key] = (doc_name, [])
        by_doc[key][1].append(chunk)

    # Format each document's chunks
    output = []
    for key, (doc_name, doc_chunks) in by_doc.items():
        output.append(f"[{doc_name}]")

        # Group by chunk_id to merge search + probe results
        by_id: dict[str, list[dict]] = {}
        for chunk in doc_chunks:
            cid = chunk["chunk_id"]
            if cid not in by_id:
                by_id[cid] = []
            by_id[cid].append(chunk)

        # Get best position for each chunk group (prefer non-None)
        def get_best_position(chunks_list: list[dict]) -> int | None:
            for c in chunks_list:
                if c.get("position") is not None:
                    return c["position"]
            return None

        # Sort chunk groups by position (if available)
        sorted_ids = sorted(
            by_id.keys(),
            key=lambda cid: get_best_position(by_id[cid]) if get_best_position(by_id[cid]) is not None else float("inf")
        )

        # Check for sequence gaps using actual positions
        positions = sorted([get_best_position(by_id[cid]) for cid in sorted_ids if get_best_position(by_id[cid]) is not None])
        has_gaps = False
        if len(positions) > 1:
            for i in range(1, len(positions)):
                if positions[i] - positions[i-1] > 1:
                    has_gaps = True
                    break

        if has_gaps:
            output.append("  (Note: chunks are non-consecutive - may have gaps)")

        # Format each chunk group
        for chunk_id in sorted_ids:
            related = by_id[chunk_id]
            pos = get_best_position(related)
            pos_str = f" @{pos}" if pos is not None else ""

            # Merge content from search and probe
            search_content = next((c["content"] for c in related if c["source"] == "search"), None)
            probe_content = next((c["content"] for c in related if c["source"] == "probe"), None)

            output.append(f"  #{chunk_id}{pos_str}:")
            if search_content:
                output.append(f"    [searched] {search_content[:300]}{'...' if len(search_content) > 300 else ''}")
            if probe_content:
                output.append(f"    [probed] {probe_content[:300]}{'...' if len(probe_content) > 300 else ''}")

        output.append("")  # Blank line between documents

    # Add note about potential gaps
    if len(by_doc) > 1:
        output.append("Note: Chunks are from multiple documents - verify context consistency.")

    return "\n".join(output)


@wrap_model_call
def inject_gathered_chunks(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """Inject gathered chunks into context before model call.

    Organizes chunks by document and merges search+probe results for the same chunk.
    """
    gathered = request.state.get("gathered_chunks", [])

    if not gathered:
        return handler(request)

    # Organize chunks by document and merge related
    organized = _organize_chunks(gathered)
    chunk_ids = list({c["chunk_id"] for c in gathered})

    context_reminder = f"""== Gathered Evidence ({len(gathered)} items, {len(chunk_ids)} unique chunks) ==

{organized}

Use [ref:CHUNK_ID] to cite. Only cite chunks that are relevant to the question."""

    # Inject as system message before recent messages
    messages = [
        *request.messages[:-1],  # All but last message
        {"role": "system", "content": context_reminder},
        request.messages[-1],  # Last user message
    ]
    request = request.override(messages=messages)

    return handler(request)
