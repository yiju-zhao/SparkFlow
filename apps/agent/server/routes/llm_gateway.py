"""LLM gateway — Node-side BYOK chat completions and model-list passthrough.

Why this exists: apps/web runs in an environment whose outbound TLS to
LLM providers (api.openai.com, api.deepseek.com, generativelanguage…)
either goes through a TLS-intercepting corporate proxy or is blocked
outright. Python on the same host already has working httpx + CA
trust, so we centralize every BYOK upstream call here.

Endpoints:
  POST /v1/llm/chat/completions   OpenAI-compatible passthrough
  POST /v1/llm/models              upstream /v1/models proxy

Both require a shared internal token in the `X-Internal-Token` header
that matches INTERNAL_CALLBACK_TOKEN. The BYOK key + base URL travel
in the request body so they're never logged or cached at the proxy.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import httpx
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field


logger = logging.getLogger(__name__)
router = APIRouter()


# --- shared helpers -----------------------------------------------------

NON_CHAT_MODEL_SUBSTRINGS = (
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


def _redact(text: str, secret: str) -> str:
    if not secret or len(secret) < 4:
        return text
    return text.replace(secret, "***")


def _verify_token(token: str | None) -> None:
    expected = os.getenv("INTERNAL_CALLBACK_TOKEN", "")
    if not expected or not token or token != expected:
        # Generic 401, never explains which side mismatched.
        raise HTTPException(status_code=401, detail="Unauthorized")


def _is_chat_model(model_id: str) -> bool:
    lower = model_id.lower()
    return not any(s in lower for s in NON_CHAT_MODEL_SUBSTRINGS)


# --- /v1/llm/models -----------------------------------------------------


class ListModelsRequest(BaseModel):
    providerId: str
    apiKey: str
    baseUrl: str | None = None


class ListModelsResponse(BaseModel):
    providerId: str
    models: list[str]


# Built-in provider baseURLs. Mirrors apps/web/lib/types/providers.ts so the
# Node side can pass providerId only and let Python resolve the URL.
_BUILTIN_BASE_URLS: dict[str, str] = {
    "openai": "https://api.openai.com/v1",
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai",
    "deepseek": "https://api.deepseek.com/v1",
    "glm": "https://open.bigmodel.cn/api/paas/v4",
    "minimax": "https://api.minimax.chat/v1",
    "kimi": "https://api.moonshot.cn/v1",
}

# Minimax doesn't expose /v1/models — return a hand-curated list instead.
# Keep in sync with apps/web/lib/types/providers.ts:fallbackModels.
_MINIMAX_FALLBACK = [
    "MiniMax-M2.7",
    "MiniMax-M2.7-highspeed",
    "MiniMax-M2.5",
    "MiniMax-M2.5-highspeed",
    "MiniMax-M2.1",
]

_PRIVATE_HOST_RE = re.compile(
    r"^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.|::1|fc|fd|fe80)",
    re.IGNORECASE,
)


def _assert_safe_url(raw: str) -> str:
    """SSRF guard — reject loopback / RFC1918 / link-local."""
    parsed = httpx.URL(raw)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail=f"Unsupported protocol {parsed.scheme}")
    host = (parsed.host or "").lower()
    if host.endswith(".local") or host.endswith(".internal") or _PRIVATE_HOST_RE.match(host):
        raise HTTPException(status_code=400, detail=f"Private host '{host}' is not allowed")
    return str(parsed)


@router.post("/v1/llm/models", response_model=ListModelsResponse)
async def list_models(
    body: ListModelsRequest,
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> ListModelsResponse:
    _verify_token(x_internal_token)

    # Minimax has no /v1/models endpoint per official docs.
    if body.providerId == "minimax":
        return ListModelsResponse(
            providerId=body.providerId,
            models=[m for m in _MINIMAX_FALLBACK if _is_chat_model(m)],
        )

    base_url = body.baseUrl or _BUILTIN_BASE_URLS.get(body.providerId)
    if not base_url:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown provider '{body.providerId}' and no baseUrl provided",
        )
    base_url = _assert_safe_url(base_url).rstrip("/")
    url = f"{base_url}/models"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {body.apiKey}",
                    "Accept": "application/json",
                },
            )
    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail={"code": "TIMEOUT", "providerId": body.providerId, "message": "Provider /models timed out"},
        )
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "NETWORK_ERROR",
                "providerId": body.providerId,
                "message": _redact(str(exc), body.apiKey),
            },
        )

    if res.status_code in (401, 403):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_KEY",
                "providerId": body.providerId,
                "upstreamStatus": res.status_code,
                "message": f"Provider rejected the API key (HTTP {res.status_code})",
            },
        )
    if res.status_code >= 400:
        raise HTTPException(
            status_code=502,
            detail={
                "code": "BAD_RESPONSE",
                "providerId": body.providerId,
                "upstreamStatus": res.status_code,
                "message": _redact(res.text, body.apiKey)[:500],
            },
        )

    try:
        payload: dict[str, Any] = res.json()
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail={"code": "BAD_RESPONSE", "providerId": body.providerId, "message": "Non-JSON response"},
        )

    raw_models = payload.get("data") or []
    if not isinstance(raw_models, list):
        raise HTTPException(
            status_code=502,
            detail={"code": "BAD_RESPONSE", "providerId": body.providerId, "message": "Missing data[]"},
        )

    ids = sorted(
        m["id"]
        for m in raw_models
        if isinstance(m, dict) and isinstance(m.get("id"), str) and m["id"]
    )
    return ListModelsResponse(
        providerId=body.providerId,
        models=[i for i in ids if _is_chat_model(i)],
    )


# --- /v1/llm/chat/completions ------------------------------------------


@router.post("/v1/llm/chat/completions")
async def chat_completions(
    body: dict[str, Any],
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
    x_byok_provider: str | None = Header(default=None, alias="X-Byok-Provider"),
    x_byok_key: str | None = Header(default=None, alias="X-Byok-Key"),
    x_byok_base_url: str | None = Header(default=None, alias="X-Byok-Base-Url"),
) -> dict[str, Any]:
    """OpenAI-compatible chat completions, forwarded via LiteLLM.

    The Node caller passes its BYOK info in headers (so request bodies
    can be logged for debugging without leaking keys). The body itself
    is the standard OpenAI chat/completions shape — `model`, `messages`,
    `temperature`, `max_tokens`, `tools`, etc.
    """
    _verify_token(x_internal_token)
    if not x_byok_provider or not x_byok_key:
        raise HTTPException(
            status_code=400,
            detail="Missing X-Byok-Provider / X-Byok-Key headers",
        )
    model = body.get("model")
    if not isinstance(model, str) or not model:
        raise HTTPException(status_code=400, detail="Body must include `model`")

    if x_byok_base_url:
        _assert_safe_url(x_byok_base_url)

    # Lazy import — litellm has heavy module-level init we don't want to
    # pay for in cold-start of unrelated routes.
    import litellm  # type: ignore

    # LiteLLM uses "{provider}/{model}" routing; the providers we support
    # are all OpenAI-compatible, so we go through the openai adapter and
    # let `api_base` / `api_key` steer the request to the right host.
    # The provider id in `model` only matters for cost-tracking, which
    # we don't use server-side.
    litellm_model = f"openai/{model}"

    try:
        response = await litellm.acompletion(
            model=litellm_model,
            api_key=x_byok_key,
            api_base=x_byok_base_url,
            **{k: v for k, v in body.items() if k != "model"},
        )
    except litellm.AuthenticationError as exc:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "INVALID_KEY",
                "providerId": x_byok_provider,
                "message": _redact(str(exc), x_byok_key),
            },
        )
    except litellm.Timeout as exc:
        raise HTTPException(
            status_code=504,
            detail={
                "code": "TIMEOUT",
                "providerId": x_byok_provider,
                "message": _redact(str(exc), x_byok_key),
            },
        )
    except Exception as exc:  # noqa: BLE001 — broad on purpose
        logger.exception("[llm-gateway] chat completion failed")
        raise HTTPException(
            status_code=502,
            detail={
                "code": "UPSTREAM_ERROR",
                "providerId": x_byok_provider,
                "message": _redact(str(exc), x_byok_key),
            },
        )

    # `response` is a litellm ModelResponse. Its .model_dump() gives the
    # OpenAI-shaped JSON the Node client (using OpenAI SDK) expects.
    if hasattr(response, "model_dump"):
        return response.model_dump()
    return response  # type: ignore[return-value]
