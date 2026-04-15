"""Search tools for the search agent.

Each tool searches one source type:
- search_web: Tavily web search with optional domain filtering
- search_publications: Full-text search on SparkFlow publication DB
- search_wechat: Full-text search on WeChat article DB
"""

import json
import os

import httpx
from langchain_core.tools import tool

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")


@tool
def search_web(query: str, domains: list[str] | None = None) -> str:
    """Search the web for relevant pages.

    Args:
        query: Search keywords (reformulated for best results).
        domains: Optional list of domains to restrict search to (e.g. ["arxiv.org"]).
    """
    try:
        from tavily import TavilyClient

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
        results = []
        for r in response.get("results", []):
            results.append({
                "id": r.get("url", ""),
                "title": r.get("title", "Untitled"),
                "snippet": r.get("content", "")[:300],
                "url": r.get("url", ""),
                "published_date": r.get("published_date", ""),
            })
        return json.dumps(results, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def search_publications(query: str, limit: int = 20) -> str:
    """Search the academic publication database for papers matching the query.

    Args:
        query: Search keywords — use technical terms, paper concepts, or method names.
        limit: Maximum number of results to return.
    """
    try:
        res = httpx.post(
            f"{SPARKFLOW_API_URL}/api/explore/search/publications",
            json={"query": query, "limit": limit},
            timeout=30,
        )
        if not res.is_success:
            return json.dumps({"error": f"Search failed: {res.status_code}"})
        data = res.json()
        # Format for the agent
        results = []
        for pub in data:
            results.append({
                "id": pub.get("id", ""),
                "title": pub.get("title", ""),
                "snippet": pub.get("abstract", ""),
                "meta": " · ".join(
                    filter(None, [pub.get("venue"), str(pub.get("year", ""))])
                ),
                "url": pub.get("pdfUrl", ""),
                "authors": pub.get("authors", []),
                "rank": pub.get("rank", 0),
            })
        return json.dumps(results, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


@tool
def search_wechat(query: str, limit: int = 20) -> str:
    """Search the WeChat article database for articles matching the query.

    Args:
        query: Search keywords — can be Chinese or English terms.
        limit: Maximum number of results to return.
    """
    try:
        res = httpx.post(
            f"{SPARKFLOW_API_URL}/api/explore/search/wechat",
            json={"query": query, "limit": limit},
            timeout=30,
        )
        if not res.is_success:
            return json.dumps({"error": f"Search failed: {res.status_code}"})
        data = res.json()
        results = []
        for article in data:
            publish_time = article.get("publish_time", "")
            if publish_time:
                publish_time = publish_time[:10]  # Just the date part
            results.append({
                "id": str(article.get("id", "")),
                "title": article.get("title", ""),
                "snippet": article.get("content_text", ""),
                "meta": " · ".join(
                    filter(None, ["WeChat", article.get("source_name", ""), publish_time])
                ),
                "url": article.get("original_url", ""),
                "rank": article.get("rank", 0),
            })
        return json.dumps(results, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


# Tool lookup by source type
SEARCH_TOOLS_BY_TYPE = {
    "web": [search_web],
    "publication": [search_publications],
    "wechat": [search_wechat],
}
