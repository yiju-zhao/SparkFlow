"""Tests for workflows.search — plain async (NOT Functional API)."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from workflows.search import SearchRequest, search


@pytest.mark.asyncio
async def test_web_branch_returns_tavily_items(monkeypatch):
    monkeypatch.setattr(
        "workflows.search._web_search",
        AsyncMock(return_value=[{"title": "A", "url": "https://a.test", "content": "..."}]),
    )
    req = SearchRequest(
        query="diffusion",
        source_type="web",
        model_provider="openai",
        model_name="gpt-4o",
        api_key="sk-t",
        top_k=10,
    )
    resp = await search(req)
    assert resp.items[0]["url"] == "https://a.test"


@pytest.mark.asyncio
async def test_wechat_branch_calls_prefilter_then_semops(monkeypatch):
    monkeypatch.setattr(
        "workflows.search._prefilter",
        AsyncMock(return_value=[{"id": 1, "text": "Article 1"}, {"id": 2, "text": "Article 2"}]),
    )
    monkeypatch.setattr(
        "workflows.search._semops_rank",
        AsyncMock(return_value={"ranked": [{"id": 1}], "reasons": {"1": "best match"}}),
    )
    req = SearchRequest(
        query="ai",
        source_type="wechat",
        model_provider="openai",
        model_name="gpt-4o",
        api_key="sk-t",
        top_k=10,
    )
    resp = await search(req)
    assert resp.items == [{"id": 1}]
    assert resp.reasons == {"1": "best match"}


@pytest.mark.asyncio
async def test_publication_branch(monkeypatch):
    monkeypatch.setattr(
        "workflows.search._prefilter", AsyncMock(return_value=[{"id": 7, "text": "..."}])
    )
    monkeypatch.setattr(
        "workflows.search._semops_rank",
        AsyncMock(return_value={"ranked": [{"id": 7}], "reasons": {}}),
    )
    req = SearchRequest(
        query="x",
        source_type="publication",
        model_provider="openai",
        model_name="gpt-4o",
        api_key="sk-t",
        top_k=5,
    )
    resp = await search(req)
    assert resp.items == [{"id": 7}]


@pytest.mark.asyncio
async def test_empty_prefilter_short_circuits(monkeypatch):
    monkeypatch.setattr("workflows.search._prefilter", AsyncMock(return_value=[]))
    rank = AsyncMock()
    monkeypatch.setattr("workflows.search._semops_rank", rank)
    req = SearchRequest(
        query="zzz",
        source_type="wechat",
        model_provider="openai",
        model_name="gpt-4o",
        api_key="sk-t",
        top_k=10,
    )
    resp = await search(req)
    assert resp.items == []
    rank.assert_not_called()


@pytest.mark.asyncio
async def test_unsupported_source_type_raises():
    req = SearchRequest(
        query="x",
        source_type="unknown_type",
        model_provider="openai",
        model_name="gpt-4o",
        api_key="sk-t",
        top_k=10,
    )
    with pytest.raises(ValueError, match="Unsupported source_type"):
        await search(req)
