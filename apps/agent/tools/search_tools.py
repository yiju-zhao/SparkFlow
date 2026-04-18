"""Search tools for the search agent.

Only the web tool remains here — wechat and publication searches now go through
the deterministic pgvector prefilter + latent title/body pipeline defined
directly in graphs/search_agent.py, not as LLM-callable tools.
"""

import json
import os

from langchain_core.tools import tool


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
            results.append(
                {
                    "id": r.get("url", ""),
                    "title": r.get("title", "Untitled"),
                    "snippet": r.get("content", "")[:300],
                    "url": r.get("url", ""),
                    "published_date": r.get("published_date", ""),
                }
            )
        return json.dumps(results, ensure_ascii=False)
    except Exception as e:
        return json.dumps({"error": str(e)})


# Tool lookup by source type. Only `web` has LLM-callable tools now.
SEARCH_TOOLS_BY_TYPE = {
    "web": [search_web],
    "publication": [],
    "wechat": [],
}
