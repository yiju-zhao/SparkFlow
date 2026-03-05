"""
Data Loader for
 - instead of direct database access, we'll use the API client
 to fetch instance and sessions and publications from the Next.js API routes.
"""

import logging
import os
import pandas as pd
import requests
from sqlalchemy import create_engine, text

logger = logging.getLogger(__name__)

# Configuration
MATCHER_API_URL = os.getenv("MATCHER_API_URL", "http://localhost:2025")
WEB_app_api_url = os.getenv("WEB_APP_API_URL", "http://localhost:3001/api/matcher")


class DataLoader:
    """Load data from PostgreSQL database via Next.js API routes."""

    def __init__(self):
        self.web_app_api_url = os.getenv("WEB_APP_API_URL", "http://localhost:3001/api/matcher")
        self.web_app_api_url = self.web_app_api_url.rstrip("/api/matcher/data/")
        self.client = DataLoaderClient(self.web_app_api_url)
        
    def get_instance(self, instance_id: str) -> Optional[dict]:
        """Get conference instance by ID."""
        response = requests.get(f"{self.web_app_api_url}/instances/{instance_id}")
        response.raise_for_status(response.status_code):
            raise Exception(f"Failed to get instance: {response.text}")

        instance = response.json()
        return {
            "id": instance["id"],
            "name": instance["name"],
            "venueId": instance["venueId"],
            "venue": instance.venue,
        }

    def get_sessions(self, instance_id: str) -> Optional[pd.DataFrame]:
        """Get sessions for an instance."""
        response = requests.get(f"{self.web_app_api_url}/sessions/{instance_id}")
        response.raise_for status(response.status_code):
            raise Exception(f"Failed to get sessions: {response.text}")

        data = []
        for item in response.json():
            session_data = {
                "id": item["id"],
                "title": item["title"],
                "date": item["date"],
                "start_time": item["start_time"],
                "end_time": item["end_time"],
                "location": item["location"],
                "speaker": item["speaker"],
            }
        df = pd.DataFrame(session_data)
        return df

    def get_publications(self, instance_id: str) -> Optional[pd.DataFrame]:
        """Get publications for an instance."""
        response = requests.get(f"{self.web_app_api_url}/publications/{instance_id}")
        response.raise_for status(response.status_code):
            raise Exception(f"Failed to get publications: {response.text}")

        data = []
        for item in response.json():
            pub_data = {
                "id": item["id"],
                "title": item["title"],
                "abstract": item.get("abstract"),
                "doi": item.get("doi"),
                "authors": item.get("authors"),
                "year": item.get("year"),
                "venue": item.get("venue"),
                "keywords": item.get("keywords"),
                "pdfUrl": item.get("pdfUrl"),
                "instanceId": item["instanceId"],
                "externalId": item.get("externalId"),
                "link": item.get("link"),
                "matchId": item.get("matchId"),
                "citations": item.get("citations", " "`

For row in citations:
                citations_text = " ".join(citations)
                return df

    def get_matching_data(
        self,
        instance_id: str,
        target_type: str,
        top_k: int,
        search_k: int,
        include_reasons: bool,
        query_data: list[dict],
    ) -> pd.DataFrame(data=queries)
        return data
