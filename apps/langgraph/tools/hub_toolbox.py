"""Hub conference / publication query tools — direct psycopg3.

Replaces the GenAI Toolbox MCP layer (apps/toolbox/tools.yaml +
tools/toolbox_client.py, deleted in this commit) with inline SQL
against the main SparkFlow database. Mirrors the pattern in
``apps/langgraph/tools/hub_wechat.py``: per-call async connection,
positional ``%s`` placeholders, ``_row_to_dict`` serialization.

Schema mapping (per ``apps/web/prisma/schema.prisma``):
- ``publications`` (id, title, "instanceId", "researchTopic", status,
  authors[], affiliations[])
- ``conference_sessions`` (id, title, "instanceId", type, date, location,
  speaker[], topic[])
- ``instances`` (id, "venueId", year, name, location, website)
- ``venues`` (id, name, type)

Each tool's ``@tool`` signature matches the previous toolbox-wrapper
file (``str | None = None`` defaults) so ``agents/hub.py`` needs no
changes.
"""

from __future__ import annotations

import os
from datetime import datetime
from typing import Any, Literal

import psycopg
from langchain.tools import tool

# ---------------------------------------------------------------------------
# Internal helpers (mirror hub_wechat.py)
# ---------------------------------------------------------------------------


def _database_dsn() -> str:
    """Return the main SparkFlow database DSN from environment."""
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    return dsn


def _serialize(value: Any) -> Any:
    """Recursively convert non-JSON-serialisable types."""
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _row_to_dict(row: tuple[Any, ...], description: list[Any]) -> dict[str, Any]:
    """Convert a psycopg row tuple to a plain dict with serialisable values."""
    return {col.name: _serialize(val) for col, val in zip(description, row)}


async def _query(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """Execute a parameterised query and return all rows as dicts.

    Opens and closes a fresh async connection per call so tools remain
    stateless and safe for concurrent use. Matches hub_wechat.py's
    pattern except for the return shape: this returns the row list
    directly (not a ``(rows, None)`` tuple — the trailing ``None`` was
    vestigial).

    Args:
        sql: SQL string with ``%s`` positional placeholders.
        params: Positional bind values.
    """
    async with await psycopg.AsyncConnection.connect(conninfo=_database_dsn()) as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, params)
            rows = await cur.fetchall()
            description = cur.description or []
            return [_row_to_dict(row, description) for row in rows]


# ---------------------------------------------------------------------------
# Type literals for aggregation dimensions
# ---------------------------------------------------------------------------

PublicationGroup = Literal["year", "venue", "research_topic", "status"]
SessionGroup = Literal["year", "venue", "type"]
InstanceGroup = Literal["year", "venue"]


# Static maps from group_by literal → SQL expression. Safe because the
# Literal type constrains the input to known keys; the SQL fragment is
# never built from arbitrary user input.
_PUBLICATION_DIMENSIONS: dict[str, str] = {
    "year": "i.year",
    "venue": "v.name",
    "research_topic": "COALESCE(NULLIF(p.\"researchTopic\", ''), 'Unknown')",
    "status": "COALESCE(NULLIF(p.status, ''), 'Unknown')",
}

_SESSION_DIMENSIONS: dict[str, str] = {
    "year": "i.year",
    "venue": "v.name",
    "type": "COALESCE(NULLIF(s.type, ''), 'Unknown')",
}

_INSTANCE_DIMENSIONS: dict[str, str] = {
    "year": "i.year",
    "venue": "v.name",
}


# ---------------------------------------------------------------------------
# Schema-describe tools (static metadata, no DB call)
# ---------------------------------------------------------------------------


@tool
async def describe_publications_schema() -> dict[str, Any]:
    """Describe publication fields and recommended filters."""
    return {
        "table": "publications",
        "fields": [
            "id",
            "title",
            "venue",
            "year",
            "research_topic",
            "status",
            "authors[]",
            "affiliations[]",
        ],
        "filters": {
            "venue": "fuzzy match on venue name",
            "year": "exact year (int)",
            "affiliation": "fuzzy match across affiliations array",
            "author": "fuzzy match across authors array",
            "topic": "fuzzy match on research_topic",
            "status": "fuzzy match on status (e.g., 'accepted', 'submitted')",
        },
        "aggregations": list(_PUBLICATION_DIMENSIONS.keys()),
    }


