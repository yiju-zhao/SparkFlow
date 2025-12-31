"""
LangGraph state definitions for RAG agent.

Refactored to use standard Python types without CopilotKit dependency.
"""

from typing import Any, Annotated
from typing_extensions import TypedDict
from langgraph.graph.message import add_messages


class RAGAgentState(TypedDict):
    """
    State for the RAG agent with TypedDict for LangGraph compatibility.

    Attributes:
        question: The user's question or the rewritten query.
        generation: The LLM generated answer.
        documents: List of retrieved document contents.
        messages: Chat message history (managed by LangGraph)
    """

    # --- Core GraphState Attributes ---
    question: str
    original_question: str | None  # Preserve the user's initial question
    generation: str
    queries: list[str]  # List of generated queries for multi-angle search
    documents: list[str]  # List of all relevant document contents
    new_documents: list[str]  # Newly retrieved documents to be graded separately
    semantic_groups: list[dict]  # Structured semantic groups

    # --- Message history for chat ---
    messages: Annotated[list, add_messages]

    # --- Progress tracking fields ---
    current_step: str | None
    iteration_count: int  # Track iterations to handle recursion limit gracefully
    graded_documents: list[dict[str, Any]] | None
    query_rewrites: list[str] | None
    synthesis_progress: int | None
    total_tool_calls: int | None
    agent_reasoning: str | None
