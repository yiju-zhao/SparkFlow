"""
Simplified RAG Agent using LangGraph.

This is a streamlined version of the DeepSight RAG agent,
without CopilotKit dependencies. Uses standard LangGraph streaming.
"""

import json
import logging
import os
from typing import Literal, AsyncGenerator

from langchain.chat_models import init_chat_model
from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.runnables import RunnableConfig
from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel, Field

from .config import RAGAgentConfig
from .states import RAGAgentState
from .prompts import (
    format_synthesis_prompt,
    format_planning_prompt,
)

logger = logging.getLogger(__name__)


class SparkFlowRAGAgent:
    """
    Simplified RAG Agent for SparkFlow.

    Implements a basic RAG workflow:
    1. Initialize request from user message
    2. Plan search queries
    3. Retrieve documents (via MCP)
    4. Generate response
    """

    def __init__(self, config: RAGAgentConfig):
        self.config = config
        self._initialize_models()
        self._build_workflow()

    def _initialize_models(self):
        """Initialize chat models."""
        api_key = self.config.api_key or os.getenv("OPENAI_API_KEY")

        logger.info(f"Initializing models - Main: {self.config.model_name}")

        self.response_model = init_chat_model(
            model=f"openai:{self.config.nano_model_name}",
            api_key=api_key,
            temperature=self.config.temperature,
        )

        self.synthesis_model = init_chat_model(
            model=f"openai:{self.config.model_name}",
            api_key=api_key,
            temperature=self.config.synthesis_temperature,
        )

    def _build_workflow(self):
        """Build the workflow graph."""
        workflow = StateGraph(RAGAgentState)

        # Define nodes
        workflow.add_node("initialize", self.initialize_request)
        workflow.add_node("generate", self.generate)

        # Build graph (simplified for now)
        workflow.add_edge(START, "initialize")
        workflow.add_conditional_edges(
            "initialize",
            self.check_initialization,
            {"generate": "generate", "end": END},
        )
        workflow.add_edge("generate", END)

        # Compile with memory
        memory = MemorySaver()
        self.graph = workflow.compile(checkpointer=memory)
        logger.info("SparkFlow RAG agent compiled successfully")

    async def initialize_request(
        self, state: RAGAgentState, config: RunnableConfig
    ) -> dict:
        """Extract user question from messages."""
        logger.info("---INITIALIZE REQUEST---")
        messages = state.get("messages", [])

        # Find the latest human message
        last_human_message = None
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                last_human_message = msg
                break

        if last_human_message:
            question = last_human_message.content
            logger.info(f"Extracted question: {question}")
            return {
                "question": question,
                "original_question": question,
                "queries": [],
                "documents": [],
                "new_documents": [],
                "generation": "",
                "iteration_count": 0,
                "current_step": "analyzing",
                "semantic_groups": [],
            }

        return {}

    def check_initialization(self, state: RAGAgentState) -> Literal["generate", "end"]:
        """Check if we have a valid question."""
        if state.get("question"):
            return "generate"
        logger.info("No question found, ending.")
        return "end"

    async def generate(self, state: RAGAgentState, config: RunnableConfig) -> dict:
        """Generate response based on question and documents."""
        logger.info("---GENERATE---")
        question = state["question"]
        documents = state.get("documents", [])

        # Format synthesis prompt
        prompt = format_synthesis_prompt(
            question=question,
            context="\n\n".join(documents) if documents else "No documents retrieved.",
        )

        # Generate response
        response = await self.synthesis_model.ainvoke(
            [HumanMessage(content=prompt)], config
        )

        generation = response.content
        logger.info(f"Generated response: {generation[:100]}...")

        return {
            "generation": generation,
            "current_step": "complete",
            "messages": [AIMessage(content=generation)],
        }

    async def astream(
        self,
        messages: list,
        thread_id: str = "default",
    ) -> AsyncGenerator[dict, None]:
        """
        Stream agent responses.

        Args:
            messages: List of messages (HumanMessage, AIMessage)
            thread_id: Thread ID for conversation state

        Yields:
            dict: State updates with generation chunks
        """
        config = RunnableConfig(
            configurable={"thread_id": thread_id},
            recursion_limit=10,
        )

        initial_state = {
            "messages": messages,
            "question": "",
            "original_question": None,
            "generation": "",
            "queries": [],
            "documents": [],
            "new_documents": [],
            "semantic_groups": [],
            "current_step": None,
            "iteration_count": 0,
            "graded_documents": None,
            "query_rewrites": None,
            "synthesis_progress": None,
            "total_tool_calls": None,
            "agent_reasoning": None,
        }

        async for event in self.graph.astream(initial_state, config):
            yield event


def create_agent(config: RAGAgentConfig) -> SparkFlowRAGAgent:
    """Factory function to create a RAG agent."""
    return SparkFlowRAGAgent(config)
