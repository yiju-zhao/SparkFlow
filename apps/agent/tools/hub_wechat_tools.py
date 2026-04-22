"""WeChat article query tools for the hub agent.

Connects to the external WeChat Postgres database (``WECHAT_DATABASE_URL``)
using psycopg (psycopg3, already a project dependency) and exposes three
read-only tools for counting, listing, and source enumeration.

Schema (schema ``wechat_articles``):
    articles: id, title, content, author, url, publish_time, source_id
    sources:  id, name
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any

import psycopg
from langchain.tools import tool


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _wechat_dsn() -> str:
    """Return the WeChat database DSN from environment."""
    dsn = os.environ.get("WECHAT_DATABASE_URL")
    if not dsn:
        raise RuntimeError("WECHAT_DATABASE_URL environment variable is not set")
    return dsn


def _serialize(value: Any) -> Any:
    """Recursively convert non-JSON-serialisable types."""
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _row_to_dict(row: tuple[Any, ...], description: list[Any]) -> dict[str, Any]:
    """Convert a psycopg row tuple to a plain dict with serialisable values."""
    return {col.name: _serialize(val) for col, val in zip(description, row)}


async def _query(sql: str, params: tuple[Any, ...] = ()) -> tuple[list[dict[str, Any]], None]:
    """Execute a parameterised query and return all rows as dicts.

    Opens and closes a fresh async connection for each call so tools remain
    stateless and safe for concurrent use.

    Args:
        sql: SQL string with ``%s`` positional placeholders.
        params: Positional bind values.
    """
    async with await psycopg.AsyncConnection.connect(conninfo=_wechat_dsn()) as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, params)
            rows = await cur.fetchall()
            description = cur.description or []
            return [_row_to_dict(row, description) for row in rows], None


# ---------------------------------------------------------------------------
# Exported tools
# ---------------------------------------------------------------------------


@tool
async def count_wechat_articles(
    source: str | None = None,
    keyword: str | None = None,
) -> dict[str, Any]:
    """Count WeChat articles, optionally filtered by source name or keyword.

    Use this before listing to report the total number of matching articles
    without fetching full rows.

    Args:
        source: Case-insensitive substring to match against the source name.
        keyword: Case-insensitive substring to match against article titles.
    """
    conditions: list[str] = []
    params: list[Any] = []

    if source is not None:
        params.append(f"%{source}%")
        conditions.append("s.name ILIKE %s")

    if keyword is not None:
        params.append(f"%{keyword}%")
        conditions.append("a.title ILIKE %s")

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    sql = f"""
        SELECT COUNT(*) AS total
        FROM wechat_articles.articles a
        JOIN wechat_articles.sources s ON s.id = a.source_id
        {where_clause}
    """

    rows, _ = await _query(sql, tuple(params))
    total = rows[0]["total"] if rows else 0
    return {"total": int(total)}


@tool
async def list_wechat_articles(
    source: str | None = None,
    keyword: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """List WeChat articles with title, source, publish time, author, and URL.

    Results are ordered by publish time descending (most recent first). Use
    ``count_wechat_articles`` first when you need the total before paginating.

    Args:
        source: Case-insensitive substring to match against the source name.
        keyword: Case-insensitive substring to match against article titles.
        limit: Maximum number of rows to return (default 20).
    """
    conditions: list[str] = []
    params: list[Any] = []

    if source is not None:
        params.append(f"%{source}%")
        conditions.append("s.name ILIKE %s")

    if keyword is not None:
        params.append(f"%{keyword}%")
        conditions.append("a.title ILIKE %s")

    params.append(limit)

    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    sql = f"""
        SELECT
            a.title,
            s.name   AS source,
            a.publish_time,
            a.author,
            a.url
        FROM wechat_articles.articles a
        JOIN wechat_articles.sources s ON s.id = a.source_id
        {where_clause}
        ORDER BY a.publish_time DESC NULLS LAST
        LIMIT %s
    """

    rows, _ = await _query(sql, tuple(params))
    return {"articles": rows}


@tool
async def list_wechat_sources() -> dict[str, Any]:
    """List all WeChat sources with their article counts.

    Use this to enumerate available sources or to help the user discover which
    accounts or publishers are tracked in the system.
    """
    sql = """
        SELECT
            s.name,
            COUNT(a.id) AS article_count
        FROM wechat_articles.sources s
        LEFT JOIN wechat_articles.articles a ON a.source_id = s.id
        GROUP BY s.id, s.name
        ORDER BY article_count DESC, s.name
    """

    rows, _ = await _query(sql)
    return {"sources": rows}


HUB_WECHAT_TOOLS = [
    count_wechat_articles,
    list_wechat_articles,
    list_wechat_sources,
]


# --- hermes.registry self-registration (P2) -------------------------------
# Individual top-level call (not a for-loop) so discover_builtin_tools' AST
# check identifies this module as a tool module.
from hermes.registry import registry

registry.register(
    name=HUB_WECHAT_TOOLS[0].name,
    toolset="wechat",
    tool=HUB_WECHAT_TOOLS[0],
    description=getattr(HUB_WECHAT_TOOLS[0], "description", "") or "",
)

for _t in HUB_WECHAT_TOOLS[1:]:
    registry.register(
        name=_t.name,
        toolset="wechat",
        tool=_t,
        description=getattr(_t, "description", "") or "",
    )
