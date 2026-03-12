"""LangGraph-powered Research Hub agent.

This graph uses deterministic GenAI Toolbox query tools for backend data access.
Frontend MCP Apps are provided at runtime by CopilotKit and exposed through
state["copilotkit"]["actions"]. The model is allowed to call those actions only
for workflow/presentation once backend probing is complete.
"""

from __future__ import annotations

import json
from typing import Any
from typing_extensions import NotRequired, TypedDict

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.runtime import Runtime

from config.hub_agent import HubAgentContext
from prompts.hub_agent import HUB_AGENT_SYSTEM_PROMPT
from tools.hub_toolbox import HUB_TOOLBOX_TOOLS


class CopilotKitEnvelope(TypedDict, total=False):
    actions: list[Any]
    context: list[dict[str, Any]]


class HubState(MessagesState):
    copilotkit: NotRequired[CopilotKitEnvelope]


_BACKEND_TOOL_MAP = {tool.name: tool for tool in HUB_TOOLBOX_TOOLS}
_MODEL_CACHE: dict[str, Any] = {}


def _get_model(provider: str, name: str):
    key = f"{provider}:{name}"
    if key not in _MODEL_CACHE:
        _MODEL_CACHE[key] = init_chat_model(f"{provider}:{name}")
    return _MODEL_CACHE[key]


def _format_page_context(state: HubState) -> str:
    context_blocks = (state.get("copilotkit") or {}).get("context") or []
    if not context_blocks:
        return ""

    lines: list[str] = []
    for block in context_blocks:
        description = block.get("description") if isinstance(block, dict) else None
        value = block.get("value") if isinstance(block, dict) else None
        if description and value:
            lines.append(f"- {description}: {value}")
        elif value:
            lines.append(f"- {value}")

    return "\n".join(lines)


def _dedupe_tools(frontend_tools: list[Any]) -> list[Any]:
    combined: list[Any] = []
    seen: set[str] = set()
    for tool in [*frontend_tools, *HUB_TOOLBOX_TOOLS]:
        name = getattr(tool, "name", None)
        if not name and isinstance(tool, dict):
            name = tool.get("name")
        if not isinstance(name, str) or name in seen:
            continue
        seen.add(name)
        combined.append(tool)
    return combined


async def call_model(state: HubState, runtime: Runtime[HubAgentContext]) -> dict[str, list[BaseMessage]]:
    frontend_tools = (state.get("copilotkit") or {}).get("actions") or []
    available_tools = _dedupe_tools(frontend_tools)
    model = _get_model(runtime.context.model_provider, runtime.context.model_name)
    bound_model = model.bind_tools(available_tools) if available_tools else model

    system_prompt = HUB_AGENT_SYSTEM_PROMPT
    page_context = _format_page_context(state)
    if page_context:
        system_prompt = f"{system_prompt}\n\nCurrent page context:\n{page_context}"

    response = await bound_model.ainvoke(
        [SystemMessage(content=system_prompt), *state["messages"]],
    )
    return {"messages": [response]}


async def run_backend_tools(state: HubState) -> dict[str, list[BaseMessage]]:
    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage):
        return {"messages": []}

    tool_messages: list[ToolMessage] = []
    for call in last_message.tool_calls:
        tool = _BACKEND_TOOL_MAP.get(call["name"])
        if tool is None:
            continue

        try:
            result = await tool.ainvoke(call.get("args", {}))
            content = json.dumps(result, ensure_ascii=False) if not isinstance(result, str) else result
        except Exception as exc:  # pragma: no cover - defensive runtime path
            content = json.dumps({"error": str(exc)}, ensure_ascii=False)

        tool_messages.append(
            ToolMessage(
                content=content,
                tool_call_id=call["id"],
            )
        )

    return {"messages": tool_messages}


def route_after_model(state: HubState) -> str:
    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return END

    for call in last_message.tool_calls:
        if call["name"] in _BACKEND_TOOL_MAP:
            return "backend_tools"
    return END


builder = StateGraph(HubState, context_schema=HubAgentContext)
builder.add_node("agent", call_model)
builder.add_node("backend_tools", run_backend_tools)
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", route_after_model, {"backend_tools": "backend_tools", END: END})
builder.add_edge("backend_tools", "agent")

agent = builder.compile()
