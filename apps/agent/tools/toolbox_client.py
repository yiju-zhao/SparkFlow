"""Helpers for calling the GenAI Toolbox MCP server."""

from __future__ import annotations

import json
import os
from typing import Any

from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client

DEFAULT_TOOLBOX_URL = os.getenv("TOOLBOX_SERVER_URL", "http://localhost:5000")


def _coerce_toolbox_result(result: Any) -> Any:
    structured = getattr(result, "structuredContent", None)
    if structured is not None:
        return structured

    content = getattr(result, "content", None)
    if isinstance(content, list):
        text_blocks: list[str] = []
        for block in content:
            text = getattr(block, "text", None)
            if isinstance(text, str) and text.strip():
                text_blocks.append(text)
                continue
            if isinstance(block, dict):
                block_text = block.get("text")
                if isinstance(block_text, str) and block_text.strip():
                    text_blocks.append(block_text)
        if len(text_blocks) == 1:
            try:
                return json.loads(text_blocks[0])
            except json.JSONDecodeError:
                return text_blocks[0]
        if text_blocks:
            return {"text": "\n\n".join(text_blocks)}

    if hasattr(result, "model_dump"):
        return result.model_dump()
    return result


async def call_toolbox_tool(name: str, arguments: dict[str, Any] | None = None) -> Any:
    """Call a tool on the configured Toolbox MCP server."""
    args = arguments or {}
    async with streamable_http_client(DEFAULT_TOOLBOX_URL) as (read_stream, write_stream, _):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            result = await session.call_tool(name, args)
            return _coerce_toolbox_result(result)
