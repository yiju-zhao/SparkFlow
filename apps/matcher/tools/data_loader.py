"""
Data Loader Tool

Loads conference sessions and publications from PostgreSQL via Next.js API routes.
"""

import logging
import os
from typing import Any, Optional

import requests

logger = logging.getLogger(__name__)


class DataLoaderClient:
    """Client for fetching data from Next.js API routes."""

    def __init__(self):
        self.web_app_api_url = os.getenv(
            "WEB_APP_API_URL", 
            "http://localhost:3001/api/matcher/data"
        )
        # Fallback to direct matcher service for backward compatibility
        self.matcher_api_url = os.getenv(
            "MATCHER_API_URL", 
            "http://localhost:2025"
        )

    def get_instance(self, instance_id: str) -> Optional[dict]:
        """Get conference instance by ID."""
        try:
            response = requests.get(
                f"{self.web_app_api_url}/instances/{instance_id}",
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to get instance {instance_id}: {e}")
            return None

    def get_sessions(self, instance_id: str) -> list[dict]:
        """Get sessions for an instance."""
        try:
            response = requests.get(
                f"{self.web_app_api_url}/sessions/{instance_id}",
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to get sessions for {instance_id}: {e}")
            return []

    def get_publications(self, instance_id: str) -> list[dict]:
        """Get publications for an instance."""
        try:
            response = requests.get(
                f"{self.web_app_api_url}/publications/{instance_id}",
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to get publications for {instance_id}: {e}")
            return []


# Keep DataLoader class for backward compatibility
class DataLoader:
    """Load data from Next.js API routes (no direct database access)."""

    def __init__(self):
        self.client = DataLoaderClient()

    def get_instance(self, instance_id: str) -> Optional[dict]:
        return self.client.get_instance(instance_id)

    def get_sessions(self, instance_id: str) -> list[dict]:
        return self.client.get_sessions(instance_id)

    def get_publications(self, instance_id: str) -> list[dict]:
        return self.client.get_publications(instance_id)

    def get_matching_data(
        self,
        instance_id: str,
        target_type: str,
        top_k: int,
        search_k: int,
        include_reasons: bool,
        query_data: list[dict],
    ) -> tuple[list[dict], list[dict]]:
        """Get matching data (sessions or publications) based on target type."""
        if target_type == "SESSION":
            sessions = self.get_sessions(instance_id)
            if not sessions:
                return [], query_data
            return sessions, query_data
        else:
            publications = self.get_publications(instance_id)
            if not publications:
                return [], query_data
            return publications, query_data

    def _to_sql_datetime(self, value: Any) -> Optional[str]:
        """Convert various datetime formats to ISO format."""
        if value is None:
            return None
        if isinstance(value, str):
            # Try various formats
            for fmt in ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y-%m-%d", "%d/%m/%Y"]:
                try:
                    dt = pd.to_datetime(value, format=fmt)
                    return dt.isoformat()
                except ValueError:
                    continue
        return None
