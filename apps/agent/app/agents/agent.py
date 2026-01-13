"""
RAG Agent using LangChain create_agent.
"""

import logging
import os

from langchain.agents import create_agent
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage
from langgraph.checkpoint.memory import MemorySaver

from .config import RAGAgentConfig
from .prompts import RAG_AGENT_SYSTEM_PROMPT
from .tools import create_retrieval_tool

logger = logging.getLogger(__name__)

# Module-level session memory store for per-session isolation
_session_memory_store: dict[str, MemorySaver] = {}


def get_session_checkpointer(session_id: str) -> MemorySaver:
    """Get or create a checkpointer for the given session.
    
    Each session gets its own MemorySaver instance, ensuring
    conversation history is isolated between different sessions.
    """
    if session_id not in _session_memory_store:
        _session_memory_store[session_id] = MemorySaver()
        logger.debug(f"Created new checkpointer for session: {session_id}")
    return _session_memory_store[session_id]


def clear_session_memory(session_id: str) -> None:
    """Clear memory for a session (e.g., when session is deleted)."""
    if session_id in _session_memory_store:
        del _session_memory_store[session_id]
        logger.debug(f"Cleared memory for session: {session_id}")


class SparkFlowRAGAgent:
    """RAG Agent for SparkFlow."""

    def __init__(self, config: RAGAgentConfig, session_id: str = "default"):
        self.config = config
        self.session_id = session_id
        
        # Create retrieval tool if datasets configured
        tools = []
        if config.dataset_ids:
            tools = [create_retrieval_tool(
                dataset_ids=config.dataset_ids,
                document_ids=config.document_ids,
                top_k=config.top_k,
            )]
        
        # Create model instance
        model = ChatOpenAI(
            model=config.model_name,
            temperature=config.synthesis_temperature,
            api_key=config.api_key or os.getenv("OPENAI_API_KEY"),
        )
        
        # Use session-scoped checkpointer for memory isolation
        checkpointer = get_session_checkpointer(session_id)
        
        # Create agent with LangChain 1.0 API
        self.agent = create_agent(
            model,
            tools,
            system_prompt=RAG_AGENT_SYSTEM_PROMPT,
            checkpointer=checkpointer,
        )

    async def astream(self, messages: list, thread_id: str = "default"):
        """Stream agent responses token by token."""
        config = {"configurable": {"thread_id": thread_id}}
        
        # Use stream_mode="messages" for token-by-token streaming
        async for event in self.agent.astream({"messages": messages}, config, stream_mode="messages"):
            # event is tuple: (message_chunk, metadata)
            if isinstance(event, tuple) and len(event) >= 1:
                chunk = event[0]
                # AIMessageChunk has content attribute
                if hasattr(chunk, "content") and chunk.content:
                    yield {"type": "text", "content": chunk.content}

    async def ainvoke(self, messages: list, thread_id: str = "default") -> str:
        """Invoke agent and return response."""
        config = {"configurable": {"thread_id": thread_id}}
        result = await self.agent.ainvoke({"messages": messages}, config)
        
        for msg in reversed(result.get("messages", [])):
            if isinstance(msg, AIMessage) and msg.content:
                return msg.content
        return ""

