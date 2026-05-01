"""
Pydantic models for the matcher workflow API request/response schemas.

Ported from apps/semops/api/types.py — matcher-specific subset only.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel


class MatchJobStatus(str, Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class MatchTargetType(str, Enum):
    SESSION = "SESSION"
    PUBLICATION = "PUBLICATION"


class ParsedQueryInput(BaseModel):
    """A parsed query from the frontend."""

    id: str
    bu: str
    query: str
    row_index: int


class CreateMatchJobRequest(BaseModel):
    """Request to create a new match job.

    All data is passed directly from Next.js - no callbacks needed.
    """

    user_id: str
    instance_id: str
    target_type: MatchTargetType
    queries: list[ParsedQueryInput]
    target_data: list[dict[str, Any]]  # Sessions or publications fetched by Next.js
    top_k: int = 50
    search_k: int = 350
    include_reasons: bool = True
    # Model configuration + BYOK credential threaded from Next.js. Required —
    # the apps/langgraph workflow layer does not carry its own API keys.
    model_provider: str
    model_name: str
    api_key: str
    api_base: Optional[str] = None


class MatchJobResponse(BaseModel):
    """Response for match job operations."""

    id: str
    user_id: str
    instance_id: str
    target_type: MatchTargetType
    top_k: int
    search_k: int
    include_reasons: bool
    query_data: Optional[list[dict[str, Any]]] = None
    status: MatchJobStatus
    progress: int
    error_message: Optional[str] = None
    query_count: int
    match_count: int
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class JobProgressResponse(BaseModel):
    """Simplified response for job status polling."""

    id: str
    status: MatchJobStatus
    progress: int
    error_message: Optional[str] = None
    query_count: int
    match_count: int


class MatcherRunInput(BaseModel):
    """Plain-data, non-secret payload threaded through the LangGraph
    JobState as ``state["req"]``.

    Replaces the anonymous `_Req` class shim ``_run_and_persist`` used to
    build per-request. Holds only fields safe to log / checkpoint /
    trace. BYOK credentials (``api_key`` / ``api_base``) live exclusively
    in ``RunnableConfig.configurable.lm_config`` — keeping them out of
    state means they never reach LangSmith, the checkpoint store, or any
    state.repr / pickle.

    `model_config['arbitrary_types_allowed']` is unnecessary because all
    fields are JSON-serializable primitives.
    """

    queries: list[dict[str, Any]]
    target_type: str
    top_k: int
    search_k: int
    include_reasons: bool
