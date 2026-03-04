"""
Data Loader Tool

Loads conference sessions and publications from PostgreSQL.
"""

import logging
import os
from datetime import datetime
from typing import Any, Optional

import pandas as pd
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)


class DataLoader:
    """Load data from PostgreSQL database."""

    def __init__(self):
        self.database_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/sparkflow")
        self.engine = create_engine(self.database_url)
        self.Session = sessionmaker(bind=self.engine)

    def get_instance(self, instance_id: str) -> Optional[dict]:
        """Get conference instance by ID."""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("SELECT * FROM instances WHERE id = :id"),
                {"id": instance_id},
            )
            row = result.fetchone()
            if row:
                return dict(row._mapping)
            return None

    def load_sessions(self, instance_id: str) -> Optional[pd.DataFrame]:
        """Load all sessions for an instance."""
        query = """
            SELECT
                id,
                title,
                type,
                date,
                start_time,
                end_time,
                location,
                speaker,
                abstract,
                overview,
                transcript,
                session_url,
                topic,
                affiliation,
                technology
            FROM conference_sessions
            WHERE instance_id = :instance_id
        """

        with self.engine.connect() as conn:
            df = pd.read_sql_query(
                text(query),
                conn,
                params={"instance_id": instance_id},
            )

        logger.info(f"Loaded {len(df)} sessions for instance {instance_id}")
        return df

    def load_publications(self, instance_id: str) -> Optional[pd.DataFrame]:
        """Load all publications for an instance."""
        query = """
            SELECT
                id,
                title,
                authors,
                abstract,
                summary,
                affiliations,
                countries,
                keywords,
                "researchTopic" as research_topic,
                rating,
                doi,
                "pdfUrl" as pdf_url,
                "githubUrl" as github_url,
                "websiteUrl" as website_url,
                status
            FROM publications
            WHERE instance_id = :instance_id
        """

        with self.engine.connect() as conn:
            df = pd.read_sql_query(
                text(query),
                conn,
                params={"instance_id": instance_id},
            )

        logger.info(f"Loaded {len(df)} publications for instance {instance_id}")
        return df

    def create_match_job(
        self,
        user_id: str,
        instance_id: str,
        target_type: str,
        top_k: int,
        search_k: int,
        include_reasons: bool,
        query_file_key: str,
        query_data: list[dict],
        query_count: int,
    ) -> str:
        """Create a new match job record."""
        import json

        query = """
            INSERT INTO match_jobs (
                user_id, instance_id, target_type, top_k, search_k,
                include_reasons, query_file_key, query_data, query_count,
                status, progress, created_at, updated_at
            ) VALUES (
                :user_id, :instance_id, :target_type, :top_k, :search_k,
                :include_reasons, :query_file_key, :query_data, :query_count,
                'PENDING', 0, NOW(), NOW()
            ) RETURNING id
        """

        with self.engine.connect() as conn:
            result = conn.execute(
                text(query),
                {
                    "user_id": user_id,
                    "instance_id": instance_id,
                    "target_type": target_type,
                    "top_k": top_k,
                    "search_k": search_k,
                    "include_reasons": include_reasons,
                    "query_file_key": query_file_key,
                    "query_data": json.dumps(query_data),
                    "query_count": query_count,
                },
            )
            conn.commit()
            row = result.fetchone()
            return row[0] if row else None

    def get_match_job(self, job_id: str) -> Optional[dict]:
        """Get match job by ID."""
        with self.engine.connect() as conn:
            result = conn.execute(
                text("SELECT * FROM match_jobs WHERE id = :id"),
                {"id": job_id},
            )
            row = result.fetchone()
            if row:
                return dict(row._mapping)
            return None

    def update_match_job(self, job_id: str, **kwargs) -> bool:
        """Update match job fields."""
        if not kwargs:
            return False

        # Build SET clause
        set_parts = []
        params = {"id": job_id}

        for key, value in kwargs.items():
            # Convert Python naming to SQL naming
            sql_key = self._to_sql_key(key)
            set_parts.append(f"{sql_key} = :{key}")

            # Handle JSON serialization
            if isinstance(value, (dict, list)):
                import json
                value = json.dumps(value)
            elif isinstance(value, datetime):
                value = value.isoformat()

            params[key] = value

        # Always update updated_at
        set_parts.append("updated_at = NOW()")

        query = f"UPDATE match_jobs SET {', '.join(set_parts)} WHERE id = :id"

        with self.engine.connect() as conn:
            conn.execute(text(query), params)
            conn.commit()

        return True

    def _to_sql_key(self, key: str) -> str:
        """Convert camelCase to snake_case."""
        import re
        return re.sub(r'([A-Z])', r'_\1', key).lower()
