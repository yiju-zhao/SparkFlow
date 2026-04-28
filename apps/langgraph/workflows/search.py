"""Search workflow — plain async, NOT Functional API.

Three source_types:
- "web": Tavily single-shot
- "wechat" / "publication": pgvector prefilter (Next.js) → semops rank

Pure HTTP orchestration. No LLM here; LLM ranking happens inside semops.
NOT @entrypoint — single chain, no parallelism, no checkpoint payoff.
"""

from __future__ import annotations

import json
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
    source_type: str
    notebook_id: str | None = None
    domains: list[str] = field(default_factory=list)
    model_provider: str = "openai"
    model_name: str = "gpt-4o-mini"
    api_key: str | None = None
    tavily_api_key: str | None = None
    top_k: int = DEFAULT_TOP_K


@dataclass
class SearchResponse:
    items: list[dict[str, Any]]
    reasons: dict[str, str] = field(default_factory=dict)


async def search(req: SearchRequest) -> SearchResponse:
    if req.source_type == "web":
        items = await _web_search(req)
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
    return SearchResponse(items=ranked.get("ranked", []), reasons=ranked.get("reasons") or {})


async def _web_search(req: SearchRequest) -> list[dict[str, Any]]:
    from tools.web import search_web

    raw = search_web.invoke(
        {
            "query": req.query,
            "domains": req.domains or None,
            "api_key": req.tavily_api_key,
        }
    )
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
    normalized: list[dict[str, Any]] = []
    for c in candidates:
        if "match_text" in c:
            normalized.append(c)
        elif "text" in c:
            renamed = dict(c)
            renamed["match_text"] = renamed.pop("text")
            normalized.append(renamed)
        else:
            normalized.append(c)
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
