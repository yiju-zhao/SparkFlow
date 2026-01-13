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


class SparkFlowRAGAgent:
    """RAG Agent for SparkFlow."""

    def __init__(self, config: RAGAgentConfig):
        self.config = config
        
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
        
        # Create agent with LangChain 1.0 API
        self.agent = create_agent(
            model,
            tools,
            system_prompt=RAG_AGENT_SYSTEM_PROMPT,
            checkpointer=MemorySaver(),
        )

    async def astream(self, messages: list, thread_id: str = "default"):
        """Stream agent responses."""
        config = {"configurable": {"thread_id": thread_id}}
        
        async for event in self.agent.astream({"messages": messages}, config):
            if "messages" in event:
                for msg in event["messages"]:
                    if isinstance(msg, AIMessage) and msg.content:
                        yield {"type": "text", "content": msg.content}

    async def ainvoke(self, messages: list, thread_id: str = "default") -> str:
        """Invoke agent and return response."""
        config = {"configurable": {"thread_id": thread_id}}
        result = await self.agent.ainvoke({"messages": messages}, config)
        
        for msg in reversed(result.get("messages", [])):
            if isinstance(msg, AIMessage) and msg.content:
                return msg.content
        return ""
