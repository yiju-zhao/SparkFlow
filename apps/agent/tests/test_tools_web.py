"""Tests for tools.web (search_web + url_fetch)."""

import json
import sys
from unittest.mock import MagicMock, patch

import pytest

from tools.web import search_web, url_fetch


# ---------------------------------------------------------------------------
# search_web — default SearXNG path
# ---------------------------------------------------------------------------


def test_search_web_defaults_to_searxng(monkeypatch):
    """No api_key kwarg → SearXNG via the SEARXNG_URL env var."""
    fake_resp = MagicMock()
    fake_resp.status_code = 200
    fake_resp.raise_for_status = MagicMock()
    fake_resp.json.return_value = {
        "results": [
            {"title": "A", "url": "https://a.test", "content": "body A"},
            {"title": "B", "url": "https://b.test", "content": "body B"},
        ]
    }
    fake_client = MagicMock()
    fake_client.__enter__ = MagicMock(return_value=fake_client)
    fake_client.__exit__ = MagicMock(return_value=False)
    fake_client.get = MagicMock(return_value=fake_resp)

    with patch("tools.web.httpx.Client", return_value=fake_client):
        result = search_web.invoke({"query": "diffusion models"})

    parsed = json.loads(result)
    assert len(parsed) == 2
    assert parsed[0]["title"] == "A"
    # Confirm SearXNG endpoint was actually called.
    args, kwargs = fake_client.get.call_args
    assert args[0].endswith("/search")
    assert kwargs["params"]["format"] == "json"
    assert kwargs["params"]["q"] == "diffusion models"


def test_search_web_searxng_applies_site_operator_for_domains():
    """domains=[...] → SearXNG sees `site:` in the query string."""
    fake_resp = MagicMock()
    fake_resp.raise_for_status = MagicMock()
    fake_resp.json.return_value = {"results": []}
    fake_client = MagicMock()
    fake_client.__enter__ = MagicMock(return_value=fake_client)
    fake_client.__exit__ = MagicMock(return_value=False)
    fake_client.get = MagicMock(return_value=fake_resp)

    with patch("tools.web.httpx.Client", return_value=fake_client):
        search_web.invoke({"query": "x", "domains": ["arxiv.org"]})

    sent_query = fake_client.get.call_args.kwargs["params"]["q"]
    assert "site:arxiv.org" in sent_query


def test_search_web_searxng_failure_returns_json_error():
    """Network error from SearXNG surfaces as a JSON error string."""
    fake_client = MagicMock()
    fake_client.__enter__ = MagicMock(return_value=fake_client)
    fake_client.__exit__ = MagicMock(return_value=False)
    fake_client.get = MagicMock(side_effect=Exception("connection refused"))

    with patch("tools.web.httpx.Client", return_value=fake_client):
        result = search_web.invoke({"query": "x"})

    parsed = json.loads(result)
    assert "error" in parsed
    assert "searxng_search" in parsed["error"]


# ---------------------------------------------------------------------------
# search_web — BYOK Tavily path (when api_key is injected)
# ---------------------------------------------------------------------------


def test_search_web_uses_tavily_when_api_key_injected(monkeypatch):
    captured = {}
    fake_tavily = MagicMock()
    fake_tavily.search.return_value = {
        "results": [{"title": "T", "url": "https://t.test", "content": "tav body"}]
    }

    def make_client(api_key):
        captured["api_key"] = api_key
        return fake_tavily

    tavily_mod = MagicMock()
    tavily_mod.TavilyClient = MagicMock(side_effect=make_client)
    monkeypatch.setitem(sys.modules, "tavily", tavily_mod)

    result = search_web.invoke({"query": "x", "api_key": "user_key"})
    parsed = json.loads(result)
    assert parsed[0]["title"] == "T"
    assert captured["api_key"] == "user_key"


def test_search_web_no_env_fallback_for_tavily_key(monkeypatch):
    """TAVILY_API_KEY in the environment must NOT silently activate Tavily.

    Tavily is strictly BYOK — only an explicit injected api_key triggers it.
    With no api_key, search must go through SearXNG even if the env var is set.
    """
    monkeypatch.setenv("TAVILY_API_KEY", "should-be-ignored")

    fake_resp = MagicMock()
    fake_resp.raise_for_status = MagicMock()
    fake_resp.json.return_value = {"results": []}
    fake_client = MagicMock()
    fake_client.__enter__ = MagicMock(return_value=fake_client)
    fake_client.__exit__ = MagicMock(return_value=False)
    fake_client.get = MagicMock(return_value=fake_resp)

    with patch("tools.web.httpx.Client", return_value=fake_client):
        search_web.invoke({"query": "x"})

    # Hit SearXNG, not Tavily.
    fake_client.get.assert_called_once()
    assert fake_client.get.call_args.args[0].endswith("/search")


# ---------------------------------------------------------------------------
# url_fetch
# ---------------------------------------------------------------------------


def test_url_fetch_success(monkeypatch):
    fake_resp = MagicMock()
    fake_resp.status_code = 200
    fake_resp.text = "<html><body>Hello</body></html>"
    fake_resp.raise_for_status = MagicMock()
    fake_client = MagicMock()
    fake_client.__enter__ = MagicMock(return_value=fake_client)
    fake_client.__exit__ = MagicMock(return_value=False)
    fake_client.get = MagicMock(return_value=fake_resp)
    with patch("tools.web.httpx.Client", return_value=fake_client):
        result = url_fetch.invoke({"url": "https://example.test"})
    assert "Hello" in result or "<body>" in result


def test_url_fetch_http_error_returns_json_error():
    with patch("tools.web.httpx.Client") as Client:
        Client.return_value.__enter__.return_value.get.side_effect = Exception(
            "network down"
        )
        result = url_fetch.invoke({"url": "https://example.test"})
    parsed = json.loads(result)
    assert "error" in parsed


