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
from langchain.chat_models import init_chat_model
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
    """Dispatch backend tool calls; skip frontend tool calls (rendered client-side)."""
    import asyncio

    last = state["messages"][-1]
    if not isinstance(last, AIMessage) or not last.tool_calls:
        return {"messages": []}
    results: list[ToolMessage] = []
    for call in last.tool_calls:
        if call["name"] in HUB_FRONTEND_TOOL_NAMES:
            continue  # client renders; no ToolMessage produced
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
            # (or a stub that raises). The previous
            # `iscoroutinefunction(tool.func)` check returned False for
            # async tools and the sync `tool.invoke()` fell back, raising
            # `StructuredTool does not support sync invocation` for every
            # async hub tool (hub_toolbox.* and hub_wechat.*). ainvoke
            # transparently runs sync tools too, so this is the safe path.
            raw = asyncio.run(tool.ainvoke(call["args"]))
        except Exception as exc:
            raw = {"error": str(exc)}
        content = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
        # Set `name=` so the streamed ToolMessage carries the tool name back
        # to the frontend. assistant-ui's external-message-converter treats
        # `null !== expected_name` as a hard error and refuses to render the
        # rest of the conversation (see @assistant-ui/core/.../external-
        # message-converter.js:28). LangChain ToolMessage's `name` defaults
        # to None — passing it explicitly keeps the converter happy.
        results.append(ToolMessage(content=content, tool_call_id=call["id"], name=call["name"]))
    return {"messages": results}


def should_continue(state: MessagesState):
    """Route to END when no tool_calls OR when every tool_call is frontend.

    Without the all-frontend short-circuit, the loop re-enters llm_call
    with the same message tail (AIMessage with tool_calls but no answering
    ToolMessage), and the LLM either repeats the call or hallucinates.
    """
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    if not tool_calls:
        return END
    if all(tc["name"] in HUB_FRONTEND_TOOL_NAMES for tc in tool_calls):
        return END
    return "tool_node"


builder = StateGraph(MessagesState, context_schema=Ctx)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
builder.add_edge("tool_node", "llm_call")
agent = builder.compile()
