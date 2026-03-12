"""MCP Server for Research Hub with deterministic database tools.

This server exposes UI-oriented MCP tools for conference data:
- record_table: row-based records and detailed lists
- stats_chart: aggregate/trend/ranking visualizations
- stat_card: single KPI or headline metric

The hub agent decides which capability to use. The MCP server executes
deterministic SQL and returns normalized payloads for MCP Apps resources.
"""

import json
import os
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP
from psycopg import connect
from psycopg.rows import dict_row

load_dotenv()

mcp = FastMCP("HubMCPServer", stateless_http=True, json_response=True, port=3108)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

RecordEntity = Literal["venues", "instances", "publications", "sessions"]
Metric = Literal["conference_count", "instance_count", "publication_count", "session_count"]
ChartMetric = Literal["instances", "publications", "sessions"]
GroupBy = Literal["year", "venue", "research_topic", "session_type", "publication_status"]
SortOrder = Literal["asc", "desc"]


def get_ui_path(filename: str) -> Path:
    """Get the path to a UI template file."""
    return Path(__file__).parent / "ui" / filename


def _db_query(sql: str, params: list[Any] | None = None) -> list[dict[str, Any]]:
    """Execute SQL and return rows as dictionaries."""
    with connect(DATABASE_URL, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            return [dict(row) for row in cur.fetchall()]


def _db_value(sql: str, params: list[Any] | None = None) -> Any:
    """Execute SQL and return the first scalar value."""
    rows = _db_query(sql, params)
    if not rows:
        return None
    first_row = rows[0]
    return next(iter(first_row.values()), None)


def _clamp_limit(limit: int | None, default: int = 10, maximum: int = 50) -> int:
    if limit is None:
        return default
    return max(1, min(limit, maximum))


def _build_record_filters(
    entity: RecordEntity,
    venue: str | None,
    year: int | None,
    query: str | None,
    topic: str | None,
    publication_status: str | None,
    session_type: str | None,
) -> tuple[list[str], list[Any]]:
    conditions: list[str] = []
    params: list[Any] = []

    if venue:
        conditions.append("v.name ILIKE %s")
        params.append(f"%{venue}%")

    if year is not None:
        conditions.append("i.year = %s")
        params.append(year)

    if query:
        q = f"%{query}%"
        if entity == "venues":
            conditions.append("(v.name ILIKE %s OR COALESCE(v.description, '') ILIKE %s)")
            params.extend([q, q])
        elif entity == "instances":
            conditions.append(
                "(i.name ILIKE %s OR COALESCE(i.location, '') ILIKE %s OR v.name ILIKE %s)"
            )
            params.extend([q, q, q])
        elif entity == "publications":
            conditions.append(
                "(p.title ILIKE %s OR COALESCE(p.summary, '') ILIKE %s OR COALESCE(p.abstract, '') ILIKE %s)"
            )
            params.extend([q, q, q])
        elif entity == "sessions":
            conditions.append(
                "(s.title ILIKE %s OR COALESCE(s.overview, '') ILIKE %s OR COALESCE(s.abstract, '') ILIKE %s)"
            )
            params.extend([q, q, q])

    if topic:
        topic_q = f"%{topic}%"
        if entity == "publications":
            conditions.append(
                "(COALESCE(p.\"researchTopic\", '') ILIKE %s OR EXISTS (SELECT 1 FROM unnest(p.keywords) kw WHERE kw ILIKE %s))"
            )
            params.extend([topic_q, topic_q])
        elif entity == "sessions":
            conditions.append("EXISTS (SELECT 1 FROM unnest(s.topic) t WHERE t ILIKE %s)")
            params.append(topic_q)

    if publication_status and entity == "publications":
        conditions.append('COALESCE(p.status, \'\') ILIKE %s')
        params.append(f"%{publication_status}%")

    if session_type and entity == "sessions":
        conditions.append('COALESCE(s.type, \'\') ILIKE %s')
        params.append(f"%{session_type}%")

    return conditions, params


def _record_query(
    entity: RecordEntity,
    venue: str | None,
    year: int | None,
    query: str | None,
    topic: str | None,
    publication_status: str | None,
    session_type: str | None,
    limit: int,
    sort_order: SortOrder,
) -> tuple[str, list[Any], list[str], str]:
    order = "ASC" if sort_order == "asc" else "DESC"
    conditions, params = _build_record_filters(
        entity, venue, year, query, topic, publication_status, session_type
    )
    where_sql = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    if entity == "venues":
        sql = f"""
            SELECT
                v.id,
                v.name,
                v.type,
                COUNT(i.id)::int AS instance_count
            FROM venues v
            LEFT JOIN instances i ON i."venueId" = v.id
            {where_sql}
            GROUP BY v.id, v.name, v.type
            ORDER BY v.name {order}
            LIMIT %s
        """
        params.append(limit)
        columns = ["id", "name", "type", "instance_count"]
        title = "Venues"
    elif entity == "instances":
        sql = f"""
            SELECT
                i.id,
                v.name AS venue,
                i.year,
                i.name,
                i.location,
                COUNT(DISTINCT p.id)::int AS publication_count,
                COUNT(DISTINCT s.id)::int AS session_count
            FROM instances i
            JOIN venues v ON v.id = i."venueId"
            LEFT JOIN publications p ON p."instanceId" = i.id
            LEFT JOIN conference_sessions s ON s."instanceId" = i.id
            {where_sql}
            GROUP BY i.id, v.name, i.year, i.name, i.location
            ORDER BY i.year {order}, v.name ASC
            LIMIT %s
        """
        params.append(limit)
        columns = ["id", "venue", "year", "name", "location", "publication_count", "session_count"]
        title = "Conference Instances"
    elif entity == "publications":
        sql = f"""
            SELECT
                p.id,
                p.title,
                v.name AS venue,
                i.year,
                p."researchTopic" AS research_topic,
                p.status
            FROM publications p
            JOIN instances i ON i.id = p."instanceId"
            JOIN venues v ON v.id = i."venueId"
            {where_sql}
            ORDER BY i.year {order}, p.title ASC
            LIMIT %s
        """
        params.append(limit)
        columns = ["id", "title", "venue", "year", "research_topic", "status"]
        title = "Publications"
    else:
        sql = f"""
            SELECT
                s.id,
                s.title,
                v.name AS venue,
                i.year,
                s.type,
                s.date,
                s.location
            FROM conference_sessions s
            JOIN instances i ON i.id = s."instanceId"
            JOIN venues v ON v.id = i."venueId"
            {where_sql}
            ORDER BY i.year {order}, s.title ASC
            LIMIT %s
        """
        params.append(limit)
        columns = ["id", "title", "venue", "year", "type", "date", "location"]
        title = "Sessions"

    return sql, params, columns, title


def _chart_query(
    metric: ChartMetric,
    group_by: GroupBy,
    venue: str | None,
    year: int | None,
    topic: str | None,
    publication_status: str | None,
    session_type: str | None,
    limit: int,
) -> tuple[str, list[Any], str]:
    filters: list[str] = []
    params: list[Any] = []

    if venue:
        filters.append("v.name ILIKE %s")
        params.append(f"%{venue}%")
    if year is not None:
        filters.append("i.year = %s")
        params.append(year)
    if topic and metric == "publications":
        filters.append(
            '(COALESCE(p."researchTopic", \'\') ILIKE %s OR EXISTS (SELECT 1 FROM unnest(p.keywords) kw WHERE kw ILIKE %s))'
        )
        params.extend([f"%{topic}%", f"%{topic}%"])
    if topic and metric == "sessions":
        filters.append("EXISTS (SELECT 1 FROM unnest(s.topic) t WHERE t ILIKE %s)")
        params.append(f"%{topic}%")
    if publication_status and metric == "publications":
        filters.append('COALESCE(p.status, \'\') ILIKE %s')
        params.append(f"%{publication_status}%")
    if session_type and metric == "sessions":
        filters.append('COALESCE(s.type, \'\') ILIKE %s')
        params.append(f"%{session_type}%")

    where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""

    if group_by == "year":
        if metric == "instances":
            sql = f"""
                SELECT i.year AS label, COUNT(i.id)::int AS value
                FROM instances i
                JOIN venues v ON v.id = i."venueId"
                {where_sql}
                GROUP BY i.year
                ORDER BY i.year ASC
                LIMIT %s
            """
        elif metric == "publications":
            sql = f"""
                SELECT i.year AS label, COUNT(p.id)::int AS value
                FROM publications p
                JOIN instances i ON i.id = p."instanceId"
                JOIN venues v ON v.id = i."venueId"
                {where_sql}
                GROUP BY i.year
                ORDER BY i.year ASC
                LIMIT %s
            """
        else:
            sql = f"""
                SELECT i.year AS label, COUNT(s.id)::int AS value
                FROM conference_sessions s
                JOIN instances i ON i.id = s."instanceId"
                JOIN venues v ON v.id = i."venueId"
                {where_sql}
                GROUP BY i.year
                ORDER BY i.year ASC
                LIMIT %s
            """
        params.append(limit)
        return sql, params, "By Year"

    if group_by == "venue":
        if metric == "instances":
            sql = f"""
                SELECT v.name AS label, COUNT(i.id)::int AS value
                FROM instances i
                JOIN venues v ON v.id = i."venueId"
                {where_sql}
                GROUP BY v.name
                ORDER BY value DESC, v.name ASC
                LIMIT %s
            """
        elif metric == "publications":
            sql = f"""
                SELECT v.name AS label, COUNT(p.id)::int AS value
                FROM publications p
                JOIN instances i ON i.id = p."instanceId"
                JOIN venues v ON v.id = i."venueId"
                {where_sql}
                GROUP BY v.name
                ORDER BY value DESC, v.name ASC
                LIMIT %s
            """
        else:
            sql = f"""
                SELECT v.name AS label, COUNT(s.id)::int AS value
                FROM conference_sessions s
                JOIN instances i ON i.id = s."instanceId"
                JOIN venues v ON v.id = i."venueId"
                {where_sql}
                GROUP BY v.name
                ORDER BY value DESC, v.name ASC
                LIMIT %s
            """
        params.append(limit)
        return sql, params, "By Venue"

    if group_by == "research_topic":
        if metric != "publications":
            raise ValueError("group_by='research_topic' is only supported for metric='publications'")
        sql = f"""
            SELECT COALESCE(NULLIF(p."researchTopic", ''), 'Unknown') AS label, COUNT(p.id)::int AS value
            FROM publications p
            JOIN instances i ON i.id = p."instanceId"
            JOIN venues v ON v.id = i."venueId"
            {where_sql}
            GROUP BY label
            ORDER BY value DESC, label ASC
            LIMIT %s
        """
        params.append(limit)
        return sql, params, "By Research Topic"

    if group_by == "publication_status":
        if metric != "publications":
            raise ValueError("group_by='publication_status' is only supported for metric='publications'")
        sql = f"""
            SELECT COALESCE(NULLIF(p.status, ''), 'Unknown') AS label, COUNT(p.id)::int AS value
            FROM publications p
            JOIN instances i ON i.id = p."instanceId"
            JOIN venues v ON v.id = i."venueId"
            {where_sql}
            GROUP BY label
            ORDER BY value DESC, label ASC
            LIMIT %s
        """
        params.append(limit)
        return sql, params, "By Publication Status"

    if group_by == "session_type":
        if metric != "sessions":
            raise ValueError("group_by='session_type' is only supported for metric='sessions'")
        sql = f"""
            SELECT COALESCE(NULLIF(s.type, ''), 'Unknown') AS label, COUNT(s.id)::int AS value
            FROM conference_sessions s
            JOIN instances i ON i.id = s."instanceId"
            JOIN venues v ON v.id = i."venueId"
            {where_sql}
            GROUP BY label
            ORDER BY value DESC, label ASC
            LIMIT %s
        """
        params.append(limit)
        return sql, params, "By Session Type"

    raise ValueError(f"Unsupported group_by value: {group_by}")


def _card_query(
    metric: Metric,
    venue: str | None,
    year: int | None,
    topic: str | None,
    publication_status: str | None,
    session_type: str | None,
) -> tuple[str, list[Any], str, str | None]:
    filters: list[str] = []
    params: list[Any] = []
    subtitle_parts: list[str] = []

    if venue:
        filters.append("v.name ILIKE %s")
        params.append(f"%{venue}%")
        subtitle_parts.append(venue)
    if year is not None:
        filters.append("i.year = %s")
        params.append(year)
        subtitle_parts.append(str(year))

    if metric == "conference_count":
        where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
        sql = f"""
            SELECT COUNT(DISTINCT v.id)::int AS value
            FROM venues v
            LEFT JOIN instances i ON i."venueId" = v.id
            {where_sql}
        """
        return sql, params, "Conference Count", ", ".join(subtitle_parts) or None

    if metric == "instance_count":
        where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
        sql = f"""
            SELECT COUNT(DISTINCT i.id)::int AS value
            FROM instances i
            JOIN venues v ON v.id = i."venueId"
            {where_sql}
        """
        return sql, params, "Conference Instances", ", ".join(subtitle_parts) or None

    if metric == "publication_count":
        if topic:
            filters.append(
                '(COALESCE(p."researchTopic", \'\') ILIKE %s OR EXISTS (SELECT 1 FROM unnest(p.keywords) kw WHERE kw ILIKE %s))'
            )
            params.extend([f"%{topic}%", f"%{topic}%"])
            subtitle_parts.append(topic)
        if publication_status:
            filters.append('COALESCE(p.status, \'\') ILIKE %s')
            params.append(f"%{publication_status}%")
            subtitle_parts.append(publication_status)
        where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
        sql = f"""
            SELECT COUNT(p.id)::int AS value
            FROM publications p
            JOIN instances i ON i.id = p."instanceId"
            JOIN venues v ON v.id = i."venueId"
            {where_sql}
        """
        return sql, params, "Publication Count", ", ".join(subtitle_parts) or None

    if topic:
        filters.append("EXISTS (SELECT 1 FROM unnest(s.topic) t WHERE t ILIKE %s)")
        params.append(f"%{topic}%")
        subtitle_parts.append(topic)
    if session_type:
        filters.append('COALESCE(s.type, \'\') ILIKE %s')
        params.append(f"%{session_type}%")
        subtitle_parts.append(session_type)
    where_sql = f"WHERE {' AND '.join(filters)}" if filters else ""
    sql = f"""
        SELECT COUNT(s.id)::int AS value
        FROM conference_sessions s
        JOIN instances i ON i.id = s."instanceId"
        JOIN venues v ON v.id = i."venueId"
        {where_sql}
    """
    return sql, params, "Session Count", ", ".join(subtitle_parts) or None


def _infer_chart_type(group_by: GroupBy, labels: list[Any]) -> str:
    if group_by == "year":
        return "line"
    if group_by in {"publication_status", "session_type"} and len(labels) <= 6:
        return "pie"
    return "bar"


def _build_mcp_result(payload: dict[str, Any], resource_uri: str) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(payload)}],
        "structuredContent": payload,
        "_meta": {"ui": {"resourceUri": resource_uri}},
    }