@tool
async def describe_sessions_schema() -> dict[str, Any]:
    """Describe conference session fields and recommended filters."""
    return {
        "table": "conference_sessions",
        "fields": [
            "id",
            "title",
            "venue",
            "year",
            "type",
            "date",
            "location",
            "speaker[]",
            "topic[]",
        ],
        "filters": {
            "venue": "fuzzy match on venue name",
            "year": "exact year (int)",
            "session_type": "fuzzy match on type (e.g., 'keynote', 'paper', 'workshop')",
            "topic": "fuzzy match across topic array",
            "speaker": "fuzzy match across speaker array",
        },
        "aggregations": list(_SESSION_DIMENSIONS.keys()),
    }


@tool
async def describe_instances_schema() -> dict[str, Any]:
    """Describe conference instance fields and recommended filters."""
    return {
        "table": "instances",
        "fields": ["id", "venue", "year", "name", "location", "website"],
        "filters": {
            "venue": "fuzzy match on venue name",
            "year": "exact year (int)",
        },
        "aggregations": list(_INSTANCE_DIMENSIONS.keys()),
    }


@tool
async def describe_venues_schema() -> dict[str, Any]:
    """Describe conference venue fields and recommended filters."""
    return {
        "table": "venues",
        "fields": ["id", "name", "type", "instance_count"],
        "filters": {
            "query": "fuzzy match on venue name",
        },
    }


# ---------------------------------------------------------------------------
# Publication filter-value listing tools
#
# All four share the same shape: SELECT distinct values from a
# publications-joined-to-instances-joined-to-venues query, with optional
# fuzzy/exact filters. Two flavours:
#  - "unnested array" (affiliations, authors): need CROSS JOIN LATERAL
#    unnest(...); the value column is the unnested element; fuzzy filter
#    matches that same element.
#  - "scalar coalesced" (topics, statuses): no extra join; the displayed
#    value is COALESCE(NULLIF(field, ''), 'Unknown') so empty/null
#    surface as "Unknown" in the list, but the fuzzy filter matches the
#    underlying COALESCE(field, '') so querying "Unknown" doesn't match
#    the placeholder (matches the original toolbox semantics).
# ---------------------------------------------------------------------------


async def _list_unnested_dimension(
    *,
    array_field: str,  # e.g. 'p.affiliations'
    alias: str,  # e.g. 'aff'
    query: str | None,
    venue: str | None,
    year: int | None,
    limit: int,
) -> dict[str, Any]:
    conditions = [f"{alias}.value IS NOT NULL", f"{alias}.value <> ''"]
    params: list[Any] = []
    if query:
        conditions.append(f"{alias}.value ILIKE %s")
        params.append(f"%{query}%")
    if venue:
        conditions.append("v.name ILIKE %s")
        params.append(f"%{venue}%")
    if year:
        conditions.append("i.year = %s")
        params.append(year)
    sql = f"""
        SELECT {alias}.value AS value, COUNT(*)::int AS count
        FROM publications p
        JOIN instances i ON i.id = p."instanceId"
        JOIN venues v ON v.id = i."venueId"
        CROSS JOIN LATERAL unnest({array_field}) AS {alias}(value)
        WHERE {" AND ".join(conditions)}
        GROUP BY {alias}.value
        ORDER BY count DESC, value ASC
        LIMIT %s
    """
    params.append(limit)
    rows = await _query(sql, tuple(params))
    return {"items": rows}


