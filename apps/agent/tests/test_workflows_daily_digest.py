"""Tests for workflows.daily_digest — all HTTP calls are mocked."""

import pytest
from unittest.mock import AsyncMock, patch

from workflows.daily_digest import GenerateSectionRequest, generate_section


@pytest.mark.asyncio
async def test_empty_pool_posts_empty_status(monkeypatch):
    monkeypatch.setattr("workflows.daily_digest._prefilter_wechat",
                         AsyncMock(return_value=[]))
    complete_mock = AsyncMock()
    monkeypatch.setattr("workflows.daily_digest._complete_section", complete_mock)

    req = GenerateSectionRequest(
        section_id="sec_1", source_type="WECHAT", digest_date="2026-04-22",
        queries=[{"id": "q1", "text": "agents", "enabled": True}],
        subscribed_source_ids=[], top_n=5,
        model_provider="openai", model_name="gpt-4o-mini", api_key=None,
    )
    await generate_section(req)

    assert complete_mock.await_args.kwargs["status"] == "EMPTY"


@pytest.mark.asyncio
async def test_successful_pipeline(monkeypatch):
    monkeypatch.setattr("workflows.daily_digest._prefilter_wechat",
                         AsyncMock(return_value=[
                             {"id": 1, "title": "t1", "source_name": "s1",
                              "author": "a", "content_text": "x", "url": "u1",
                              "publish_time": "2026-04-22T00:00:00Z",
                              "cover_url": None, "matched_queries": ["q1"], "score": 0.9},
                         ]))
    monkeypatch.setattr("workflows.daily_digest._semops_rank",
                         AsyncMock(return_value={
                             "ranked": [{"id": 1, "text": "Title: t1"}],
                             "reasons": {"1": "relevant"},
                         }))
    complete_mock = AsyncMock()
    monkeypatch.setattr("workflows.daily_digest._complete_section", complete_mock)

    req = GenerateSectionRequest(
        section_id="sec_ok", source_type="WECHAT", digest_date="2026-04-22",
        queries=[{"id": "q1", "text": "agents", "enabled": True}],
        subscribed_source_ids=[1, 2], top_n=5,
        model_provider="openai", model_name="gpt-4o-mini", api_key=None,
    )
    await generate_section(req)

    call_kwargs = complete_mock.await_args.kwargs
    assert call_kwargs["status"] == "COMPLETED"
    assert len(call_kwargs["items"]) == 1
    assert call_kwargs["items"][0]["reason"] == "relevant"


@pytest.mark.asyncio
async def test_failure_posts_failed_status(monkeypatch):
    monkeypatch.setattr("workflows.daily_digest._prefilter_wechat",
                         AsyncMock(side_effect=RuntimeError("db down")))
    complete_mock = AsyncMock()
    monkeypatch.setattr("workflows.daily_digest._complete_section", complete_mock)

    req = GenerateSectionRequest(
        section_id="sec_err", source_type="WECHAT", digest_date="2026-04-22",
        queries=[], subscribed_source_ids=[], top_n=5,
        model_provider="openai", model_name="gpt-4o-mini", api_key=None,
    )
    await generate_section(req)

    call_kwargs = complete_mock.await_args.kwargs
    assert call_kwargs["status"] == "FAILED"
    assert "db down" in call_kwargs["error"]
