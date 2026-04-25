"""Search workflow.

Three source_types:
- ``web``: Tavily single-shot; returns top Tavily results as-is.
- ``wechat`` / ``publication``: pgvector prefilter (via Next.js /api/explore/search/<type>/prefilter)
  → semops /operators/rank for ranking + reasons.

Pure Python — HTTP orchestration only. No LLM calls in this file; the
LLM work happens inside ``semops /operators/rank``.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

import httpx


SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")
SEMOPS_API_URL = os.getenv("SEMOPS_API_URL", "http://localhost:2025")
PREFILTER_LIMIT = 80
DEFAULT_TOP_K = 10


@dataclass
class SearchRequest:
    query: str
    source_type: str                     # "web" | "wechat" | "publication"
    notebook_id: str | None = None
    domains: list[str] = field(default_factory=list)
    model_provider: str = "openai"
    model_name: str = "gpt-4o-mini"
    api_key: str | None = None
    top_k: int = DEFAULT_TOP_K


@dataclass
class SearchResponse:
    items: list[dict[str, Any]]
    reasons: dict[str, str] = field(default_factory=dict)


async def run(req: SearchRequest) -> SearchResponse:
    if req.source_type == "web":
        items = await _invoke_web_search(req)
        return SearchResponse(items=items)

    if req.source_type not in ("wechat", "publication"):
        raise ValueError(f"Unsupported source_type: {req.source_type!r}")

    candidates = await _prefilter(req.source_type, req.query, PREFILTER_LIMIT)
    if not candidates:
        return SearchResponse(items=[])

    ranked = await _semops_rank(
        candidates=candidates,
        query=req.query,
        top_k=req.top_k,
        provider=req.model_provider,
        model=req.model_name,
        api_key=req.api_key,
    )
    return SearchResponse(
        items=ranked.get("ranked", []),
        reasons=ranked.get("reasons") or {},
    )


async def _invoke_web_search(req: SearchRequest) -> list[dict[str, Any]]:
    """Run Tavily through the tools.web.search_web @tool (reuses the API key
    resolution in there). Returns list of {title, url, content} dicts.
    """
    from tools.web import search_web
    import json

    raw = search_web.invoke({"query": req.query, "domains": req.domains or None})
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if isinstance(parsed, dict) and "error" in parsed:
        return []
    return list(parsed)[: req.top_k]


async def _prefilter(source_type: str, query: str, limit: int) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SPARKFLOW_API_URL}/api/explore/search/{source_type}/prefilter",
            json={"query": query, "limit": limit},
        )
        resp.raise_for_status()
        return list(resp.json().get("candidates") or [])


async def _semops_rank(
    *,
    candidates: list[dict[str, Any]],
    query: str,
    top_k: int,
    provider: str,
    model: str,
    api_key: str,
    api_base: str | None = None,
) -> dict[str, Any]:
    """POST to semops /api/operators/rank.

    The semops contract requires each candidate to carry a ``match_text``
    field and the request to carry a ``query_text`` field. Callers may
    pass candidates keyed by ``text``; this function renames that to
    ``match_text`` before sending.

    ``api_key`` is required — semops has no env-key fallback. Callers
    must resolve the user's BYOK before invoking.
    """

    normalized: list[dict[str, Any]] = []
    for c in candidates:
        if "match_text" in c:
            normalized.append(c)
        elif "text" in c:
            renamed = dict(c)
            renamed["match_text"] = renamed.pop("text")
            normalized.append(renamed)
        else:
            normalized.append(c)  # let semops' validator complain

    lm_config: dict[str, Any] = {
        "provider": provider,
        "model": model,
        "api_key": api_key,
    }
    if api_base:
        lm_config["api_base"] = api_base

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{SEMOPS_API_URL}/api/operators/rank",
            json={
                "candidates": normalized,
                "query_text": query,
                "top_k": top_k,
                "include_reasons": True,
                "lm_config": lm_config,
            },
        )
        resp.raise_for_status()
        return resp.json()
