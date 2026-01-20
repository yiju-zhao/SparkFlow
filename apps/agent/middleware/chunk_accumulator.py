"""
Chunk accumulator middleware for RAG agent.

Automatically accumulates chunks from search/probe tool results,
providing persistent context that the agent can reference when answering.

Uses @wrap_model_call to:
1. Parse chunks from tool messages in conversation history
2. Inject organized chunks into context before model call
"""

import re
from typing import Callable

from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse


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


def _extract_chunks_from_messages(messages: list) -> list[dict]:
    """Extract chunks from tool messages in conversation history."""
    gathered = []
    seen_keys = set()

    for msg in messages:
        # Handle both dict and LangChain message objects
        if isinstance(msg, dict):
            msg_type = msg.get("role") or msg.get("type")
            tool_name = msg.get("name", "")
            content = msg.get("content", "")
        else:
            # LangChain message object
            msg_type = getattr(msg, "type", None)
            tool_name = getattr(msg, "name", "")
            content = getattr(msg, "content", "")

        # Tool messages have type="tool"
        if msg_type != "tool":
            continue

        if tool_name not in ("search", "probe"):
            continue

        if not content or "Error" in content or content.startswith("No "):
            continue

        chunks = _parse_chunks(content, source=tool_name)
        for chunk in chunks:
            key = (chunk["chunk_id"], chunk["source"])
            if key not in seen_keys:
                gathered.append(chunk)
                seen_keys.add(key)

    return gathered


def _organize_chunks(chunks: list[dict]) -> str:
    """Organize chunks by document, merge related chunks, note sequence gaps."""
    # Group by document_id (preferred) or doc_name (fallback)
    by_doc: dict[str, tuple[str, list[dict]]] = {}
    for chunk in chunks:
        doc_id = chunk.get("document_id")
        doc_name = chunk["doc_name"]
        key = doc_id if doc_id else doc_name
        if key not in by_doc:
            by_doc[key] = (doc_name, [])
        by_doc[key][1].append(chunk)

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

        def get_best_position(chunks_list: list[dict]) -> int | None:
            for c in chunks_list:
                if c.get("position") is not None:
                    return c["position"]
            return None

        sorted_ids = sorted(
            by_id.keys(),
            key=lambda cid: get_best_position(by_id[cid]) if get_best_position(by_id[cid]) is not None else float("inf")
        )

        # Check for sequence gaps
        positions = sorted([get_best_position(by_id[cid]) for cid in sorted_ids if get_best_position(by_id[cid]) is not None])
        has_gaps = len(positions) > 1 and any(positions[i] - positions[i-1] > 1 for i in range(1, len(positions)))

        if has_gaps:
            output.append("  (Note: chunks are non-consecutive - may have gaps)")

        for chunk_id in sorted_ids:
            related = by_id[chunk_id]
            pos = get_best_position(related)
            pos_str = f" @{pos}" if pos is not None else ""

            search_content = next((c["content"] for c in related if c["source"] == "search"), None)
            probe_content = next((c["content"] for c in related if c["source"] == "probe"), None)

            output.append(f"  #{chunk_id}{pos_str}:")
            if search_content:
                output.append(f"    [searched] {search_content[:300]}{'...' if len(search_content) > 300 else ''}")
            if probe_content:
                output.append(f"    [probed] {probe_content[:300]}{'...' if len(probe_content) > 300 else ''}")

        output.append("")

    if len(by_doc) > 1:
        output.append("Note: Chunks are from multiple documents - verify context consistency.")

    return "\n".join(output)


@wrap_model_call
async def inject_gathered_chunks(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """Parse chunks from tool messages and inject organized context before model call."""
    # Extract chunks from all tool messages in conversation
    gathered = _extract_chunks_from_messages(request.messages)

    if not gathered:
        return await handler(request)

    organized = _organize_chunks(gathered)
    chunk_ids = list({c["chunk_id"] for c in gathered})

    context_reminder = f"""== Gathered Evidence ({len(gathered)} items, {len(chunk_ids)} unique chunks) ==

{organized}

Use [ref:CHUNK_ID] to cite. Only cite chunks that are relevant to the question."""

    # Append context at end (as user message to avoid breaking tool_call sequences)
    messages = [
        *request.messages,
        {"role": "user", "content": context_reminder},
    ]
    request = request.override(messages=messages)

    return await handler(request)
