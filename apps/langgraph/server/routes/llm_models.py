"""POST /v1/workflows/llm/list-models — proxy to upstream provider /v1/models.

Replaces the old /v1/llm/models gateway endpoint with a litellm-free path.
Filters to chat-capable models (drops embedding/tts/whisper/etc.).
"""

from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


NON_CHAT_SUBSTRINGS = (
    "embedding",
    "tts",
    "whisper",
    "dall-e",
    "audio",
    "image",
    "realtime",
    "imagen",
    "veo",
    "cogview",
    "cogvideo",
    "moderation",
    "rerank",
)


def _verify_token(x_internal_token: str = Header(default="")) -> None:
    expected = os.getenv("INTERNAL_CALLBACK_TOKEN", "")
    if not expected or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _is_chat_model(model_id: str) -> bool:
    lower = model_id.lower()
    return not any(s in lower for s in NON_CHAT_SUBSTRINGS)


class ListModelsRequest(BaseModel):
    providerId: str
    apiKey: str
    baseUrl: Optional[str] = None


class ListModelsResponse(BaseModel):
    models: list[str]


@router.post(
    "/v1/workflows/llm/list-models",
    response_model=ListModelsResponse,
    dependencies=[Depends(_verify_token)],
)
async def list_models(req: ListModelsRequest):
    base = (req.baseUrl or "https://api.openai.com/v1").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{base}/models",
                headers={"Authorization": f"Bearer {req.apiKey}"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Upstream {req.providerId}: {exc.response.text[:200]}",
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Upstream error: {exc}")

    ids = [m.get("id") for m in (data.get("data") or []) if m.get("id")]
    return {"models": [m for m in ids if _is_chat_model(m)]}
