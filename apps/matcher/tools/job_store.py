"""
Job Store

Simple in-memory storage for match jobs.
For production, consider using Redis or database.
"""

import logging
import threading
import uuid
from datetime import datetime
from typing import Any, Optional

logger = logging.getLogger(__name__)


class JobStore:
    """Thread-safe in-memory job storage."""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._jobs = {}
                    cls._instance._job_lock = threading.Lock()
        return cls._instance

    def create_job(
        self,
        user_id: str,
        instance_id: str,
        target_type: str,
        top_k: int,
        search_k: int,
        include_reasons: bool,
        query_data: list[dict],
        query_count: int,
        target_data: list[dict] = None,
        model_provider: str = None,  # For query optimizer only
        model_name: str = None,      # For query optimizer only
    ) -> str:
        """Create a new job and return its ID."""
        job_id = str(uuid.uuid4())
        now = datetime.utcnow()

        with self._job_lock:
            self._jobs[job_id] = {
                "id": job_id,
                "user_id": user_id,
                "instance_id": instance_id,
                "target_type": target_type,
                "top_k": top_k,
                "search_k": search_k,
                "include_reasons": include_reasons,
                "query_data": query_data,
                "query_count": query_count,
                "target_data": target_data or [],
                "model_provider": model_provider or "google",
                "model_name": model_name or "gemini-2.5-flash",
                "status": "PENDING",
                "progress": 0,
                "match_count": 0,
                "error_message": None,
                "result_data": None,
                "created_at": now,
                "updated_at": now,
                "started_at": None,
                "completed_at": None,
            }

        logger.info(f"Created job {job_id}")
        return job_id

    def get_job(self, job_id: str) -> Optional[dict]:
        """Get job by ID."""
        with self._job_lock:
            return self._jobs.get(job_id)

    def update_job(self, job_id: str, **kwargs) -> None:
        """Update job fields."""
        with self._job_lock:
            if job_id in self._jobs:
                self._jobs[job_id].update(kwargs)
                self._jobs[job_id]["updated_at"] = datetime.utcnow()

    def get_result_data(self, job_id: str) -> Optional[bytes]:
        """Get result Excel bytes for a job."""
        with self._job_lock:
            job = self._jobs.get(job_id)
            return job.get("result_data") if job else None

    def get_target_data(self, job_id: str) -> Optional[list[dict]]:
        """Get target data for a job."""
        with self._job_lock:
            job = self._jobs.get(job_id)
            return job.get("target_data") if job else None
