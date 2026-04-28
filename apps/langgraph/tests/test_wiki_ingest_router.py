"""Tests for POST /v1/workflows/wiki/extract."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("INTERNAL_CALLBACK_TOKEN", "tk")
    monkeypatch.setattr(
        "server.app.create_pool", AsyncMock(return_value=AsyncMock(aclose=AsyncMock()))
    )
    from server.app import app

    return TestClient(app)


def _payload(**kw):
    base = dict(
        mode="extract",
        notebookId="nb",
        sourceId="s",
        userId="u",
        sourceTitle="t",
        sourceContent="body",
        byok={"provider": "openai", "model": "gpt-4o", "apiKey": "sk-t"},
    )
    base.update(kw)
    return base


def test_401_without_token(client):
    r = client.post("/v1/workflows/wiki/extract", json=_payload())
    assert r.status_code == 401


def test_200_with_token_and_mocked_entrypoint(client, monkeypatch):
    from workflows.wiki_ingest import (
        Extraction,
        Graph,
        WikiExtractResult,
        WikiPagePayload,
    )

    fake = AsyncMock(
        return_value=WikiExtractResult(
            normalized_title="X",
            extraction=Extraction(normalized_title="X", nodes=[], edges=[]),
            extraction_report={"nodes": [], "edges": [], "crossRefs": []},
            merged_graph=Graph(nodes=[], edges=[]),
            communities={},
            community_pages=[],
            index_page=WikiPagePayload(slug="index", title="i", markdown="", source_ids=[]),
            log_entry="log",
        )
    )
    monkeypatch.setattr("server.routes.wiki_ingest.extract_wiki.ainvoke", fake)
    r = client.post(
        "/v1/workflows/wiki/extract",
        json=_payload(),
        headers={"X-Internal-Token": "tk"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["normalizedTitle"] == "X"
    assert "extractionReport" in body
    assert body["indexPage"]["slug"] == "index"


def test_extract_mode_without_content_returns_422(client):
    r = client.post(
        "/v1/workflows/wiki/extract",
        json=_payload(sourceContent=""),
        headers={"X-Internal-Token": "tk"},
    )
    assert r.status_code == 422


def test_remove_mode_payload_is_valid(client, monkeypatch):
    """Remove mode no longer requires existingGraph in the body — the
    workflow loads notebook state from Postgres directly."""
    from workflows.wiki_ingest import (
        Graph,
        WikiExtractResult,
        WikiPagePayload,
    )

    fake = AsyncMock(
        return_value=WikiExtractResult(
            normalized_title="t",
            extraction=None,
            extraction_report=None,
            merged_graph=Graph(nodes=[], edges=[]),
            communities={},
            community_pages=[],
            index_page=WikiPagePayload(slug="index", title="i", markdown="", source_ids=[]),
            log_entry="",
        )
    )
    monkeypatch.setattr("server.routes.wiki_ingest.extract_wiki.ainvoke", fake)
    payload = dict(
        mode="remove",
        notebookId="n",
        sourceId="s",
        userId="u",
        sourceTitle="t",
        byok={"provider": "openai", "model": "gpt-4o", "apiKey": "sk"},
    )
    r = client.post("/v1/workflows/wiki/extract", json=payload, headers={"X-Internal-Token": "tk"})
    assert r.status_code == 200


def test_internal_error_envelope(client, monkeypatch):
    fake = AsyncMock(side_effect=RuntimeError("boom"))
    monkeypatch.setattr("server.routes.wiki_ingest.extract_wiki.ainvoke", fake)
    r = client.post(
        "/v1/workflows/wiki/extract", json=_payload(), headers={"X-Internal-Token": "tk"}
    )
    assert r.status_code == 500
    body = r.json()
    assert body["error"]["code"] in {"UPSTREAM_ERROR", "EXTRACTION_FAILED"}
    assert body["error"]["message"]
