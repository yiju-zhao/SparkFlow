"""Daily Digest workflow — Functional API parallelization (ref doc §Parallelization).

Per-query prefilter calls run in parallel via [task(q) for q in enabled];
results aggregate with sync .result() per ref doc idiom (NOT `await f.result()`,
which breaks the deterministic-replay contract).
"""
from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from langgraph.func import entrypoint, task

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")
SEMOPS_API_URL = os.getenv("SEMOPS_API_URL", "http://localhost:2025")
POOL_CAP = 30


@dataclass
class GenerateSectionRequest:
    section_id: str
    source_type: str
    digest_date: str
    queries: list[dict[str, Any]]
    subscribed_source_ids: list[int]
    top_n: int
    model_provider: str
    model_name: str
    api_key: str
    api_base: str | None = None


# ---------------------------------------------------------------------------
# Implementation helpers — named at module scope so tests can monkeypatch them.
# The @task wrappers below call these so tests don't have to reach into
# the task internals.
# ---------------------------------------------------------------------------


async def _prefilter_query_impl(query_text: str, source_ids: list[int]) -> list[dict[str, Any]]:
    payload: dict[str, Any] = {"query": query_text, "limit": POOL_CAP}
    if source_ids:
        payload["source_ids"] = source_ids
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SPARKFLOW_API_URL}/api/explore/search/wechat/prefilter", json=payload,
        )
        resp.raise_for_status()
        return list(resp.json().get("candidates") or [])


async def _semops_rank_impl(*, candidates, query, top_k, provider, model, api_key,
                            api_base=None) -> dict[str, Any]:
    normalized = []
    for c in candidates:
        if "match_text" in c:
            normalized.append(c)
        elif "text" in c:
            renamed = dict(c)
            renamed["match_text"] = renamed.pop("text")
            normalized.append(renamed)
        else:
            normalized.append(c)
    lm_config: dict[str, Any] = {"provider": provider, "model": model, "api_key": api_key}
    if api_base:
        lm_config["api_base"] = api_base
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{SEMOPS_API_URL}/api/operators/rank",
            json={"candidates": normalized, "query_text": query, "top_k": top_k,
                  "include_reasons": True, "lm_config": lm_config},
        )
        resp.raise_for_status()
        return resp.json()


async def _callback_impl(section_id: str, status: str, *, items=None, model_used=None,
                          error=None, completed_at=None) -> None:
    payload: dict[str, Any] = {"status": status}
    if items is not None: payload["items"] = items
    if model_used is not None: payload["model_used"] = model_used
    if error is not None: payload["error"] = error
    if completed_at is not None: payload["completed_at"] = completed_at
    internal_token = os.getenv("INTERNAL_CALLBACK_TOKEN", "")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SPARKFLOW_API_URL}/api/digest/sections/{section_id}/complete",
            json=payload,
            headers={"X-Internal-Token": internal_token} if internal_token else {},
        )
        resp.raise_for_status()


# ---------------------------------------------------------------------------
# Functional API tasks
# ---------------------------------------------------------------------------


@task
async def prefilter_query(query_text: str, source_ids: list[int]) -> list[dict[str, Any]]:
    return await _prefilter_query_impl(query_text, source_ids)


@task
def merge_pool(per_query_results: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Union + dedupe by id; keep highest score; track matched_queries; cap at POOL_CAP."""
    seen: dict[int, dict[str, Any]] = {}
    for batch in per_query_results:
        for art in batch:
            art_id = art.get("id")
            if art_id is None:
                continue
            existing = seen.get(art_id)
            if existing is None:
                seen[art_id] = dict(art)
                seen[art_id].setdefault("matched_queries", [])
                existing = seen[art_id]
            existing_score = existing.get("score") or 0.0
            new_score = art.get("score") or 0.0
            if new_score > existing_score:
                existing["score"] = new_score
    pool = list(seen.values())
    pool.sort(key=lambda a: a.get("score") or 0.0, reverse=True)
    return pool[:POOL_CAP]


@task
async def semops_rank(candidates, query_text, top_k, provider, model, api_key,
                      api_base=None) -> dict[str, Any]:
    return await _semops_rank_impl(
        candidates=candidates, query=query_text, top_k=top_k,
        provider=provider, model=model, api_key=api_key, api_base=api_base,
    )


@task
async def callback(section_id: str, status: str, **kw) -> None:
    await _callback_impl(section_id, status, **kw)


# ---------------------------------------------------------------------------
# Helpers (pure, not @task)
# ---------------------------------------------------------------------------


def _build_candidate_text(article: dict[str, Any]) -> str:
    title = article.get("title") or ""
    author = article.get("author") or ""
    source = article.get("source_name") or ""
    content = (article.get("content_text") or "")[:300]
    return f"Title: {title} | Author: {author} | Source: {source} | Summary: {content}"


def _to_digest_items(pool: list[dict[str, Any]], ranked_result: dict[str, Any]) -> list[dict[str, Any]]:
    index_by_id = {a["id"]: a for a in pool if "id" in a}
    ranked_items = ranked_result.get("ranked") or []
    reasons = ranked_result.get("reasons") or {}
    items = []
    for position, ri in enumerate(ranked_items, start=1):
        item_id = ri.get("id")
        original = index_by_id.get(item_id, {})
        reason = reasons.get(str(item_id)) or ""
        items.append({
            "rank": position, "externalId": str(item_id), "sourceRefId": item_id,
            "sourceName": original.get("source_name") or "",
            "title": original.get("title") or "",
            "author": original.get("author") or None,
            "publishedAt": original.get("publish_time") or "",
            "url": original.get("url") or "",
            "score": float(original.get("score") or 0.0),
            "matchedQueries": original.get("matched_queries") or [],
            "reason": reason,
            "summary": (original.get("content_text") or "")[:300],
            "meta": {"cover_url": original.get("cover_url")},
        })
    return items


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


@entrypoint()
async def generate_section(req: GenerateSectionRequest) -> None:
    """Functional API parallelization. langgraph 1.1.x: @task returns an
    awaitable Future; gather the parallel prefilter calls with asyncio.gather.
    """
    enabled = [q for q in req.queries if q.get("enabled")]
    futures = [prefilter_query(q["text"], req.subscribed_source_ids) for q in enabled]
    per_query_results = await asyncio.gather(*futures) if futures else []
    pool = await merge_pool(per_query_results)

    if not pool:
        await callback(req.section_id, "EMPTY", items=[])
        return

    semops_candidates = [
        {"id": a["id"], "text": _build_candidate_text(a)}
        for a in pool if "id" in a
    ]
    joint_query = " ".join(q["text"] for q in enabled)
    try:
        ranked_result = await semops_rank(
            semops_candidates, joint_query, req.top_n,
            req.model_provider, req.model_name, req.api_key, req.api_base,
        )
    except Exception as exc:
        await callback(req.section_id, "FAILED", error=str(exc))
        return

    items = _to_digest_items(pool, ranked_result)
    await callback(
        req.section_id, "COMPLETED",
        items=items, model_used=f"{req.model_provider}/{req.model_name}",
        completed_at=datetime.now(tz=timezone.utc).isoformat(),
    )
