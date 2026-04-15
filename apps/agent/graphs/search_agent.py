"""LangGraph search agent with iterative tool-calling loop.

Searches one source type at a time (web/publication/wechat) with
wiki context awareness. Iterates up to 3 times to refine results.
"""

from __future__ import annotations

import json
import os
from typing import Annotated, Any

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from langgraph.runtime import Runtime
from typing_extensions import TypedDict

from config.search_agent import SearchAgentContext
from prompts.search_agent import build_search_prompt
from tools.search_tools import SEARCH_TOOLS_BY_TYPE

MAX_ITERATIONS = 3

_model_cache: dict[str, Any] = {}


class SearchState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    iteration: int


def _get_model(provider: str, name: str):
    key = f"{provider}:{name}"
    if key not in _model_cache:
        if provider == "google":
            _model_cache[key] = ChatGoogleGenerativeAI(model=name)
        else:
            _model_cache[key] = init_chat_model(f"{provider}:{name}")
    return _model_cache[key]


async def agent_node(
    state: SearchState, runtime: Runtime[SearchAgentContext]
) -> dict[str, Any]:
    """LLM decides: call a search tool or return final results."""
    source_type = runtime.context.source_type
    tools = SEARCH_TOOLS_BY_TYPE.get(source_type, [])

    provider = runtime.context.model_provider or os.getenv(
        "DEFAULT_MODEL_PROVIDER", "openai"
    )
    model_name = runtime.context.model_name or os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")
    model = _get_model(provider, model_name)

    # Once max iterations reached, don't bind tools — force the LLM to return final JSON
    if tools and state.get("iteration", 0) < MAX_ITERATIONS:
        bound_model = model.bind_tools(tools)
    else:
        bound_model = model

    # Build system prompt with wiki context
    system_prompt = build_search_prompt(
        source_type=source_type,
        wiki_context=runtime.context.wiki_context,
    )

    # Inject domain filter hint for web searches
    if source_type == "web" and runtime.context.domains:
        domain_list = ", ".join(runtime.context.domains)
        system_prompt += (
            f"\n\nDOMAIN FILTER: Restrict web search to these domains: {domain_list}"
        )

    response = await bound_model.ainvoke(
        [SystemMessage(content=system_prompt)] + list(state["messages"]),
    )

    new_iteration = state.get("iteration", 0)
    # Only increment if the model made tool calls (a search round happened)
    if isinstance(response, AIMessage) and response.tool_calls:
        new_iteration += 1

    return {"messages": [response], "iteration": new_iteration}


async def tool_node(
    state: SearchState, runtime: Runtime[SearchAgentContext]
) -> dict[str, Any]:
    """Execute tool calls from the LLM response."""
    source_type = runtime.context.source_type
    tools = SEARCH_TOOLS_BY_TYPE.get(source_type, [])
    tools_by_name = {t.name: t for t in tools}

    last_message = state["messages"][-1]
    if not isinstance(last_message, AIMessage):
        return {"messages": []}

    results: list[ToolMessage] = []
    for call in last_message.tool_calls:
        tool = tools_by_name.get(call["name"])
        if tool is None:
            results.append(
                ToolMessage(
                    content=json.dumps({"error": f"Unknown tool: {call['name']}"}),
                    tool_call_id=call["id"],
                )
            )
            continue

        try:
            # Inject domains for web search tool
            args = dict(call.get("args", {}))
            if call["name"] == "search_web" and runtime.context.domains:
                args.setdefault("domains", runtime.context.domains)
            observation = await tool.ainvoke(args)
        except Exception as e:
            observation = json.dumps({"error": str(e)})

        results.append(ToolMessage(content=str(observation), tool_call_id=call["id"]))

    return {"messages": results}


def should_continue(state: SearchState) -> str:
    """Decide whether to continue searching or stop."""
    last_message = state["messages"][-1]

    # If the LLM didn't make tool calls, it returned final results — stop
    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return END

    # Always execute pending tool calls, even on the last iteration.
    # The iteration count is checked in agent_node: once iteration >= MAX_ITERATIONS,
    # the model is invoked without tools bound, forcing it to return final JSON.
    return "tools"


# Build the graph
builder = StateGraph(SearchState, context_schema=SearchAgentContext)
builder.add_node("agent", agent_node)
builder.add_node("tools", tool_node)
builder.add_edge(START, "agent")
builder.add_conditional_edges("agent", should_continue, {"tools": "tools", END: END})
builder.add_edge("tools", "agent")

agent = builder.compile()
