"""
Pydantic models for chat API requests and responses.
"""

from typing import Optional, List, Any
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """A single chat message."""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    """Request body for chat endpoint."""
    notebook_id: str = Field(..., description="Notebook ID for context")
    session_id: Optional[str] = Field(None, description="Chat session ID (optional, creates new if not provided)")
    message: str = Field(..., description="User's message")
    messages: Optional[List[ChatMessage]] = Field(default=[], description="Previous messages for context")

    # RagFlow configuration (from notebook)
    dataset_ids: Optional[List[str]] = Field(default=[], description="RagFlow dataset IDs to search")
    document_ids: Optional[List[str]] = Field(default=[], description="Specific document IDs to search")


class ChatResponse(BaseModel):
    """Non-streaming response for chat."""
    session_id: str
    message: str
    sources: Optional[List[dict]] = None
    metadata: Optional[dict] = None


class StreamEvent(BaseModel):
    """Server-Sent Event format for streaming."""
    event: str = Field(..., description="Event type: 'message', 'done', 'error'")
    data: Any = Field(..., description="Event data")


class NotebookConfig(BaseModel):
    """Notebook configuration for agent."""
    notebook_id: str
    name: str
    ragflow_dataset_id: Optional[str] = None
    ragflow_agent_id: Optional[str] = None
    dataset_ids: List[str] = Field(default_factory=list)
    document_ids: List[str] = Field(default_factory=list)