@mcp.tool(meta={"ui/resourceUri": "ui://table"})
def record_table(
    entity: RecordEntity,
    venue: str | None = None,
    year: int | None = None,
    query: str | None = None,
    topic: str | None = None,
    publication_status: str | None = None,
    session_type: str | None = None,
    limit: int = 10,
    sort_order: SortOrder = "desc",
) -> dict:
    """Return detailed conference data as a table.

    Use for row-based results such as publication lists, session lists,
    venues, or conference instances.
    """
    safe_limit = _clamp_limit(limit)
    sql, params, columns, title = _record_query(
        entity=entity,
        venue=venue,
        year=year,
        query=query,
        topic=topic,
        publication_status=publication_status,
        session_type=session_type,
        limit=safe_limit,
        sort_order=sort_order,
    )
    rows = _db_query(sql, params)
    return _build_mcp_result(
        {"title": title, "columns": columns, "rows": rows},
        "ui://table",
    )


@mcp.tool(meta={"ui/resourceUri": "ui://chart"})
def stats_chart(
    metric: ChartMetric,
    group_by: GroupBy,
    venue: str | None = None,
    year: int | None = None,
    topic: str | None = None,
    publication_status: str | None = None,
    session_type: str | None = None,
    limit: int = 10,
) -> dict:
    """Return aggregate conference statistics as a chart.

    Use for trends, rankings, category breakdowns, and comparisons.
    """
    safe_limit = _clamp_limit(limit)
    sql, params, suffix = _chart_query(
        metric=metric,
        group_by=group_by,
        venue=venue,
        year=year,
        topic=topic,
        publication_status=publication_status,
        session_type=session_type,
        limit=safe_limit,
    )
    rows = _db_query(sql, params)
    labels = [row["label"] for row in rows]
    values = [row["value"] for row in rows]
    payload = {
        "title": f"{metric.replace('_', ' ').title()} {suffix}",
        "type": _infer_chart_type(group_by, labels),
        "labels": labels,
        "values": values,
    }
    return _build_mcp_result(payload, "ui://chart")


