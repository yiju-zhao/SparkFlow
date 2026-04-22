"""Parameterized surface graph.

One function, ``build_graph(config)``, produces a compiled LangGraph
``StateGraph`` wired with ``make_llm_call(config)`` and
``make_tool_node(config)``. Module-level graph instances (``notebook_graph``
etc.) are added in Task 9 once the surface configs land.
"""

from __future__ import annotations

from langgraph.graph import END, START, MessagesState, StateGraph

from config.surfaces import SurfaceConfig
from graphs.common import make_llm_call, make_tool_node


def _should_continue(state: MessagesState) -> str:
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    return "tools" if tool_calls else END


def build_graph(config: SurfaceConfig):
    """Return a compiled ``StateGraph`` wired to this surface.

    The caller is responsible for attaching a checkpointer. LangGraph's
    dev/cloud runtime supplies one automatically when the graph is served
    via ``langgraph.json``.
    """

    graph = StateGraph(MessagesState)
    graph.add_node("llm_call", make_llm_call(config))
    graph.add_node("tools", make_tool_node(config))
    graph.add_edge(START, "llm_call")
    graph.add_conditional_edges(
        "llm_call", _should_continue, {"tools": "tools", END: END}
    )
    graph.add_edge("tools", "llm_call")
    return graph.compile()
