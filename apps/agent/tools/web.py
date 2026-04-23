"""Web tools — Tavily search + URL fetch.

Used by the ``deep_research`` surface for open-web research. These tools
are also reachable from the ``search`` workflow's ``web`` source_type.
"""

from __future__ import annotations

import json
import os

import httpx
from langchain_core.tools import tool

from hermes.registry import registry


@tool
def search_web(query: str, domains: list[str] | None = None) -> str:
    """Search the web for relevant pages via Tavily.

    Args:
        query: Search keywords (reformulated for best results).
        domains: Optional list of domains to restrict search to
            (e.g. ["arxiv.org"]).
    """
    try:
        from tavily import TavilyClient  # type: ignore

        api_key = os.getenv("TAVILY_API_KEY", "")
        if not api_key:
            return json.dumps({"error": "TAVILY_API_KEY not configured"})

        client = TavilyClient(api_key=api_key)
        kwargs: dict = {
            "query": query,
            "max_results": 15,
            "search_depth": "advanced",
        }
        if domains:
            kwargs["include_domains"] = domains

        response = client.search(**kwargs)
        return json.dumps(
            [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                }
                for r in response.get("results", [])
            ],
            ensure_ascii=False,
        )
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"search_web failed: {exc}"})


@tool
def url_fetch(url: str, max_chars: int = 10_000) -> str:
    """Fetch the raw text of a URL. Truncates to ``max_chars`` characters.

    Args:
        url: Absolute URL to fetch.
        max_chars: Cap on returned text length.
    """
    try:
        with httpx.Client(follow_redirects=True, timeout=15) as client:
            resp = client.get(url, headers={"User-Agent": "SparkFlow/1.0"})
            resp.raise_for_status()
            text = resp.text or ""
            if len(text) > max_chars:
                text = text[:max_chars] + "\n\n[... truncated ...]"
            return text
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"url_fetch failed: {exc}"})


# --- hermes.registry self-registration (P4) -----------------------------
registry.register(
    name=search_web.name,
    toolset="web",
    tool=search_web,
    description="Search the web via Tavily; returns top results as JSON.",
)
registry.register(
    name=url_fetch.name,
    toolset="web",
    tool=url_fetch,
    description="Fetch a URL's raw text (truncated).",
)
