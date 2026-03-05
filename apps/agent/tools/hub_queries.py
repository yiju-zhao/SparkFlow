"""
Hub query tools for the Research Hub agent.

These tools query the PostgreSQL database directly to retrieve
conference venues, instances, and sessions.
"""

import json
import logging
import os

import psycopg
from langchain.tools import tool

logger = logging.getLogger(__name__)


def _get_db_url() -> str:
    """Get database connection URL from environment."""
    url = os.getenv("DATABASE_URL", "")
    if not url:
        raise ValueError("DATABASE_URL environment variable is not set")
    return url


# =============================================================================
# Tools
# =============================================================================


@tool
def list_venues() -> str:
    """List all conference venues with their instance counts.

    Returns a summary of available conference venues (e.g., CVPR, NeurIPS).
    """
    try:
        with psycopg.connect(_get_db_url()) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT v.id, v.name, v.type, v.description,
                           COUNT(i.id) AS instance_count
                    FROM venues v
                    LEFT JOIN instances i ON i."venueId" = v.id
                    GROUP BY v.id, v.name, v.type, v.description
                    ORDER BY v.name
                """)
                rows = cur.fetchall()

        if not rows:
            return "No venues found in the database."

        lines = ["== Conference Venues ==\n"]
        for row in rows:
            vid, name, vtype, description, count = row
            type_str = f" [{vtype}]" if vtype else ""
            desc_str = f" - {description}" if description else ""
            lines.append(f"- {name}{type_str} ({count} instances){desc_str}  [id: {vid}]")

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"list_venues error: {e}")
        return f"Error listing venues: {e}"


@tool
def list_instances(venue_id: str = "") -> str:
    """List conference instances, optionally filtered by venue.

    Args:
        venue_id: Optional venue ID to filter instances. Leave empty to list all instances.
    """
    try:
        with psycopg.connect(_get_db_url()) as conn:
            with conn.cursor() as cur:
                if venue_id:
                    cur.execute("""
                        SELECT i.id, i.name, i.year, v.name AS venue_name,
                               i.location, i.website,
                               COUNT(s.id) AS session_count
                        FROM instances i
                        JOIN venues v ON v.id = i."venueId"
                        LEFT JOIN conference_sessions s ON s."instanceId" = i.id
                        WHERE i."venueId" = %s
                        GROUP BY i.id, i.name, i.year, v.name, i.location, i.website
                        ORDER BY i.year DESC, i.name
                    """, (venue_id,))
                else:
                    cur.execute("""
                        SELECT i.id, i.name, i.year, v.name AS venue_name,
                               i.location, i.website,
                               COUNT(s.id) AS session_count
                        FROM instances i
                        JOIN venues v ON v.id = i."venueId"
                        LEFT JOIN conference_sessions s ON s."instanceId" = i.id
                        GROUP BY i.id, i.name, i.year, v.name, i.location, i.website
                        ORDER BY i.year DESC, i.name
                    """)
                rows = cur.fetchall()

        if not rows:
            return "No conference instances found."

        lines = ["== Conference Instances ==\n"]
        for row in rows:
            iid, name, year, venue_name, location, website, session_count = row
            loc_str = f" | {location}" if location else ""
            lines.append(
                f"- {venue_name} {year}: {name} ({session_count} sessions){loc_str}  [id: {iid}]"
            )

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"list_instances error: {e}")
        return f"Error listing instances: {e}"


@tool
def list_sessions(instance_id: str) -> str:
    """List all sessions for a specific conference instance.

    Args:
        instance_id: The ID of the conference instance to list sessions for.
    """
    try:
        with psycopg.connect(_get_db_url()) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT s.id, s.title, s.type, s.date, s."startTime",
                           s."endTime", s.location, s.speaker, s.topic
                    FROM conference_sessions s
                    WHERE s."instanceId" = %s
                    ORDER BY s.date NULLS LAST, s."startTime" NULLS LAST, s.title
                """, (instance_id,))
                rows = cur.fetchall()

        if not rows:
            return f"No sessions found for instance ID: {instance_id}"

        lines = [f"== Sessions (instance: {instance_id}) ==\n"]
        for row in rows:
            sid, title, stype, date, start_time, end_time, location, speaker, topic = row
            type_str = f" [{stype}]" if stype else ""
            date_str = f" | {date.strftime('%Y-%m-%d')}" if date else ""
            time_str = f" {start_time}" if start_time else ""
            if end_time:
                time_str += f"-{end_time}"
            loc_str = f" | {location}" if location else ""
            speaker_str = f" | {', '.join(speaker)}" if speaker else ""
            topic_str = f" | topics: {', '.join(topic)}" if topic else ""
            lines.append(
                f"- {title}{type_str}{date_str}{time_str}{loc_str}{speaker_str}{topic_str}  [id: {sid}]"
            )

        return "\n".join(lines)

    except Exception as e:
        logger.error(f"list_sessions error: {e}")
        return f"Error listing sessions: {e}"


@tool
def search_sessions(query: str) -> str:
    """Search conference sessions by keyword across titles, abstracts, and speakers.

    Args:
        query: Search keyword or phrase (e.g., "transformer", "diffusion models", "Hinton")
    """
    try:
        with psycopg.connect(_get_db_url()) as conn:
            with conn.cursor() as cur:
                # Case-insensitive search across title, abstract, overview, and speaker array
                cur.execute("""
                    SELECT s.id, s.title, s.type, s.date, s.speaker, s.topic,
                           v.name AS venue_name, i.year
                    FROM conference_sessions s
                    JOIN instances i ON i.id = s."instanceId"
                    JOIN venues v ON v.id = i."venueId"
                    WHERE
                        s.title ILIKE %s
                        OR s.abstract ILIKE %s
                        OR s.overview ILIKE %s
                        OR EXISTS (
                            SELECT 1 FROM unnest(s.speaker) AS sp WHERE sp ILIKE %s
                        )
                        OR EXISTS (
                            SELECT 1 FROM unnest(s.topic) AS tp WHERE tp ILIKE %s
                        )
                    ORDER BY s.date NULLS LAST, s.title
                    LIMIT 20
                """, (f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%", f"%{query}%"))
                rows = cur.fetchall()

        if not rows:
            return f"No sessions found matching '{query}'."

        lines = [f"== Search Results for '{query}' ==\n"]
        for row in rows:
            sid, title, stype, date, speaker, topic, venue_name, year = row
            type_str = f" [{stype}]" if stype else ""
            conf_str = f" | {venue_name} {year}" if venue_name else ""
            date_str = f" | {date.strftime('%Y-%m-%d')}" if date else ""
            speaker_str = f" | {', '.join(speaker)}" if speaker else ""
            topic_str = f" | topics: {', '.join(topic)}" if topic else ""
            lines.append(
                f"- {title}{type_str}{conf_str}{date_str}{speaker_str}{topic_str}  [id: {sid}]"
            )

        lines.append(f"\nFound {len(rows)} result(s).")
        return "\n".join(lines)

    except Exception as e:
        logger.error(f"search_sessions error: {e}")
        return f"Error searching sessions: {e}"
