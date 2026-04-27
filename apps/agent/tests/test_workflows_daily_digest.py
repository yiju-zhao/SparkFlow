"""Tests for workflows.daily_digest — Functional API entrypoint."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from workflows.daily_digest import GenerateSectionRequest, generate_section


def _make_req(**overrides):
    base = dict(
        section_id="sec_1",
        source_type="WECHAT",
        digest_date="2026-04-27",
        queries=[{"id": "q1", "text": "ai", "enabled": True},
                 {"id": "q2", "text": "ml", "enabled": True}],
        subscribed_source_ids=[],
        top_n=5,
        model_provider="openai",
        model_name="gpt-4o-mini",
        api_key="sk-t",
    )
    base.update(overrides)
    return GenerateSectionRequest(**base)


@pytest.mark.asyncio
async def test_completed_path(monkeypatch):
    """Two queries → parallel prefilter → merge → rank → COMPLETED callback."""
    prefilter_calls = []

    async def fake_prefilter(query_text, source_ids):
        prefilter_calls.append(query_text)
        return [{"id": 1, "title": "T", "source_name": "S", "author": "A",
                 "content_text": "c" * 50, "url": "u", "publish_time": "2026-04-26",
                 "cover_url": None, "score": 0.9, "matched_queries": []}]

    callback_payloads = []

    async def fake_callback(section_id, status, **kw):
        callback_payloads.append({"section_id": section_id, "status": status, **kw})

    async def fake_rank(**kw):
        return {"ranked": [{"id": 1}], "reasons": {"1": "great"}}

    monkeypatch.setattr("workflows.daily_digest._prefilter_query_impl", fake_prefilter)
    monkeypatch.setattr("workflows.daily_digest._semops_rank_impl", fake_rank)
    monkeypatch.setattr("workflows.daily_digest._callback_impl", fake_callback)

    await generate_section.ainvoke(_make_req())

    assert prefilter_calls == ["ai", "ml"]
    assert callback_payloads[-1]["status"] == "COMPLETED"
    assert callback_payloads[-1]["items"][0]["sourceRefId"] == 1


@pytest.mark.asyncio
async def test_empty_pool(monkeypatch):
    async def empty_prefilter(query_text, source_ids):
        return []
    callbacks = []
    async def fake_callback(section_id, status, **kw):
        callbacks.append((section_id, status, kw))
    monkeypatch.setattr("workflows.daily_digest._prefilter_query_impl", empty_prefilter)
    monkeypatch.setattr("workflows.daily_digest._callback_impl", fake_callback)

    await generate_section.ainvoke(_make_req())
    assert callbacks == [("sec_1", "EMPTY", {"items": []})]


@pytest.mark.asyncio
async def test_rank_failure_emits_failed_callback(monkeypatch):
    async def fake_prefilter(query_text, source_ids):
        return [{"id": 1, "title": "T", "source_name": "S", "content_text": "c"}]
    async def failing_rank(**kw):
        raise RuntimeError("upstream 502")
    callbacks = []
    async def fake_callback(section_id, status, **kw):
        callbacks.append((section_id, status, kw))

    monkeypatch.setattr("workflows.daily_digest._prefilter_query_impl", fake_prefilter)
    monkeypatch.setattr("workflows.daily_digest._semops_rank_impl", failing_rank)
    monkeypatch.setattr("workflows.daily_digest._callback_impl", fake_callback)

    await generate_section.ainvoke(_make_req())
    assert callbacks[-1][1] == "FAILED"
    assert "upstream 502" in callbacks[-1][2]["error"]
