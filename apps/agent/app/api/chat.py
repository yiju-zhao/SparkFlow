"""Chat API endpoint with SSE streaming."""

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, AIMessage

from app.core.auth import get_current_user, CurrentUser
from app.models.chat import ChatRequest, NotebookConfig
from app.agents.config import RAGAgentConfig
from app.agents.agent import SparkFlowRAGAgent

logger = logging.getLogger(__name__)
router = APIRouter()


async def stream_chat_response(message: str, config: NotebookConfig, messages: list = None) -> AsyncGenerator[str, None]:
    """Stream chat responses from the RAG agent."""
    try:
        agent = SparkFlowRAGAgent(RAGAgentConfig(
            dataset_ids=config.dataset_ids,
            document_ids=config.document_ids,
        ))

        # Build message history
        langchain_messages = []
        for msg in (messages or []):
            if msg.get("role") == "user":
                langchain_messages.append(HumanMessage(content=msg.get("content", "")))
            elif msg.get("role") == "assistant":
                langchain_messages.append(AIMessage(content=msg.get("content", "")))
        langchain_messages.append(HumanMessage(content=message))

        # Stream responses
        async for event in agent.astream(langchain_messages, config.notebook_id):
            if event.get("content"):
                yield f"data: {json.dumps({'type': 'text', 'text': event['content']})}\n\n"

        yield "data: [DONE]\n\n"

    except Exception as e:
        logger.error(f"Chat error: {e}")
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"


@router.post("/chat")
async def chat(request: ChatRequest, user: CurrentUser = Depends(get_current_user)):
    """Chat endpoint with SSE streaming."""
    config = NotebookConfig(
        notebook_id=request.notebook_id,
        name="",
        dataset_ids=request.dataset_ids or [],
        document_ids=request.document_ids or [],
    )
    messages = [{"role": m.role, "content": m.content} for m in (request.messages or [])]

    return StreamingResponse(
        stream_chat_response(request.message, config, messages),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/chat/health")
async def chat_health():
    return {"status": "healthy"}
