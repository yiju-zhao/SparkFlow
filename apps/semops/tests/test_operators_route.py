"""Tests for POST /api/operators/rank route.

Strategy
--------
We patch ``SemanticOperators.rank`` at the class level (via ``mocker.patch.object``
or ``monkeypatch``) so no real LOTUS call is ever made. The rank() implementation
also skips LOTUS LM configuration when ``PYTEST_CURRENT_TEST`` is set (pytest
does this automatically), so the lock-and-configure ceremony is inert here.
"""

from __future__ import annotations

import pytest

from services.semantic_operators import SemanticOperators


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def rank_body():
    """A valid POST body for /api/operators/rank."""
    return {
        "candidates": [
            {
                "id": "a1",
                "match_text": "LLM agent in enterprise legal: four case studies",
                "title": "LLM agent",
            },
            {
                "id": "a2",
                "match_text": "Diffusion for video generation: DiT architecture",
                "title": "Diffusion",
            },
            {
                "id": "a3",
                "match_text": "Cooking pasta: five easy recipes",
                "title": "Cooking",
            },
        ],
        "query_text": "LLM agents in enterprise",
        "top_k": 2,
        "search_k": 3,
        "include_reasons": True,
        "lm_config": {
            "provider": "openai",
            "model": "gpt-4o-mini",
            "api_key": "sk-fake-test-key",
        },
    }


def _fake_rank_return(include_reasons: bool) -> list[dict]:
    """A deterministic fake return value from SemanticOperators.rank."""
    base = [
        {"id": "a1", "match_text": "LLM agent in enterprise legal: four case studies", "title": "LLM agent"},
        {"id": "a2", "match_text": "Diffusion for video generation: DiT architecture", "title": "Diffusion"},
    ]
    if include_reasons:
        for i, item in enumerate(base):
            item["recommendation_reason"] = f"相关匹配 {i}"
    return base


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_rank_happy_path(client, monkeypatch, rank_body):
    """Valid body + patched rank returns 200 with the expected schema."""
    fake_results = _fake_rank_return(include_reasons=True)

    def _fake_rank(self, **kwargs):
        return fake_results

    monkeypatch.setattr(SemanticOperators, "rank", _fake_rank)

    response = client.post("/api/operators/rank", json=rank_body)
    assert response.status_code == 200, response.text

    body = response.json()
    assert "results" in body
    assert "count" in body
    assert body["count"] == len(fake_results)
    assert len(body["results"]) == len(fake_results)

    for item in body["results"]:
        assert "id" in item
        assert "match_text" in item
        # include_reasons=True in body → reason populated
        assert item.get("recommendation_reason")
        # Extras must pass through
        assert item.get("title")


def test_rank_rejects_empty_candidates(client, monkeypatch, rank_body):
    """Empty candidates list must return 400 with detail mentioning 'empty'.

    Enforcement point: the route catches ``SemanticOperators.rank``'s
    ``ValueError`` and translates it to HTTP 400. We do NOT patch rank here —
    we want the real ValueError translation path to fire. But we patch the
    default operator class to avoid any side effects by letting the real
    (pure-python) rank() raise.
    """
    body = dict(rank_body)
    body["candidates"] = []

    # No monkeypatch — SemanticOperators.rank's own ValueError fires.
    response = client.post("/api/operators/rank", json=body)
    assert response.status_code == 400, response.text
    detail = response.json().get("detail", "")
    assert "empty" in detail.lower()


def test_rank_validation_error_missing_field(client, rank_body):
    """Missing ``query_text`` → FastAPI 422."""
    body = dict(rank_body)
    del body["query_text"]

    response = client.post("/api/operators/rank", json=body)
    assert response.status_code == 422, response.text


def test_rank_maps_auth_error_to_401(client, monkeypatch, rank_body):
    """SemopsAuthError from rank → HTTP 401 with the provider's message."""
    from services.errors import SemopsAuthError

    def _boom_auth(self, **kwargs):
        raise SemopsAuthError("invalid api key for provider X")

    monkeypatch.setattr(SemanticOperators, "rank", _boom_auth)

    response = client.post("/api/operators/rank", json=rank_body)
    assert response.status_code == 401, response.text
    assert "invalid api key" in response.json().get("detail", "").lower()


def test_rank_maps_rate_limit_to_429(client, monkeypatch, rank_body):
    """SemopsRateLimitError from rank → HTTP 429."""
    from services.errors import SemopsRateLimitError

    def _boom_rate(self, **kwargs):
        raise SemopsRateLimitError("provider says slow down")

    monkeypatch.setattr(SemanticOperators, "rank", _boom_rate)

    response = client.post("/api/operators/rank", json=rank_body)
    assert response.status_code == 429, response.text
    assert "slow down" in response.json().get("detail", "").lower()


def test_rank_maps_bad_request_to_400(client, monkeypatch, rank_body):
    """SemopsBadRequest from rank → HTTP 400."""
    from services.errors import SemopsBadRequest

    def _boom_bad(self, **kwargs):
        raise SemopsBadRequest("malformed candidate row")

    monkeypatch.setattr(SemanticOperators, "rank", _boom_bad)

    response = client.post("/api/operators/rank", json=rank_body)
    assert response.status_code == 400, response.text
    assert "malformed candidate" in response.json().get("detail", "").lower()


def test_rank_maps_provider_error_to_502(client, monkeypatch, rank_body):
    """SemopsProviderError from rank → HTTP 502 (we are a gateway to broken upstream)."""
    from services.errors import SemopsProviderError

    def _boom_prov(self, **kwargs):
        raise SemopsProviderError("upstream returned 503")

    monkeypatch.setattr(SemanticOperators, "rank", _boom_prov)

    response = client.post("/api/operators/rank", json=rank_body)
    assert response.status_code == 502, response.text
    assert "503" in response.json().get("detail", "")


def test_rank_passes_kwargs_through(client, monkeypatch, rank_body):
    """The route must forward kwargs from the request body into rank()."""
    captured: dict = {}

    def _spy_rank(self, **kwargs):
        captured.update(kwargs)
        return _fake_rank_return(include_reasons=kwargs.get("include_reasons", True))

    monkeypatch.setattr(SemanticOperators, "rank", _spy_rank)

    response = client.post("/api/operators/rank", json=rank_body)
    assert response.status_code == 200, response.text

    # Candidates were serialized to plain dicts preserving extras.
    assert "candidates" in captured
    assert isinstance(captured["candidates"], list)
    assert len(captured["candidates"]) == len(rank_body["candidates"])
    for sent, got in zip(rank_body["candidates"], captured["candidates"]):
        assert got["id"] == sent["id"]
        assert got["match_text"] == sent["match_text"]
        assert got.get("title") == sent.get("title")

    # Scalar kwargs match the request body exactly.
    assert captured["query_text"] == rank_body["query_text"]
    assert captured["top_k"] == rank_body["top_k"]
    assert captured["search_k"] == rank_body["search_k"]
    assert captured["include_reasons"] == rank_body["include_reasons"]

    # lm_config is forwarded as a plain dict (not a Pydantic model).
    assert isinstance(captured.get("lm_config"), dict)
    assert captured["lm_config"]["provider"] == rank_body["lm_config"]["provider"]
    assert captured["lm_config"]["model"] == rank_body["lm_config"]["model"]
    assert captured["lm_config"]["api_key"] == rank_body["lm_config"]["api_key"]
