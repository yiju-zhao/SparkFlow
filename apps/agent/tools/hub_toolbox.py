"""Curated read-only tools that proxy to GenAI Toolbox."""

from __future__ import annotations

from typing import Any, Literal

from langchain.tools import tool

from tools.toolbox_client import call_toolbox_tool

PublicationGroup = Literal["year", "venue", "research_topic", "status"]
SessionGroup = Literal["year", "venue", "type"]
InstanceGroup = Literal["year", "venue"]


def _clean_args(**kwargs: Any) -> dict[str, Any]:
    return {key: value for key, value in kwargs.items() if value is not None}


@tool
async def describe_publications_schema() -> dict[str, Any]:
    """Describe publication fields and recommended filters."""
    return await call_toolbox_tool("describe-publications-schema")


@tool
async def describe_sessions_schema() -> dict[str, Any]:
    """Describe conference session fields and recommended filters."""
    return await call_toolbox_tool("describe-sessions-schema")


@tool
async def describe_instances_schema() -> dict[str, Any]:
    """Describe conference instance fields and recommended filters."""
    return await call_toolbox_tool("describe-instances-schema")


@tool
async def describe_venues_schema() -> dict[str, Any]:
    """Describe conference venue fields and recommended filters."""
    return await call_toolbox_tool("describe-venues-schema")


@tool
async def list_publication_affiliations(
    query: str | None = None,
    venue: str | None = None,
    year: int | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """List distinct publication affiliations for filter verification."""
    return await call_toolbox_tool(
        "list-publication-affiliations",
        _clean_args(query=query, venue=venue, year=year, limit=limit),
    )


@tool
async def list_publication_authors(
    query: str | None = None,
    venue: str | None = None,
    year: int | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """List distinct publication authors for filter verification."""
    return await call_toolbox_tool(
        "list-publication-authors",
        _clean_args(query=query, venue=venue, year=year, limit=limit),
    )


@tool
async def list_publication_topics(
    query: str | None = None,
    venue: str | None = None,
    year: int | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """List distinct publication topics for filter verification."""
    return await call_toolbox_tool(
        "list-publication-topics",
        _clean_args(query=query, venue=venue, year=year, limit=limit),
    )


@tool
async def list_publication_statuses(
    query: str | None = None,
    venue: str | None = None,
    year: int | None = None,
    limit: int = 10,
) -> dict[str, Any]:
    """List distinct publication statuses for filter verification."""
    return await call_toolbox_tool(
        "list-publication-statuses",
        _clean_args(query=query, venue=venue, year=year, limit=limit),
    )


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
    return await call_toolbox_tool(
        "count-publications",
        _clean_args(
            venue=venue,
            year=year,
            affiliation=affiliation,
            author=author,
            topic=topic,
            status=status,
        ),
    )


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
    return await call_toolbox_tool(
        "list-publications",
        _clean_args(
            venue=venue,
            year=year,
            affiliation=affiliation,
            author=author,
            topic=topic,
            status=status,
            limit=limit,
        ),
    )


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
    """Aggregate publication counts by year, venue, topic, or status."""
    return await call_toolbox_tool(
        f"aggregate-publications-by-{group_by.replace('_', '-')}",
        _clean_args(
            venue=venue,
            year=year,
            affiliation=affiliation,
            author=author,
            topic=topic,
            status=status,
            limit=limit,
        ),
    )


@tool
async def count_sessions(
    venue: str | None = None,
    year: int | None = None,
    session_type: str | None = None,
    topic: str | None = None,
    speaker: str | None = None,
) -> dict[str, Any]:
    """Count conference sessions matching structured filters."""
    return await call_toolbox_tool(
        "count-sessions",
        _clean_args(
            venue=venue,
            year=year,
            session_type=session_type,
            topic=topic,
            speaker=speaker,
        ),
    )


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
    return await call_toolbox_tool(
        "list-sessions",
        _clean_args(
            venue=venue,
            year=year,
            session_type=session_type,
            topic=topic,
            speaker=speaker,
            limit=limit,
        ),
    )


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
    return await call_toolbox_tool(
        f"aggregate-sessions-by-{group_by.replace('_', '-')}",
        _clean_args(
            venue=venue,
            year=year,
            session_type=session_type,
            topic=topic,
            speaker=speaker,
            limit=limit,
        ),
    )


@tool
async def count_instances(
    venue: str | None = None,
    year: int | None = None,
) -> dict[str, Any]:
    """Count conference instances matching structured filters."""
    return await call_toolbox_tool(
        "count-instances",
        _clean_args(venue=venue, year=year),
    )


@tool
async def list_instances(
    venue: str | None = None,
    year: int | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """List conference instances matching structured filters."""
    return await call_toolbox_tool(
        "list-instances",
        _clean_args(venue=venue, year=year, limit=limit),
    )


@tool
async def aggregate_instances(
    group_by: InstanceGroup,
    venue: str | None = None,
    year: int | None = None,
    limit: int = 12,
) -> dict[str, Any]:
    """Aggregate conference instance counts by year or venue."""
    return await call_toolbox_tool(
        f"aggregate-instances-by-{group_by.replace('_', '-')}",
        _clean_args(venue=venue, year=year, limit=limit),
    )


@tool
async def count_venues(query: str | None = None) -> dict[str, Any]:
    """Count conference venues, optionally filtered by fuzzy name match."""
    return await call_toolbox_tool(
        "count-venues",
        _clean_args(query=query),
    )


@tool
async def list_venues(query: str | None = None, limit: int = 20) -> dict[str, Any]:
    """List conference venues, optionally filtered by fuzzy name match."""
    return await call_toolbox_tool(
        "list-venues",
        _clean_args(query=query, limit=limit),
    )


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


# --- hermes.registry self-registration (P2) -------------------------------
# Individual top-level call (not a for-loop) so discover_builtin_tools' AST
# check identifies this module as a tool module.
from hermes.registry import registry

registry.register(
    name=HUB_TOOLBOX_TOOLS[0].name,
    toolset="hub",
    tool=HUB_TOOLBOX_TOOLS[0],
    description=getattr(HUB_TOOLBOX_TOOLS[0], "description", "") or "",
)

for _t in HUB_TOOLBOX_TOOLS[1:]:
    registry.register(
        name=_t.name,
        toolset="hub",
        tool=_t,
        description=getattr(_t, "description", "") or "",
    )
