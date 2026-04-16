"""LangGraph-powered Research Hub agent.

This graph uses deterministic GenAI Toolbox query tools for backend data access.
UI tools (show_table, show_chart, etc.) return structured JSON for frontend rendering.
The frontend renders them via assistant-ui's makeAssistantToolUI.
"""

from __future__ import annotations

import json
from typing import Any

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.runtime import Runtime

from config.hub_agent import HubAgentContext
from prompts.hub_agent import HUB_AGENT_SYSTEM_PROMPT
from tools.hub_toolbox import HUB_TOOLBOX_TOOLS
from tools.hub_ui_tools import HUB_UI_TOOLS
from tools.hub_wechat_tools import HUB_WECHAT_TOOLS
from tools.hub_nav_tools import HUB_NAV_TOOLS


class HubState(MessagesState):
    pass


# Backend tools execute server-side and loop back to the model.
BACKEND_TOOLS = [*HUB_TOOLBOX_TOOLS, *HUB_WECHAT_TOOLS, *HUB_NAV_TOOLS]
_BACKEND_TOOL_MAP = {tool.name: tool for tool in BACKEND_TOOLS}

# All tools (backend + UI) are bound to the model so the LLM can call any of them.
ALL_TOOLS = [*BACKEND_TOOLS, *HUB_UI_TOOLS]

_MODEL_CACHE: dict[str, Any] = {}


def _get_model(provider: str, name: str):
    key = f"{provider}:{name}"
    if key not in _MODEL_CACHE:
        _MODEL_CACHE[key] = init_chat_model(f"{provider}:{name}")
    return _MODEL_CACHE[key]


async def call_model(state: HubState, runtime: Runtime[HubAgentContext]) -> dict[str, list[BaseMessage]]:
    model = _get_model(runtime.context.model_provider, runtime.context.model_name)
    bound_model = model.bind_tools(ALL_TOOLS)

    # Page context comes via config.configurable (set by the frontend)
    page_context = runtime.config.get("configurable", {}).get("page_context", "")
    system_prompt = HUB_AGENT_SYSTEM_PROMPT
    if page_context:
        system_prompt = f"{system_prompt}\n\nCurrent page context:\n- {page_context}"

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
        except Exception as exc:
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
    # UI tool calls (show_*) route to END — frontend renders them.
    return END


builder = StateGraph(HubState, context_schema=HubAgentContext)
builder.add_node("agent", call_model)
builder.add_node("backend_tools", run_backend_tools)
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", route_after_model, {"backend_tools": "backend_tools", END: END})
builder.add_edge("backend_tools", "agent")

agent = builder.compile()