async def _list_scalar_dimension(
    *,
    field: str,  # e.g. 'p."researchTopic"' or 'p.status'
    query: str | None,
    venue: str | None,
    year: int | None,
    limit: int,
) -> dict[str, Any]:
    conditions: list[str] = []
    params: list[Any] = []
    if query:
        # Filter on raw COALESCE(field, '') so 'Unknown' doesn't match the placeholder
        conditions.append(f"COALESCE({field}, '') ILIKE %s")
        params.append(f"%{query}%")
    if venue:
        conditions.append("v.name ILIKE %s")
        params.append(f"%{venue}%")
    if year:
        conditions.append("i.year = %s")
        params.append(year)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT value, COUNT(*)::int AS count
        FROM (
          SELECT COALESCE(NULLIF({field}, ''), 'Unknown') AS value
          FROM publications p
          JOIN instances i ON i.id = p."instanceId"
          JOIN venues v ON v.id = i."venueId"
          {where_clause}
        ) matches
        GROUP BY value
        ORDER BY count DESC, value ASC
        LIMIT %s
    """
    params.append(limit)
    rows = await _query(sql, tuple(params))
    return {"items": rows}


@tool
async def list_publication_affiliations(
    query: str | None = None,
    venue: str | None = None,
    year: int | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """List distinct publication affiliations for filter verification."""
    return await _list_unnested_dimension(
        array_field="p.affiliations",
        alias="aff",
        query=query,
        venue=venue,
        year=year,
        limit=limit,
    )


@tool
async def list_publication_authors(
    query: str | None = None,
    venue: str | None = None,
    year: int | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """List distinct publication authors for filter verification."""
    return await _list_unnested_dimension(
        array_field="p.authors",
        alias="author",
        query=query,
        venue=venue,
        year=year,
        limit=limit,
    )


@tool
async def list_publication_topics(
    query: str | None = None,
    venue: str | None = None,
    year: int | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """List distinct publication research topics for filter verification."""
    return await _list_scalar_dimension(
        field='p."researchTopic"',
        query=query,
        venue=venue,
        year=year,
        limit=limit,
    )


@tool
async def list_publication_statuses(
    query: str | None = None,
    venue: str | None = None,
    year: int | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """List distinct publication statuses for filter verification."""
    return await _list_scalar_dimension(
        field="p.status",
        query=query,
        venue=venue,
        year=year,
        limit=limit,
    )


# ---------------------------------------------------------------------------
# Publication count / list / aggregate
# ---------------------------------------------------------------------------


def _publication_filters(
    venue: str | None,
    year: int | None,
    affiliation: str | None,
    author: str | None,
    topic: str | None,
    status: str | None,
) -> tuple[list[str], list[Any]]:
    """Build WHERE conditions + params shared by count/list/aggregate."""
    conditions: list[str] = []
    params: list[Any] = []
    if venue:
        conditions.append("v.name ILIKE %s")
        params.append(f"%{venue}%")
    if year:
        conditions.append("i.year = %s")
        params.append(year)
    if affiliation:
        conditions.append("EXISTS (SELECT 1 FROM unnest(p.affiliations) aff WHERE aff ILIKE %s)")
        params.append(f"%{affiliation}%")
    if author:
        conditions.append("EXISTS (SELECT 1 FROM unnest(p.authors) author WHERE author ILIKE %s)")
        params.append(f"%{author}%")
    if topic:
        conditions.append("COALESCE(p.\"researchTopic\", '') ILIKE %s")
        params.append(f"%{topic}%")
    if status:
        conditions.append("COALESCE(p.status, '') ILIKE %s")
        params.append(f"%{status}%")
    return conditions, params


@tool
async def count_publications(
    venue: str | None = None,
    year: int | None = None,
    affiliation: str | None = None,
    author: str | None = None,
    topic: str | None = None,
    status: str | None = None,
) -> dict[str, Any]:
    """Count publications matching structured filters."""
    conditions, params = _publication_filters(venue, year, affiliation, author, topic, status)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT COUNT(*)::int AS value
        FROM publications p
        JOIN instances i ON i.id = p."instanceId"
        JOIN venues v ON v.id = i."venueId"
        {where_clause}
    """
    rows = await _query(sql, tuple(params))
    return {"value": int(rows[0]["value"]) if rows else 0}


