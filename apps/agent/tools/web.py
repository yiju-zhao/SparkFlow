"""Web tools — SearXNG (default) + optional Tavily BYOK + URL fetch.

Used by the ``deep_research`` surface for open-web research. These tools
are also reachable from the ``search`` workflow's ``web`` source_type.

Search backend selection:
  * If the caller injects a Tavily ``api_key``, search via Tavily.
  * Otherwise, search via the self-hosted SearXNG instance pointed at
    by ``SEARXNG_URL`` (default ``http://localhost:8888``).

There is intentionally no ``TAVILY_API_KEY`` environment fallback —
Tavily is strictly BYOK so users always pay for their own quota.
"""

from __future__ import annotations

import json
import os
from typing import Annotated

import httpx
from langchain_core.tools import InjectedToolArg, tool

from hermes.registry import registry


SEARXNG_URL = os.getenv("SEARXNG_URL", "http://localhost:8888").rstrip("/")
SEARCH_RESULT_LIMIT = 15


@tool
def search_web(
    query: str,
    domains: list[str] | None = None,
    api_key: Annotated[str | None, InjectedToolArg] = None,
) -> str:
    """Search the web for relevant pages.

    Default backend is the self-hosted SearXNG instance (no key needed).
    If a Tavily ``api_key`` is injected by the workflow layer the tool
    upgrades to Tavily for that call. ``InjectedToolArg`` hides the key
    from the LLM-visible tool schema so the model cannot hallucinate or
    echo it.

    Args:
        query: Search keywords (reformulated for best results).
        domains: Optional list of domains to restrict search to
            (e.g. ``["arxiv.org"]``).
    """
    if api_key:
        return _search_via_tavily(query, domains, api_key)
    return _search_via_searxng(query, domains)


def _search_via_searxng(query: str, domains: list[str] | None) -> str:
    """Hit the SearXNG JSON API. Format must be enabled in settings.yml.

    SearXNG doesn't have a structured ``include_domains`` parameter —
    the conventional way to scope is the ``site:`` operator, OR'd
    inside the query.
    """
    effective_query = query
    if domains:
        site_clause = " OR ".join(f"site:{d}" for d in domains)
        effective_query = f"({query}) ({site_clause})"

    try:
        with httpx.Client(timeout=15) as client:
            resp = client.get(
                f"{SEARXNG_URL}/search",
                params={"q": effective_query, "format": "json"},
                headers={"User-Agent": "SparkFlow/1.0"},
            )
            resp.raise_for_status()
            data = resp.json()

        results = data.get("results", [])[:SEARCH_RESULT_LIMIT]
        return json.dumps(
            [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                }
                for r in results
            ],
            ensure_ascii=False,
        )
    except Exception as exc:  # noqa: BLE001
        return json.dumps(
            {"error": f"searxng_search failed: {exc}"}, ensure_ascii=False
        )


def _search_via_tavily(
    query: str, domains: list[str] | None, api_key: str
) -> str:
    try:
        from tavily import TavilyClient  # type: ignore

        client = TavilyClient(api_key=api_key)
        kwargs: dict = {
            "query": query,
            "max_results": SEARCH_RESULT_LIMIT,
            "search_depth": "advanced",
        }
        if domains:
            kwargs["include_domains"] = domains

        response = client.search(**kwargs)
        results = response.get("results", [])
        return json.dumps(
            [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                }
                for r in results
            ],
            ensure_ascii=False,
        )
    except Exception as exc:  # noqa: BLE001
        return json.dumps(
            {"error": f"tavily_search failed: {exc}"}, ensure_ascii=False
        )


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
    description=(
        "Search the web. Default backend SearXNG (self-hosted); "
        "upgrades to Tavily when a BYOK api_key is injected. Returns JSON."
    ),
)
registry.register(
    name=url_fetch.name,
    toolset="web",
    tool=url_fetch,
    description="Fetch a URL's raw text (truncated).",
)
