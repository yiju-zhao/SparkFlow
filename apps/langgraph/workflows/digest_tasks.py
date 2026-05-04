"""ARQ task adapter for daily-digest generation.

Forwards the picked-up job to workflows-api over HTTP rather than importing
``daily_digest`` directly. This keeps the digest-worker container a thin
arq+httpx shim with no langgraph/langchain runtime — those live behind the
workflows-api process. See ``apps/langgraph/Dockerfile.worker``.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

# WORKFLOWS_API_URL points at the workflows-api this worker should call.
# In dev compose: http://host.docker.internal:2027 (workflows-api runs on
# host). In prod compose with profile=prod: http://workflows-api:2027.
WORKFLOWS_API_URL = os.getenv("WORKFLOWS_API_URL", "http://localhost:2027")

# Generous timeout: a section's LOTUS rank + LLM calls can take several
# minutes for large pools. Aligned with the arq max_tries budget — one
# failed attempt should be a real failure, not a timeout race.
_RUN_TIMEOUT_S = float(os.getenv("DIGEST_RUN_TIMEOUT", "600"))


async def arq_generate_section(ctx: dict, payload: dict[str, Any]) -> Any:
    _ = ctx  # ARQ protocol; unused here.
    section_id = payload.get("section_id")
    if not section_id:
        raise ValueError("payload missing section_id")

    # INTERNAL_CALLBACK_TOKEN must match the workflows-api side. No fallback:
    # a missing token here means the request will be rejected with 500 on
    # the receiving end, which is the desired loud failure.
    token = os.getenv("INTERNAL_CALLBACK_TOKEN", "")
    headers = {"X-Internal-Token": token} if token else {}

    async with httpx.AsyncClient(timeout=_RUN_TIMEOUT_S) as client:
        resp = await client.post(
            f"{WORKFLOWS_API_URL}/v1/workflows/daily_digest/sections/{section_id}/run",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        return resp.json()
