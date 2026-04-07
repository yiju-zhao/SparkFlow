"""Wiki context middleware for the RAG agent.

Injects wiki schema emphasis into the system prompt.
"""

from langchain.agents.middleware import before_agent, AgentState
from langchain.messages import SystemMessage
from langgraph.runtime import Runtime


@before_agent
def inject_wiki_context(state: AgentState, runtime: Runtime) -> dict | None:
    """Inject wiki schema emphasis into the conversation."""
    if not runtime or not runtime.context:
        return None

    ctx = runtime.context if not isinstance(runtime.context, dict) else type("Ctx", (), runtime.context)()

    wiki_schema = getattr(ctx, "wiki_schema", None)
    if not wiki_schema or not isinstance(wiki_schema, dict):
        return None

    emphasis = wiki_schema.get("emphasis", [])
    if not emphasis:
        return None

    messages = state.get("messages", [])

    for msg in messages:
        if isinstance(msg, SystemMessage) and "Wiki Focus" in msg.content:
            return None

    focus_text = "## Wiki Focus\n\nFor this notebook, emphasize:\n" + "\n".join(f"- {item}" for item in emphasis)
    return {"messages": [SystemMessage(content=focus_text)] + list(messages)}
