"""
Pydantic models for API request/response schemas.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict


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
    # Model configuration from user settings
    model_provider: str = "google"
    model_name: str = "gemini-2.5-flash"


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


# ---------------------------------------------------------------------------
# Operators API — POST /api/operators/rank
# ---------------------------------------------------------------------------


class RankCandidate(BaseModel):
    """A single candidate passed to SemanticOperators.rank.

    Only ``id`` and ``match_text`` are required; arbitrary additional fields
    (e.g. ``title``, ``abstract``) are preserved via ``extra="allow"`` so they
    round-trip through the response.
    """

    model_config = ConfigDict(extra="allow")

    id: str
    match_text: str


class RankRequest(BaseModel):
    """Request body for POST /api/operators/rank."""

    candidates: list[RankCandidate]
    query_text: str
    top_k: int = 50
    search_k: int = 350
    include_reasons: bool = True


class RankResultItem(BaseModel):
    """A single ranked result.

    Mirrors ``RankCandidate``'s extra-passthrough semantics so any fields the
    semantic operator attached (beyond ``recommendation_reason``) survive.
    """

    model_config = ConfigDict(extra="allow")

    id: str
    match_text: str
    recommendation_reason: Optional[str] = None


class RankResponse(BaseModel):
    """Response body for POST /api/operators/rank."""

    results: list[RankResultItem]
    count: int
