"""
Chat API endpoint with SSE streaming.

Provides a streaming chat endpoint that connects to the LangGraph RAG agent.
Compatible with Vercel AI SDK's useChat hook.
"""

import json
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage, AIMessage

from app.core.auth import get_current_user, CurrentUser
from app.models.chat import ChatRequest, NotebookConfig
from app.agents.config import RAGAgentConfig

logger = logging.getLogger(__name__)

router = APIRouter()


async def stream_chat_response(
    message: str,
    config: NotebookConfig,
    messages: list = None,
) -> AsyncGenerator[str, None]:
    """
    Stream chat responses from the RAG agent.

    Yields Server-Sent Events in Vercel AI SDK format:
    - data: {"type": "text", "text": "..."}\n\n
    - data: [DONE]\n\n
    """
    try:
        from app.agents.graph import create_agent
        from app.agents.config import RAGAgentConfig

        # Initialize agent config
        agent_config = RAGAgentConfig(
            dataset_ids=config.dataset_ids,
            document_ids=config.document_ids,
        )

        # Create agent
        agent = create_agent(agent_config)

        # Build message history
        langchain_messages = []
        if messages:
            for msg in messages:
                if msg.get("role") == "user":
                    langchain_messages.append(HumanMessage(content=msg.get("content", "")))
                elif msg.get("role") == "assistant":
                    langchain_messages.append(AIMessage(content=msg.get("content", "")))

        # Add current message
        langchain_messages.append(HumanMessage(content=message))

        # Stream agent responses
        thread_id = config.notebook_id
        generation_started = False

        async for event in agent.astream(langchain_messages, thread_id):
            # Extract generation from state updates
            for node_name, node_output in event.items():
                if isinstance(node_output, dict):
                    generation = node_output.get("generation", "")
                    if generation and not generation_started:
                        # Stream the generation in chunks for better UX
                        generation_started = True
                        chunk_size = 50
                        for i in range(0, len(generation), chunk_size):
                            chunk = generation[i:i + chunk_size]
                            yield f"data: {json.dumps({'type': 'text', 'text': chunk})}\n\n"

        # Signal completion
        yield "data: [DONE]\n\n"

    except Exception as e:
        logger.error(f"Error in stream_chat_response: {e}")
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
        yield "data: [DONE]\n\n"


@router.post("/chat")
async def chat(
    request: ChatRequest,
    user: CurrentUser = Depends(get_current_user),
):
    """
    Chat endpoint with SSE streaming.

    Accepts a message and returns a streaming response from the RAG agent.
    Compatible with Vercel AI SDK's useChat hook.

    Headers required:
    - Authorization: Bearer <jwt_token>

    Request body:
    - notebook_id: Notebook ID for context
    - session_id: Optional session ID
    - message: User's message
    - messages: Previous messages for context
    - dataset_ids: RagFlow dataset IDs
    - document_ids: Specific document IDs
    """
    logger.info(f"Chat request from user {user.id} for notebook {request.notebook_id}")

    # Build notebook config
    config = NotebookConfig(
        notebook_id=request.notebook_id,
        name="",  # TODO: Fetch from database
        dataset_ids=request.dataset_ids or [],
        document_ids=request.document_ids or [],
    )

    # Convert messages to dict format
    messages = []
    if request.messages:
        messages = [{"role": m.role, "content": m.content} for m in request.messages]

    return StreamingResponse(
        stream_chat_response(
            message=request.message,
            config=config,
            messages=messages,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/chat/health")
async def chat_health():
    """Health check for chat endpoint."""
    return {"status": "healthy", "endpoint": "chat"}
