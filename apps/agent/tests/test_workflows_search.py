"""Tests for workflows.search."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from workflows.search import SearchRequest, run


@pytest.mark.asyncio
async def test_web_source_type_calls_tavily(monkeypatch):
    # Web path: Tavily single-shot, no semops
    from tools.web import search_web
    monkeypatch.setattr(
        "workflows.search._invoke_web_search",
        AsyncMock(return_value=[{"title": "A", "url": "https://a.test", "content": "a"}]),
    )
    req = SearchRequest(
        query="diffusion",
        source_type="web",
        notebook_id="nb_1",
        model_provider="openai",
        model_name="gpt-4o",
        top_k=10,
    )
    resp = await run(req)
    assert resp.items[0]["url"] == "https://a.test"


@pytest.mark.asyncio
async def test_wechat_source_type_calls_prefilter_then_semops(monkeypatch):
    monkeypatch.setattr(
        "workflows.search._prefilter",
        AsyncMock(return_value=[
            {"id": 1, "text": "Article 1 ..."},
            {"id": 2, "text": "Article 2 ..."},
        ]),
    )
    monkeypatch.setattr(
        "workflows.search._semops_rank",
        AsyncMock(return_value={"ranked": [{"id": 2, "text": "Article 2 ..."}],
                                 "reasons": {"2": "more relevant"}}),
    )
    req = SearchRequest(
        query="AI agents",
        source_type="wechat",
        notebook_id="nb_1",
        model_provider="openai",
        model_name="gpt-4o-mini",
        top_k=5,
    )
    resp = await run(req)
    assert len(resp.items) == 1
    assert resp.items[0]["id"] == 2


@pytest.mark.asyncio
async def test_unsupported_source_type_returns_error():
    req = SearchRequest(
        query="x",
        source_type="podcast",  # unsupported
        notebook_id="nb_1",
        model_provider="openai",
        model_name="gpt-4o",
        top_k=5,
    )
    with pytest.raises(ValueError):
        await run(req)
