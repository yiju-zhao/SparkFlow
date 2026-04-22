"""Navigation suggestion tool for the Research Hub agent.

Provides ``suggest_navigation`` which scores a user intent string against a
hardcoded page registry and returns the top-3 matching pages as structured
data suitable for rendering via ``show_navigation``.
"""

from __future__ import annotations

from typing import Any

from langchain.tools import tool


# ---------------------------------------------------------------------------
# Page registry
# ---------------------------------------------------------------------------

_PAGE_REGISTRY: list[dict[str, Any]] = [
    {
        "title": "Research Hub Overview",
        "url": "/explore",
        "description": "Overview dashboard with high-level stats and entry points.",
        "keywords": {"overview", "home", "stats", "dashboard", "explore", "hub"},
    },
    {
        "title": "All Conferences",
        "url": "/explore/conferences",
        "description": "Browse all tracked conference venues and their editions.",
        "keywords": {"conferences", "venues", "editions", "events", "conference"},
    },
    {
        "title": "Publications",
        "url": "/explore/conferences/publications",
        "description": "Search and filter research publications across conferences.",
        "keywords": {
            "publications",
            "papers",
            "research",
            "articles",
            "publication",
            "paper",
        },
    },
    {
        "title": "Conference Sessions",
        "url": "/explore/conferences/sessions",
        "description": "Browse talks, workshops, and sessions from conference programmes.",
        "keywords": {
            "sessions",
            "talks",
            "workshops",
            "programme",
            "schedule",
            "session",
            "talk",
            "workshop",
        },
    },
    {
        "title": "WeChat Articles",
        "url": "/explore/social-media/wechat",
        "description": "Explore WeChat public-account articles indexed from social media.",
        "keywords": {
            "wechat",
            "articles",
            "social",
            "media",
            "social media",
            "wechat articles",
        },
    },
    {
        "title": "Query Matcher",
        "url": "/explore/toolbox/matcher",
        "description": "Match a research query against publications using semantic search.",
        "keywords": {
            "matcher",
            "matching",
            "query",
            "tool",
            "match",
            "semantic",
            "search",
            "toolbox",
        },
    },
]

# Default pages returned when nothing matches (top-3 general pages)
_DEFAULT_PAGE_URLS = ["/explore", "/explore/conferences", "/explore/conferences/publications"]


# ---------------------------------------------------------------------------
# Scoring helper
# ---------------------------------------------------------------------------


def _score_page(page: dict[str, Any], intent_words: set[str]) -> int:
    """Return a relevance score for *page* given the tokenised intent.

    Scoring rules:
    - +2 per intent word that matches a keyword exactly
    - +1 if any intent word appears as a substring in the page title
    - +1 if any intent word appears as a substring in the page description
    """
    score = 0
    keywords: set[str] = page["keywords"]
    title_lower = page["title"].lower()
    desc_lower = page["description"].lower()

    for word in intent_words:
        if word in keywords:
            score += 2
        if word in title_lower:
            score += 1
        if word in desc_lower:
            score += 1

    return score


# ---------------------------------------------------------------------------
# Exported tool
# ---------------------------------------------------------------------------


@tool
def suggest_navigation(intent: str) -> dict[str, Any]:
    """Suggest up to 3 Research Hub pages that best match a user intent.

    Scores each page in the registry by keyword overlap and substring
    matches in the title/description. If no page scores above zero, returns
    the top-3 general pages instead.

    Use this when the user's message implies they want to browse, navigate, or
    explore a particular area of the Research Hub, but they have not been
    directed to a specific page yet.

    Args:
        intent: A short natural-language description of what the user wants
            to find or do (e.g. ``"browse conference papers"`` or
            ``"find wechat articles about AI"``).
    """
    intent_words = set(intent.lower().split())

    scored = [
        (page, _score_page(page, intent_words))
        for page in _PAGE_REGISTRY
    ]

    # Sort by score descending, then by title for deterministic ties
    scored.sort(key=lambda t: (-t[1], t[0]["title"]))

    top_3 = scored[:3]
    best_score = top_3[0][1] if top_3 else 0

    if best_score == 0:
        # Fall back to general pages
        result_pages = [
            p for p in _PAGE_REGISTRY if p["url"] in _DEFAULT_PAGE_URLS
        ]
    else:
        result_pages = [page for page, _ in top_3]

    # Return only the user-facing fields (strip internal keywords set)
    return {
        "pages": [
            {
                "title": p["title"],
                "url": p["url"],
                "description": p["description"],
            }
            for p in result_pages
        ]
    }


HUB_NAV_TOOLS = [suggest_navigation]


# --- hermes.registry self-registration (P2) -------------------------------
# Individual top-level call (not a for-loop) so discover_builtin_tools' AST
# check identifies this module as a tool module.
from hermes.registry import registry

registry.register(
    name=HUB_NAV_TOOLS[0].name,
    toolset="navigation",
    tool=HUB_NAV_TOOLS[0],
    description=getattr(HUB_NAV_TOOLS[0], "description", "") or "",
)
