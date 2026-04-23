"""Tests for tools.web (search_web + url_fetch)."""

import json
from unittest.mock import MagicMock, patch

import pytest

from tools.web import search_web, url_fetch


def test_search_web_no_api_key_returns_error():
    with patch.dict("os.environ", {"TAVILY_API_KEY": ""}, clear=False):
        result = search_web.invoke({"query": "x"})
    parsed = json.loads(result)
    assert "error" in parsed


def test_search_web_success_returns_json(monkeypatch):
    fake_tavily = MagicMock()
    fake_tavily.search.return_value = {
        "results": [
            {"title": "A", "url": "https://a.test", "content": "body A"},
            {"title": "B", "url": "https://b.test", "content": "body B"},
        ]
    }
    import sys
    tavily_mod = MagicMock()
    tavily_mod.TavilyClient = MagicMock(return_value=fake_tavily)
    monkeypatch.setitem(sys.modules, "tavily", tavily_mod)
    monkeypatch.setenv("TAVILY_API_KEY", "fake_key")
    result = search_web.invoke({"query": "diffusion models"})
    parsed = json.loads(result)
    assert len(parsed) == 2
    assert parsed[0]["title"] == "A"


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
        Client.return_value.__enter__.return_value.get.side_effect = Exception("network down")
        result = url_fetch.invoke({"url": "https://example.test"})
    parsed = json.loads(result)
    assert "error" in parsed


def test_tools_are_registered():
    import tools.web  # noqa: F401
    from hermes.registry import registry
    names = {e.name for e in registry._tools.values() if e.toolset == "web"}
    assert {"search_web", "url_fetch"} <= names