@tool
async def list_publications(
    venue: str | None = None,
    year: int | None = None,
    affiliation: str | None = None,
    author: str | None = None,
    topic: str | None = None,
    status: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """List publications matching structured filters."""
    conditions, params = _publication_filters(venue, year, affiliation, author, topic, status)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT
          p.id,
          p.title,
          v.name AS venue,
          i.year,
          COALESCE(p."researchTopic", '') AS research_topic,
          COALESCE(p.status, '') AS status,
          p.authors,
          p.affiliations
        FROM publications p
        JOIN instances i ON i.id = p."instanceId"
        JOIN venues v ON v.id = i."venueId"
        {where_clause}
        ORDER BY i.year DESC, p.title ASC
        LIMIT %s
    """
    params.append(limit)
    rows = await _query(sql, tuple(params))
    return {"items": rows}


@tool
async def aggregate_publications(
    group_by: PublicationGroup,
    venue: str | None = None,
    year: int | None = None,
    affiliation: str | None = None,
    author: str | None = None,
    topic: str | None = None,
    status: str | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    """Aggregate publication counts by year, venue, research_topic, or status."""
    if group_by not in _PUBLICATION_DIMENSIONS:
        raise ValueError(f"Unsupported group_by={group_by!r}")
    dim_expr = _PUBLICATION_DIMENSIONS[group_by]
    conditions, params = _publication_filters(venue, year, affiliation, author, topic, status)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT {dim_expr} AS label, COUNT(*)::int AS value
        FROM publications p
        JOIN instances i ON i.id = p."instanceId"
        JOIN venues v ON v.id = i."venueId"
        {where_clause}
        GROUP BY {dim_expr}
        ORDER BY value DESC, label ASC
        LIMIT %s
    """
    params.append(limit)
    rows = await _query(sql, tuple(params))
    return {"items": rows}


# ---------------------------------------------------------------------------
# Session count / list / aggregate
# ---------------------------------------------------------------------------


def _session_filters(
    venue: str | None,
    year: int | None,
    session_type: str | None,
    topic: str | None,
    speaker: str | None,
) -> tuple[list[str], list[Any]]:
    conditions: list[str] = []
    params: list[Any] = []
    if venue:
        conditions.append("v.name ILIKE %s")
        params.append(f"%{venue}%")
    if year:
        conditions.append("i.year = %s")
        params.append(year)
    if session_type:
        conditions.append("COALESCE(s.type, '') ILIKE %s")
        params.append(f"%{session_type}%")
    if topic:
        conditions.append("EXISTS (SELECT 1 FROM unnest(s.topic) topic WHERE topic ILIKE %s)")
        params.append(f"%{topic}%")
    if speaker:
        conditions.append("EXISTS (SELECT 1 FROM unnest(s.speaker) speaker WHERE speaker ILIKE %s)")
        params.append(f"%{speaker}%")
    return conditions, params


@tool
async def count_sessions(
    venue: str | None = None,
    year: int | None = None,
    session_type: str | None = None,
    topic: str | None = None,
    speaker: str | None = None,
) -> dict[str, Any]:
    """Count conference sessions matching structured filters."""
    conditions, params = _session_filters(venue, year, session_type, topic, speaker)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT COUNT(*)::int AS value
        FROM conference_sessions s
        JOIN instances i ON i.id = s."instanceId"
        JOIN venues v ON v.id = i."venueId"
        {where_clause}
    """
    rows = await _query(sql, tuple(params))
    return {"value": int(rows[0]["value"]) if rows else 0}


@tool
async def list_sessions(
    venue: str | None = None,
    year: int | None = None,
    session_type: str | None = None,
    topic: str | None = None,
    speaker: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """List conference sessions matching structured filters."""
    conditions, params = _session_filters(venue, year, session_type, topic, speaker)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT
          s.id,
          s.title,
          v.name AS venue,
          i.year,
          COALESCE(s.type, '') AS type,
          s.date,
          COALESCE(s.location, '') AS location,
          s.speaker,
          s.topic
        FROM conference_sessions s
        JOIN instances i ON i.id = s."instanceId"
        JOIN venues v ON v.id = i."venueId"
        {where_clause}
        ORDER BY i.year DESC, s.title ASC
        LIMIT %s
    """
    params.append(limit)
    rows = await _query(sql, tuple(params))
    return {"items": rows}


@tool
async def aggregate_sessions(
    group_by: SessionGroup,
    venue: str | None = None,
    year: int | None = None,
    session_type: str | None = None,
    topic: str | None = None,
    speaker: str | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    """Aggregate session counts by year, venue, or type."""
    if group_by not in _SESSION_DIMENSIONS:
        raise ValueError(f"Unsupported group_by={group_by!r}")
    dim_expr = _SESSION_DIMENSIONS[group_by]
    conditions, params = _session_filters(venue, year, session_type, topic, speaker)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT {dim_expr} AS label, COUNT(*)::int AS value
        FROM conference_sessions s
        JOIN instances i ON i.id = s."instanceId"
        JOIN venues v ON v.id = i."venueId"
        {where_clause}
        GROUP BY {dim_expr}
        ORDER BY value DESC, label ASC
        LIMIT %s
    """
    params.append(limit)
    rows = await _query(sql, tuple(params))
    return {"items": rows}


# ---------------------------------------------------------------------------
# Instance count / list / aggregate
# ---------------------------------------------------------------------------


def _instance_filters(
    venue: str | None,
    year: int | None,
) -> tuple[list[str], list[Any]]:
    conditions: list[str] = []
    params: list[Any] = []
    if venue:
        conditions.append("v.name ILIKE %s")
        params.append(f"%{venue}%")
    if year:
        conditions.append("i.year = %s")
        params.append(year)
    return conditions, params


@tool
async def count_instances(
    venue: str | None = None,
    year: int | None = None,
) -> dict[str, Any]:
    """Count conference instances matching structured filters."""
    conditions, params = _instance_filters(venue, year)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT COUNT(*)::int AS value
        FROM instances i
        JOIN venues v ON v.id = i."venueId"
        {where_clause}
    """
    rows = await _query(sql, tuple(params))
    return {"value": int(rows[0]["value"]) if rows else 0}


@tool
async def list_instances(
    venue: str | None = None,
    year: int | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """List conference instances matching structured filters."""
    conditions, params = _instance_filters(venue, year)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT
          i.id,
          v.name AS venue,
          i.year,
          i.name,
          COALESCE(i.location, '') AS location,
          COALESCE(i.website, '') AS website
        FROM instances i
        JOIN venues v ON v.id = i."venueId"
        {where_clause}
        ORDER BY i.year DESC, v.name ASC
        LIMIT %s
    """
    params.append(limit)
    rows = await _query(sql, tuple(params))
    return {"items": rows}


@tool
async def aggregate_instances(
    group_by: InstanceGroup,
    venue: str | None = None,
    year: int | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    """Aggregate conference instance counts by year or venue."""
    if group_by not in _INSTANCE_DIMENSIONS:
        raise ValueError(f"Unsupported group_by={group_by!r}")
    dim_expr = _INSTANCE_DIMENSIONS[group_by]
    conditions, params = _instance_filters(venue, year)
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT {dim_expr} AS label, COUNT(*)::int AS value
        FROM instances i
        JOIN venues v ON v.id = i."venueId"
        {where_clause}
        GROUP BY {dim_expr}
        ORDER BY {dim_expr} ASC
        LIMIT %s
    """
    params.append(limit)
    rows = await _query(sql, tuple(params))
    return {"items": rows}


# ---------------------------------------------------------------------------
# Venue count / list
# ---------------------------------------------------------------------------


@tool
async def count_venues(query: str | None = None) -> dict[str, Any]:
    """Count conference venues, optionally filtered by fuzzy name match."""
    conditions: list[str] = []
    params: list[Any] = []
    if query:
        conditions.append("v.name ILIKE %s")
        params.append(f"%{query}%")
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT COUNT(*)::int AS value
        FROM venues v
        {where_clause}
    """
    rows = await _query(sql, tuple(params))
    return {"value": int(rows[0]["value"]) if rows else 0}


@tool
async def list_venues(
    query: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """List conference venues, optionally filtered by fuzzy name match."""
    conditions: list[str] = []
    params: list[Any] = []
    if query:
        conditions.append("v.name ILIKE %s")
        params.append(f"%{query}%")
    where_clause = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT
          v.id,
          v.name,
          COALESCE(v.type, '') AS type,
          COUNT(i.id)::int AS instance_count
        FROM venues v
        LEFT JOIN instances i ON i."venueId" = v.id
        {where_clause}
        GROUP BY v.id, v.name, v.type
        ORDER BY v.name ASC
        LIMIT %s
    """
    params.append(limit)
    rows = await _query(sql, tuple(params))
    return {"items": rows}


# ---------------------------------------------------------------------------
# Exported tool list (consumed by agents/hub.py)
# ---------------------------------------------------------------------------


HUB_TOOLBOX_TOOLS = [
    describe_publications_schema,
    describe_sessions_schema,
    describe_instances_schema,
    describe_venues_schema,
    list_publication_affiliations,
    list_publication_authors,
    list_publication_topics,
    list_publication_statuses,
    count_publications,
    list_publications,
    aggregate_publications,
    count_sessions,
    list_sessions,
    aggregate_sessions,
    count_instances,
    list_instances,
    aggregate_instances,
    count_venues,
    list_venues,
]
