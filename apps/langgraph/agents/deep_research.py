"""Deep research surface — open-web research."""

from __future__ import annotations

import json
from dataclasses import dataclass

import _reasoning_patch  # noqa: F401  — preserves DeepSeek reasoning_content across turns
from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.runtime import Runtime
from prompt_builder import build_system_prompt
from tools.web import search_web, url_fetch
from tools.wiki import source_list, source_read

TOOLS = [search_web, url_fetch, source_read, source_list]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}
SURFACE = "deep_research"
PROMPT_PATH = "surfaces/deep_research.md"


@dataclass
class Ctx:
    model_provider: str
    model_name: str
    api_key: str
    user_id: str
    session_id: str
    notebook_id: str | None = None
    page_context: str | None = None


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
        notebook_id=ctx.notebook_id,
        user_id=ctx.user_id,
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
                    name=call["name"],
                )
            )
            continue
        try:
            if asyncio.iscoroutinefunction(getattr(tool, "func", None)):
                raw = asyncio.run(tool.ainvoke(call["args"]))
            else:
                raw = tool.invoke(call["args"])
        except Exception as exc:
            raw = {"error": str(exc)}
        content = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
        # See hub.py for why `name=` is required (assistant-ui converter).
        results.append(ToolMessage(content=content, tool_call_id=call["id"], name=call["name"]))
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
