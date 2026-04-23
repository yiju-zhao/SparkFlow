"""Daily Digest workflow.

Per-section pipeline for generating a user's daily digest:
  1. Prefilter wechat articles via Next.js /api/explore/search/wechat/prefilter
     for each enabled query (union + dedupe by article id, capped at 30).
  2. If pool is empty, callback to Next.js with status=EMPTY and return.
  3. Assemble candidate text: "Title: {t} | Author: {a} | Source: {s} | Summary: {c[:300]}"
  4. Call semops /api/operators/rank with the candidates + joint query + model config.
  5. Transform ranked output into DigestItem-shaped dicts; attach meta.cover_url.
  6. Callback to Next.js with status=COMPLETED + items.

Error path: any exception in steps 1-5 → callback with status=FAILED + error string.

Module-level helper functions (_prefilter_wechat, _semops_rank, _complete_section)
are named at module scope so tests can monkeypatch them.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")
SEMOPS_API_URL = os.getenv("SEMOPS_API_URL", "http://localhost:2025")

# Maximum candidates pulled from the wechat prefilter pool (union across queries)
POOL_CAP = 30


@dataclass
class GenerateSectionRequest:
    """Request body for triggering generation of one digest section."""

    section_id: str
    source_type: str                          # "WECHAT" (only v1 value)
    digest_date: str                          # "YYYY-MM-DD"
    queries: list[dict[str, Any]]             # [{id, text, enabled}]
    subscribed_source_ids: list[int]          # empty = all sources
    top_n: int                                # 1..10
    model_provider: str
    model_name: str
    api_key: str | None = None


# ---------------------------------------------------------------------------
# Module-level helpers — named so monkeypatch can target them in tests
# ---------------------------------------------------------------------------


async def _prefilter_wechat(
    queries: list[dict[str, Any]],
    subscribed_source_ids: list[int],
) -> list[dict[str, Any]]:
    """Call Next.js prefilter for each enabled query; union + dedupe by id.

    Returns up to POOL_CAP articles, each with at least:
      id, title, source_name, author, content_text, url, publish_time,
      cover_url, score, matched_queries (list[str]).
    """
    enabled = [q for q in queries if q.get("enabled")]
    if not enabled:
        return []

    seen: dict[int, dict[str, Any]] = {}

    async with httpx.AsyncClient(timeout=30) as client:
        for query in enabled:
            payload: dict[str, Any] = {
                "query": query["text"],
                "limit": POOL_CAP,
            }
            if subscribed_source_ids:
                payload["source_ids"] = subscribed_source_ids

            resp = await client.post(
                f"{SPARKFLOW_API_URL}/api/explore/search/wechat/prefilter",
                json=payload,
            )
            resp.raise_for_status()
            candidates = resp.json().get("candidates") or []

            for article in candidates:
                art_id = article.get("id")
                if art_id is None:
                    continue
                if art_id not in seen:
                    seen[art_id] = dict(article)
                    seen[art_id].setdefault("matched_queries", [])

                # Track which queries matched this article
                existing = seen[art_id]
                matched = existing.setdefault("matched_queries", [])
                if query["text"] not in matched:
                    matched.append(query["text"])

                # Keep highest score across queries
                existing_score = existing.get("score") or 0.0
                new_score = article.get("score") or 0.0
                if new_score > existing_score:
                    existing["score"] = new_score

    pool = list(seen.values())
    # Sort by score desc, cap at POOL_CAP
    pool.sort(key=lambda a: a.get("score") or 0.0, reverse=True)
    return pool[:POOL_CAP]


async def _semops_rank(
    *,
    candidates: list[dict[str, Any]],
    query: str,
    top_k: int,
    provider: str,
    model: str,
    api_key: str | None,
) -> dict[str, Any]:
    """Call semops /api/operators/rank and return raw JSON response."""
    model_config: dict[str, Any] = {"provider": provider, "model": model}
    if api_key:
        model_config["api_key"] = api_key

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{SEMOPS_API_URL}/api/operators/rank",
            json={
                "candidates": candidates,
                "text_field": "text",
                "query": query,
                "top_k": top_k,
                "include_reasons": True,
                "model_config": model_config,
            },
        )
        resp.raise_for_status()
        return resp.json()


async def _complete_section(
    *,
    section_id: str,
    status: str,
    items: list[dict[str, Any]] | None = None,
    model_used: str | None = None,
    error: str | None = None,
    completed_at: str | None = None,
) -> None:
    """POST completion results back to Next.js digest callback endpoint."""
    payload: dict[str, Any] = {"status": status}
    if items is not None:
        payload["items"] = items
    if model_used is not None:
        payload["model_used"] = model_used
    if error is not None:
        payload["error"] = error
    if completed_at is not None:
        payload["completed_at"] = completed_at

    internal_token = os.getenv("INTERNAL_CALLBACK_TOKEN", "")

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SPARKFLOW_API_URL}/api/digest/sections/{section_id}/complete",
            json=payload,
            headers={"X-Internal-Token": internal_token} if internal_token else {},
        )
        resp.raise_for_status()


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def _build_candidate_text(article: dict[str, Any]) -> str:
    """Assemble the text field sent to semops rank for a wechat article."""
    title = article.get("title") or ""
    author = article.get("author") or ""
    source = article.get("source_name") or ""
    content = (article.get("content_text") or "")[:300]
    return f"Title: {title} | Author: {author} | Source: {source} | Summary: {content}"


def _to_digest_item(
    rank: int,
    ranked_item: dict[str, Any],
    original: dict[str, Any],
    reason: str,
) -> dict[str, Any]:
    """Transform a semops ranked item + original article into a DigestItem dict."""
    art_id = original.get("id")
    return {
        "rank": rank,
        "externalId": str(art_id),
        "sourceRefId": art_id,
        "sourceName": original.get("source_name") or "",
        "title": original.get("title") or "",
        "author": original.get("author") or None,
        "publishedAt": original.get("publish_time") or "",
        "url": original.get("url") or "",
        "score": float(original.get("score") or 0.0),
        "matchedQueries": original.get("matched_queries") or [],
        "reason": reason,
        "summary": (original.get("content_text") or "")[:300],
        "meta": {
            "cover_url": original.get("cover_url"),
        },
    }


async def generate_section(req: GenerateSectionRequest) -> None:
    """Main entry point for per-section digest generation.

    Implements the full wechat pipeline:
      prefilter → semops rank → transform → HTTP callback.

    Any exception causes a FAILED callback to be posted.
    """
    try:
        # Step 1: Build the wechat candidate pool
        pool = await _prefilter_wechat(
            queries=req.queries,
            subscribed_source_ids=req.subscribed_source_ids,
        )

        # Step 2: Empty pool → post EMPTY and return
        if not pool:
            await _complete_section(
                section_id=req.section_id,
                status="EMPTY",
                items=[],
            )
            return

        # Step 3: Assemble candidate texts for semops
        index_by_id: dict[Any, dict[str, Any]] = {a["id"]: a for a in pool if "id" in a}
        semops_candidates = [
            {"id": article["id"], "text": _build_candidate_text(article)}
            for article in pool
            if "id" in article
        ]

        # Concatenate all enabled queries into a joint query string
        enabled_texts = [q["text"] for q in req.queries if q.get("enabled")]
        joint_query = " ".join(enabled_texts) if enabled_texts else ""

        # Step 4: Call semops rank
        ranked_result = await _semops_rank(
            candidates=semops_candidates,
            query=joint_query,
            top_k=req.top_n,
            provider=req.model_provider,
            model=req.model_name,
            api_key=req.api_key,
        )

        # Step 5: Transform into DigestItem-shaped dicts
        ranked_items: list[dict[str, Any]] = ranked_result.get("ranked") or []
        reasons: dict[str, str] = ranked_result.get("reasons") or {}

        digest_items: list[dict[str, Any]] = []
        for position, ranked_item in enumerate(ranked_items, start=1):
            item_id = ranked_item.get("id")
            original = index_by_id.get(item_id, {})
            reason = reasons.get(str(item_id)) or ""
            digest_items.append(
                _to_digest_item(
                    rank=position,
                    ranked_item=ranked_item,
                    original=original,
                    reason=reason,
                )
            )

        # Step 6: Post COMPLETED results
        completed_at = datetime.now(tz=timezone.utc).isoformat()
        await _complete_section(
            section_id=req.section_id,
            status="COMPLETED",
            items=digest_items,
            model_used=f"{req.model_provider}/{req.model_name}",
            completed_at=completed_at,
        )

    except Exception as exc:  # noqa: BLE001
        await _complete_section(
            section_id=req.section_id,
            status="FAILED",
            error=str(exc),
        )
