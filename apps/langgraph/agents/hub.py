"""Hub surface — research assistant with generative UI via CopilotKit.

Distinguishing feature vs. notebook/deep_research: tools include both
backend (server-executed) tools AND frontend tools that the LLM emits
as tool_calls but the SERVER does not dispatch — the LangGraph SDK
forwards the AIMessage to CopilotKit which renders the tool_call as a
React component. The local tool_node skips dispatch for frontend tools;
should_continue routes to END when ALL tool_calls in the turn are
frontend (otherwise the loop re-invokes llm_call with no ToolMessage
answers, causing repeats / hallucination — see spec §5.3).
"""

from __future__ import annotations

import json
from dataclasses import dataclass

import _reasoning_patch  # noqa: F401  — preserves DeepSeek reasoning_content across turns
from chat_model import init_byok_chat_model as init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.runtime import Runtime
from prompt_builder import build_system_prompt
from tools.hub_nav import HUB_NAV_TOOLS
from tools.hub_toolbox import HUB_TOOLBOX_TOOLS
from tools.hub_ui import HUB_FRONTEND_TOOL_NAMES, HUB_FRONTEND_TOOLS
from tools.hub_wechat import HUB_WECHAT_TOOLS

TOOLS = [*HUB_TOOLBOX_TOOLS, *HUB_NAV_TOOLS, *HUB_FRONTEND_TOOLS, *HUB_WECHAT_TOOLS]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}
SURFACE = "hub"
PROMPT_PATH = "surfaces/hub.md"


@dataclass
class Ctx:
    model_provider: str
    model_name: str
    api_key: str
    user_id: str
    session_id: str
    notebook_id: str | None = None
    page_context: str | None = None
    api_base: str | None = None


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
    model = init_chat_model(
        provider=ctx.model_provider,
        model=ctx.model_name,
        api_key=ctx.api_key,
        api_base=ctx.api_base,
    )
    bound = model.bind_tools(TOOLS)
    response = bound.invoke([SystemMessage(content=system), *state["messages"]])
    return {"messages": [response]}


def tool_node(state: MessagesState) -> dict[str, list[BaseMessage]]:
    """Dispatch every tool call (frontend + backend) and return ToolMessages.

    Frontend tools (`show_chart` etc.) are pure functions that return their
    args as a dict — running them server-side is essentially free, but
    producing the ToolMessage is critical for the UI: assistant-ui's
    external-message-converter only transitions a tool's status from
    "running" → "complete" when it sees a matching ToolMessage. Without
    that, the composer stays locked after the first turn (the symptom
    being "can't ask a second question").
    """
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
            # Always use ainvoke: LangChain `@tool` on an `async def`
            # produces a StructuredTool with `coroutine=...` and `func=None`
            # (or a stub that raises). ainvoke transparently runs sync
            # tools too (hub_ui.show_* are all sync), so this is the safe
            # path for both async backend tools and sync frontend tools.
            raw = asyncio.run(tool.ainvoke(call["args"]))
        except Exception as exc:
            raw = {"error": str(exc)}
        content = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
        # `name=` is required so assistant-ui's converter accepts the
        # ToolMessage (it treats `null !== expected_name` as a hard error;
        # see @assistant-ui/core/.../external-message-converter.js:28).
        results.append(ToolMessage(content=content, tool_call_id=call["id"], name=call["name"]))
    return {"messages": results}


def should_continue(state: MessagesState):
    """After llm_call: route to tool_node if there are tool_calls, else END."""
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    return "tool_node" if tool_calls else END


def after_tool_node(state: MessagesState):
    """After tool_node: if the AIMessage that produced these results was
    all-frontend, END (no LLM synthesis needed — the chart/table is the
    answer). Otherwise loop back to llm_call so the LLM can synthesize
    the backend tool results into a final answer.

    Without this short-circuit the LLM gets re-invoked after every
    frontend tool call, sees its own chart's ToolMessage as 'tool result',
    and either re-issues the same chart (loop) or appends a redundant
    text wrap-up.
    """
    # Walk back to the most recent AIMessage with tool_calls — that's
    # the one whose dispatch we just finished.
    for msg in reversed(state["messages"]):
        if isinstance(msg, AIMessage) and msg.tool_calls:
            if all(tc["name"] in HUB_FRONTEND_TOOL_NAMES for tc in msg.tool_calls):
                return END
            return "llm_call"
    return END


builder = StateGraph(MessagesState, context_schema=Ctx)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
builder.add_conditional_edges("tool_node", after_tool_node, ["llm_call", END])
agent = builder.compile()
