"""Tests for tools.hub_toolbox (direct psycopg3 SQL replacement for the
former GenAI Toolbox MCP wrapper).

We mock ``tools.hub_toolbox._query`` to capture the rendered SQL and the
parameter tuple, so the assertions cover:
- WHERE clauses are composed only when the corresponding kwarg is non-empty
- Parameter binding order matches placeholder order in the SQL
- ``aggregate_*`` substitutes the expected dimension expression into both
  SELECT and GROUP BY (the static-map substitution is the safety
  guarantee replacing the old ``{{.dimension}}`` Go template)
- Schema-describe tools return their static dicts without touching the DB
"""

from __future__ import annotations

import re
from unittest.mock import AsyncMock, patch

import pytest

from tools.hub_toolbox import (
    HUB_TOOLBOX_TOOLS,
    aggregate_publications,
    count_publications,
    describe_publications_schema,
    list_publication_affiliations,
    list_publication_topics,
    list_venues,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize(sql: str) -> str:
    """Collapse all whitespace runs so multi-line SQL is easy to grep."""
    return re.sub(r"\s+", " ", sql).strip()


# ---------------------------------------------------------------------------
# Schema-describe tools (no DB touch)
# ---------------------------------------------------------------------------


async def test_describe_publications_schema_returns_static_shape():
    result = await describe_publications_schema.ainvoke({})
    assert result["table"] == "publications"
    assert "year" in result["aggregations"]
    assert "research_topic" in result["aggregations"]
    assert "filters" in result and "venue" in result["filters"]


# ---------------------------------------------------------------------------
# list_publication_affiliations — unnested array dimension
# ---------------------------------------------------------------------------


async def test_list_publication_affiliations_with_query_and_limit():
    """Fuzzy ``query`` becomes ``%query%``; limit is the trailing param."""
    fake = AsyncMock(return_value=[{"value": "Hugging Face", "count": 3}])
    with patch("tools.hub_toolbox._query", fake):
        result = await list_publication_affiliations.ainvoke(
            {"query": "hugging", "limit": 5}
        )

    assert result == {"items": [{"value": "Hugging Face", "count": 3}]}
    sql, params = fake.call_args.args
    sql_n = _normalize(sql)

    # The unnest CROSS JOIN is the load-bearing part.
    assert "CROSS JOIN LATERAL unnest(p.affiliations) AS aff(value)" in sql_n
    # ``query`` produced an ILIKE clause on the unnested element.
    assert "aff.value ILIKE %s" in sql_n
    # Group + order by the unnested value.
    assert "GROUP BY aff.value" in sql_n
    assert "LIMIT %s" in sql_n
    # Param order: query wrap, then limit. No venue/year clauses present.
    assert params == ("%hugging%", 5)
    assert "v.name ILIKE" not in sql_n
    assert "i.year =" not in sql_n


async def test_list_publication_affiliations_filters_compose_in_param_order():
    """All three optional filters set → params bind in (query, venue, year, limit) order."""
    fake = AsyncMock(return_value=[])
    with patch("tools.hub_toolbox._query", fake):
        await list_publication_affiliations.ainvoke(
            {"query": "deep", "venue": "neurips", "year": 2024, "limit": 7}
        )

    sql, params = fake.call_args.args
    sql_n = _normalize(sql)
    assert "aff.value ILIKE %s" in sql_n
    assert "v.name ILIKE %s" in sql_n
    assert "i.year = %s" in sql_n
    assert params == ("%deep%", "%neurips%", 2024, 7)


# ---------------------------------------------------------------------------
# list_publication_topics — scalar coalesced dimension
# ---------------------------------------------------------------------------


async def test_list_publication_topics_filter_uses_underlying_field_not_placeholder():
    """Querying for 'Unknown' must not match the COALESCE placeholder.

    The display projection is ``COALESCE(NULLIF(p."researchTopic", ''),
    'Unknown')`` — but the filter operates on ``COALESCE(p."researchTopic", '')``
    so the literal 'Unknown' label only surfaces in the result list, never
    matches the search term.
    """
    fake = AsyncMock(return_value=[])
    with patch("tools.hub_toolbox._query", fake):
        await list_publication_topics.ainvoke({"query": "Unknown", "limit": 5})

    sql, params = fake.call_args.args
    sql_n = _normalize(sql)
    # Filter uses the underlying-field COALESCE, NOT the display COALESCE.
    assert 'COALESCE(p."researchTopic", \'\') ILIKE %s' in sql_n
    # Display projection still emits 'Unknown' for the empty rows.
    assert "'Unknown'" in sql_n
    assert params == ("%Unknown%", 5)


# ---------------------------------------------------------------------------
# count_publications — composable filters, no LIMIT
# ---------------------------------------------------------------------------


async def test_count_publications_aggregates_filters_via_exists_subqueries():
    """``affiliation`` and ``author`` filter via ``EXISTS (... unnest(...))``."""
    fake = AsyncMock(return_value=[{"value": 42}])
    with patch("tools.hub_toolbox._query", fake):
        result = await count_publications.ainvoke(
            {"venue": "ICML", "year": 2025, "affiliation": "DeepMind", "author": "Hinton"}
        )

    assert result == {"value": 42}
    sql, params = fake.call_args.args
    sql_n = _normalize(sql)
    assert "EXISTS (SELECT 1 FROM unnest(p.affiliations) aff WHERE aff ILIKE %s)" in sql_n
    assert "EXISTS (SELECT 1 FROM unnest(p.authors) author WHERE author ILIKE %s)" in sql_n
    assert "LIMIT" not in sql_n  # count never paginates
    assert params == ("%ICML%", 2025, "%DeepMind%", "%Hinton%")


async def test_count_publications_no_filters_omits_where_clause():
    fake = AsyncMock(return_value=[{"value": 0}])
    with patch("tools.hub_toolbox._query", fake):
        await count_publications.ainvoke({})
    sql, params = fake.call_args.args
    assert "WHERE" not in _normalize(sql)
    assert params == ()


# ---------------------------------------------------------------------------
# aggregate_publications — Literal dimension → SQL fragment substitution
# ---------------------------------------------------------------------------


async def test_aggregate_publications_year_substitutes_simple_column():
    fake = AsyncMock(return_value=[{"label": 2024, "value": 9}])
    with patch("tools.hub_toolbox._query", fake):
        await aggregate_publications.ainvoke({"group_by": "year"})

    sql, _ = fake.call_args.args
    sql_n = _normalize(sql)
    assert "SELECT i.year AS label" in sql_n
    assert "GROUP BY i.year" in sql_n
    # Sanity: 'COALESCE' shouldn't leak in for the year dimension.
    assert "COALESCE" not in sql_n


async def test_aggregate_publications_research_topic_substitutes_coalesce_expression():
    """The research_topic dimension expands to the full COALESCE/NULLIF
    expression in BOTH the SELECT and the GROUP BY (so distinct buckets
    align with the displayed labels — postgres groups by the same
    expression it projects).
    """
    fake = AsyncMock(return_value=[])
    with patch("tools.hub_toolbox._query", fake):
        await aggregate_publications.ainvoke({"group_by": "research_topic", "limit": 3})

    sql, params = fake.call_args.args
    sql_n = _normalize(sql)
    coalesce_expr = 'COALESCE(NULLIF(p."researchTopic", \'\'), \'Unknown\')'
    # SELECT and GROUP BY must use the SAME expression — postgres can't
    # group by an output alias.
    assert f"SELECT {coalesce_expr} AS label" in sql_n
    assert f"GROUP BY {coalesce_expr}" in sql_n
    # No filters → params is just the limit.
    assert params == (3,)


async def test_aggregate_publications_unknown_group_rejected_at_tool_boundary():
    """Pydantic's Literal validation rejects unknown dimensions before
    the SQL-builder runs — the LLM literally cannot inject anything
    outside the static dimension map. This is what replaces the
    GenAI Toolbox's lack of ``{{.dimension}}`` validation.
    """
    from pydantic import ValidationError

    with pytest.raises(ValidationError, match="literal_error"):
        await aggregate_publications.ainvoke({"group_by": "totally_made_up"})


# ---------------------------------------------------------------------------
# list_venues — LEFT JOIN + GROUP BY for instance_count
# ---------------------------------------------------------------------------


async def test_list_venues_left_joins_instances_for_count():
    fake = AsyncMock(return_value=[{"id": 1, "name": "ICML", "type": "conference", "instance_count": 12}])
    with patch("tools.hub_toolbox._query", fake):
        await list_venues.ainvoke({"query": "i", "limit": 4})

    sql, params = fake.call_args.args
    sql_n = _normalize(sql)
    assert 'LEFT JOIN instances i ON i."venueId" = v.id' in sql_n
    assert "COUNT(i.id)::int AS instance_count" in sql_n
    assert "GROUP BY v.id, v.name, v.type" in sql_n
    assert params == ("%i%", 4)


# ---------------------------------------------------------------------------
# Public surface
# ---------------------------------------------------------------------------


def test_hub_toolbox_tools_exports_all_19_tools():
    """agents/hub.py imports HUB_TOOLBOX_TOOLS by name — guard the count
    so nobody accidentally drops a tool when refactoring.
    """
    names = {t.name for t in HUB_TOOLBOX_TOOLS}
    expected = {
        "describe_publications_schema",
        "describe_sessions_schema",
        "describe_instances_schema",
        "describe_venues_schema",
        "list_publication_affiliations",
        "list_publication_authors",
        "list_publication_topics",
        "list_publication_statuses",
        "count_publications",
        "list_publications",
        "aggregate_publications",
        "count_sessions",
        "list_sessions",
        "aggregate_sessions",
        "count_instances",
        "list_instances",
        "aggregate_instances",
        "count_venues",
        "list_venues",
    }
    assert names == expected