@mcp.tool(meta={"ui/resourceUri": "ui://stat-card"})
def stat_card(
    metric: Metric,
    venue: str | None = None,
    year: int | None = None,
    topic: str | None = None,
    publication_status: str | None = None,
    session_type: str | None = None,
) -> dict:
    """Return a single KPI or headline statistic.

    Use for one number: counts, totals, or headline metrics.
    """
    sql, params, title, subtitle = _card_query(
        metric=metric,
        venue=venue,
        year=year,
        topic=topic,
        publication_status=publication_status,
        session_type=session_type,
    )
    value = _db_value(sql, params)
    return _build_mcp_result(
        {"title": title, "value": value if value is not None else 0, "subtitle": subtitle},
        "ui://stat-card",
    )


@mcp.resource("ui://table")
def table_template() -> str:
    template_path = get_ui_path("table.html")
    return template_path.read_text()


@mcp.resource("ui://chart")
def chart_template() -> str:
    template_path = get_ui_path("chart.html")
    return template_path.read_text()


@mcp.resource("ui://stat-card")
def stat_card_template() -> str:
    template_path = get_ui_path("stat-card.html")
    return template_path.read_text()


if __name__ == "__main__":
    print("Starting Hub MCP Server on port 3108...")
    mcp.run(transport="streamable-http")
