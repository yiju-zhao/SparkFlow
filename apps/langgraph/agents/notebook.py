"""Notebook surface — RAG over a notebook's wiki + sources.

Built from StateGraph primitives per ref doc §Agents → Graph API.
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import _reasoning_patch  # noqa: F401  — preserves DeepSeek reasoning_content across turns
from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.runtime import Runtime
from prompt_builder import build_system_prompt
from tools.wiki import source_list, source_read

TOOLS = [source_read, source_list]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}
SURFACE = "notebook"
PROMPT_PATH = "surfaces/notebook.md"


@dataclass
class Ctx:
    model_provider: str
    model_name: str
    api_key: str
    user_id: str
    session_id: str
    notebook_id: str | None = None
    page_context: str | None = None  # unused on notebook; kept for shared Ctx shape


def llm_call(state: MessagesState, runtime: Runtime[Ctx]) -> dict[str, list[BaseMessage]]:
    ctx = runtime.context
    if not ctx.api_key:
        raise ValueError(f"BYOK required for provider {ctx.model_provider!r}")
    system = build_system_prompt(
        surface=SURFACE,
        surface_prompt=PROMPT_PATH,
        provider=ctx.model_provider,
        model=ctx.model_name,
        session_id=ctx.session_id,
        page_context=ctx.page_context,
    )
    model = init_chat_model(f"{ctx.model_provider}:{ctx.model_name}", api_key=ctx.api_key)
    bound = model.bind_tools(TOOLS)
    response = bound.invoke([SystemMessage(content=system), *state["messages"]])
    return {"messages": [response]}


def tool_node(state: MessagesState) -> dict[str, list[BaseMessage]]:
    import asyncio

    last = state["messages"][-1]
    if not isinstance(last, AIMessage) or not last.tool_calls:
        return {"messages": []}
    results: list[ToolMessage] = []
    for call in last.tool_calls:
        tool = TOOLS_BY_NAME.get(call["name"])
        if tool is None:
            results.append(
                ToolMessage(
                    content=json.dumps({"error": f"unknown tool {call['name']}"}),
                    tool_call_id=call["id"],
                )
            )
            continue
        try:
            if asyncio.iscoroutinefunction(getattr(tool, "func", None)):
                raw = asyncio.run(tool.ainvoke(call["args"]))
            else:
                raw = tool.invoke(call["args"])
        except Exception as exc:  # noqa: BLE001
            raw = {"error": str(exc)}
        content = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
        results.append(ToolMessage(content=content, tool_call_id=call["id"]))
    return {"messages": results}


def should_continue(state: MessagesState):
    last = state["messages"][-1]
    return "tool_node" if getattr(last, "tool_calls", None) else END


builder = StateGraph(MessagesState, context_schema=Ctx)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
builder.add_edge("tool_node", "llm_call")
agent = builder.compile()
