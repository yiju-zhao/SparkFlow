"""Chat API endpoint with SSE streaming."""

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, AIMessage

from app.core.auth import get_current_user, CurrentUser
from app.models.chat import ChatRequest
from app.agents.config import RAGAgentConfig
from app.agents.agent import SparkFlowRAGAgent

logger = logging.getLogger(__name__)
router = APIRouter()


async def stream_chat_response(
    dataset_id: str,
    message: str,
    session_id: str,
    messages: list = None
) -> AsyncGenerator[str, None]:
    """Stream chat responses from the RAG agent."""
    try:
        agent = SparkFlowRAGAgent(
            RAGAgentConfig(dataset_ids=[dataset_id]),
            session_id=session_id,
        )

        # Build message history
        langchain_messages = []
        for msg in (messages or []):
            if msg.get("role") == "user":
                langchain_messages.append(HumanMessage(content=msg.get("content", "")))
            elif msg.get("role") == "assistant":
                langchain_messages.append(AIMessage(content=msg.get("content", "")))
        langchain_messages.append(HumanMessage(content=message))

        # Stream responses
        async for event in agent.astream(langchain_messages, thread_id=session_id):
            if event.get("content"):
                yield f"data: {json.dumps({'type': 'text', 'text': event['content']})}\n\n"

        yield "data: [DONE]\n\n"

    except Exception as e:
        logger.error(f"Chat error: {e}")
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"


@router.post("/chat")
async def chat(request: ChatRequest, user: CurrentUser = Depends(get_current_user)):
    """Chat endpoint with SSE streaming.
    
    Request body:
    - dataset_id: RAGFlow dataset ID
    - message: User's message
    - session_id: Session ID for conversation persistence (optional)
    - messages: Previous messages for context (optional)
    """
    logger.info(f"Chat request from user {user.id} for dataset {request.dataset_id}")
    
    # Use provided session_id or generate one from dataset_id + user_id
    session_id = request.session_id or f"{request.dataset_id}:{user.id}"
    messages = [{"role": m.role, "content": m.content} for m in (request.messages or [])]

    return StreamingResponse(
        stream_chat_response(request.dataset_id, request.message, session_id, messages),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/chat/health")
async def chat_health():
    return {"status": "healthy"}
