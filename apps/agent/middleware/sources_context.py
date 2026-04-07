"""Wiki context middleware for the RAG agent.

Injects wiki index content into the system prompt so the agent can
answer questions from compiled wiki knowledge without HTTP calls.
"""

from langchain.agents.middleware import before_agent, AgentState
from langchain.messages import SystemMessage
from langgraph.runtime import Runtime


@before_agent
def inject_wiki_context(state: AgentState, runtime: Runtime) -> dict | None:
    """Inject wiki index and schema into the conversation as a system message."""
    if not runtime or not runtime.context:
        return None

    ctx = runtime.context if not isinstance(runtime.context, dict) else type("Ctx", (), runtime.context)()

    messages = state.get("messages", [])

    # Don't inject twice
    for msg in messages:
        if isinstance(msg, SystemMessage) and "Wiki Knowledge Base" in msg.content:
            return None

    parts = []

    # Inject wiki index content (the compiled knowledge)
    wiki_index = getattr(ctx, "wiki_index", "")
    if wiki_index:
        parts.append(f"## Wiki Knowledge Base\n\nBelow is the wiki index for this notebook. Use it to answer questions.\n\n{wiki_index}")

    # Inject emphasis from wiki schema
    wiki_schema = getattr(ctx, "wiki_schema", None)
    if wiki_schema and isinstance(wiki_schema, dict):
        emphasis = wiki_schema.get("emphasis", [])
        if emphasis:
            parts.append("## Wiki Focus\n\nFor this notebook, emphasize:\n" + "\n".join(f"- {item}" for item in emphasis))

    if not parts:
        return None

    context_text = "\n\n".join(parts)
    return {"messages": [SystemMessage(content=context_text)] + list(messages)}
