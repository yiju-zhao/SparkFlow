"""
Pydantic models for API request/response schemas.
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

    Either queries or query_file_key must be provided.
    If queries is provided, it will be used directly (no file parsing needed).
    """

    user_id: str
    instance_id: str
    target_type: MatchTargetType
    queries: Optional[list[ParsedQueryInput]] = None
    query_file_key: Optional[str] = None
    top_k: int = 50
    search_k: int = 350
    include_reasons: bool = True


class MatchJobResponse(BaseModel):
    """Response for match job operations."""

    id: str
    user_id: str
    instance_id: str
    target_type: MatchTargetType
    top_k: int
    search_k: int
    include_reasons: bool
    query_file_key: Optional[str] = None
    query_data: Optional[list[dict[str, Any]]] = None
    result_file_key: Optional[str] = None
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


class ParsedQuery(BaseModel):
    """A parsed query from the uploaded Excel file."""

    id: str
    bu: str
    query: str
    row_index: int


class ParseFileRequest(BaseModel):
    """Request to parse an uploaded Excel file for preview."""

    file_key: str


class ParsedQueriesResponse(BaseModel):
    """Response for parsed queries preview."""

    queries: list[ParsedQuery]
    total_count: int
