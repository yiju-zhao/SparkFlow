"""Tests for POST /v1/workflows/llm/list-models."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

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


def test_401_without_token(client):
    r = client.post("/v1/workflows/llm/list-models", json={"providerId": "openai", "apiKey": "k"})
    assert r.status_code == 401


def test_200_returns_chat_models_only(client, monkeypatch):
    fake_resp = MagicMock()
    fake_resp.raise_for_status = MagicMock()
    fake_resp.json = MagicMock(
        return_value={
            "data": [
                {"id": "gpt-4o"},
                {"id": "text-embedding-3"},
                {"id": "tts-1"},
                {"id": "gpt-4o-mini"},
            ]
        }
    )

    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def get(self, *a, **kw):
            return fake_resp

    monkeypatch.setattr("server.routes.llm_models.httpx.AsyncClient", FakeClient)
    r = client.post(
        "/v1/workflows/llm/list-models",
        json={"providerId": "openai", "apiKey": "sk"},
        headers={"X-Internal-Token": "tk"},
    )
    assert r.status_code == 200
    assert r.json() == {"models": ["gpt-4o", "gpt-4o-mini"]}


def test_502_on_upstream_failure(client, monkeypatch):
    import httpx as _httpx

    class FakeClient:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return None

        async def get(self, *a, **kw):
            raise _httpx.ConnectError("dns boom")

    monkeypatch.setattr("server.routes.llm_models.httpx.AsyncClient", FakeClient)
    r = client.post(
        "/v1/workflows/llm/list-models",
        json={"providerId": "openai", "apiKey": "sk"},
        headers={"X-Internal-Token": "tk"},
    )
    assert r.status_code == 502
