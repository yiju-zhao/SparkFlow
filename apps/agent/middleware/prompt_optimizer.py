"""
Prompt optimizer middleware for RAG agent.

Optimizes user questions on the first turn to improve clarity and
effectiveness for retrieval. Uses a fast LLM to rewrite ambiguous
or poorly structured questions.

Uses @wrap_model_call to intercept the first model call and optimize
the user's question before it reaches the main agent.
"""

from typing import Callable

from langchain.agents.middleware import wrap_model_call, ModelRequest, ModelResponse
from langchain_openai import ChatOpenAI

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.prompt_optimizer import PROMPT_OPTIMIZER_SYSTEM, PROMPT_OPTIMIZER_USER_TEMPLATE


def _has_tool_messages(messages: list) -> bool:
    """Check if conversation already has tool messages (not first turn)."""
    for msg in messages:
        if isinstance(msg, dict):
            msg_type = msg.get("role") or msg.get("type")
        else:
            msg_type = getattr(msg, "type", None)

        if msg_type == "tool":
            return True
    return False


def _get_latest_user_message(messages: list) -> tuple[int, str | None]:
    """Find the latest user message and return its index and content."""
    for i in range(len(messages) - 1, -1, -1):
        msg = messages[i]
        if isinstance(msg, dict):
            msg_type = msg.get("role") or msg.get("type")
            content = msg.get("content", "")
        else:
            msg_type = getattr(msg, "type", None)
            content = getattr(msg, "content", "")

        if msg_type in ("user", "human"):
            return i, content

    return -1, None


async def _optimize_question(question: str) -> str:
    """Call optimizer LLM to rewrite the question."""
    llm = ChatOpenAI(
        model=RAG_AGENT_CONFIG.optimizer_model,
        temperature=0,
    )

    messages = [
        {"role": "system", "content": PROMPT_OPTIMIZER_SYSTEM},
        {"role": "user", "content": PROMPT_OPTIMIZER_USER_TEMPLATE.format(question=question)},
    ]

    response = await llm.ainvoke(messages)
    return response.content.strip()


@wrap_model_call
async def optimize_user_prompt(
    request: ModelRequest,
    handler: Callable[[ModelRequest], ModelResponse]
) -> ModelResponse:
    """Optimize user question on first turn before main model call."""
    # Skip if optimizer is disabled
    if not RAG_AGENT_CONFIG.enable_prompt_optimizer:
        return await handler(request)

    # Skip if not first turn (already have tool messages)
    if _has_tool_messages(request.messages):
        return await handler(request)

    # Find latest user message
    idx, user_question = _get_latest_user_message(request.messages)
    if idx < 0 or not user_question:
        return await handler(request)

    # Optimize the question
    optimized = await _optimize_question(user_question)

    # Replace user message content with optimized version
    messages = list(request.messages)
    original_msg = messages[idx]

    if isinstance(original_msg, dict):
        messages[idx] = {**original_msg, "content": optimized}
    else:
        # LangChain message object - create new dict message
        messages[idx] = {
            "role": "user",
            "content": optimized,
        }

    request = request.override(messages=messages)
    return await handler(request)
