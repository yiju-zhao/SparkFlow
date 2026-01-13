"""Pydantic models for chat API."""

from typing import Optional, List
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """A single chat message."""
    role: str = Field(..., description="Message role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ChatRequest(BaseModel):
    """Request body for chat endpoint."""
    dataset_id: str = Field(..., description="RAGFlow dataset ID")
    message: str = Field(..., description="User's message")
    session_id: Optional[str] = Field(None, description="Session ID for conversation persistence")
    messages: Optional[List[ChatMessage]] = Field(default=[], description="Previous messages for context")
