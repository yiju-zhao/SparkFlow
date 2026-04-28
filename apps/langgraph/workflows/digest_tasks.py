"""ARQ task adapter for daily-digest generation."""

from __future__ import annotations

from typing import Any

from workflows.daily_digest import GenerateSectionRequest, generate_section


async def arq_generate_section(ctx: dict, payload: dict[str, Any]) -> Any:
    _ = ctx  # ARQ protocol; unused here.
    req = GenerateSectionRequest(**payload)
    return await generate_section.ainvoke(req)
