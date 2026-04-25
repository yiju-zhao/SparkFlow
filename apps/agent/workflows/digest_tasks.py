"""ARQ task adapters for daily-digest generation.

Thin by design: each `arq_*` function deserializes the payload back into the
existing `GenerateSectionRequest` dataclass and delegates to the unchanged
business logic in `workflows.daily_digest`. No new workflow semantics live
here — this module is the persistence / retry boundary only.
"""

from __future__ import annotations

from typing import Any

from workflows import daily_digest
from workflows.daily_digest import GenerateSectionRequest


async def arq_generate_section(ctx: dict, payload: dict[str, Any]) -> dict[str, Any]:
    """ARQ task entrypoint: run a daily-digest section generation.

    Args:
        ctx: ARQ worker context (unused — ARQ's function-signature contract).
        payload: Serialized `GenerateSectionRequest` fields.

    Returns:
        Whatever `generate_section` returns.
    """
    _ = ctx  # ARQ protocol; unused here.
    req = GenerateSectionRequest(**payload)
    return await daily_digest.generate_section(req)
