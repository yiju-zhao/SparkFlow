"""Wiki context middleware for the RAG agent.

Injects wiki content into the system prompt so the agent can answer
from compiled knowledge without needing HTTP tool calls.
"""

from langchain.agents.middleware import before_agent, AgentState
from langchain.messages import SystemMessage
from langgraph.runtime import Runtime


@before_agent
def inject_wiki_context(state: AgentState, runtime: Runtime) -> dict | None:
    """Inject wiki content and schema into the conversation."""
    if not runtime or not runtime.context:
        return None

    ctx = runtime.context if not isinstance(runtime.context, dict) else type("Ctx", (), runtime.context)()

    messages = state.get("messages", [])

    # Don't inject twice
    for msg in messages:
        if isinstance(msg, SystemMessage) and "Wiki Knowledge Base" in msg.content:
            return None

    parts = []

    # Inject wiki content (the compiled knowledge from all sources)
    wiki_content = getattr(ctx, "wiki_content", "")
    if wiki_content:
        parts.append(
            "## Wiki Knowledge Base\n\n"
            "Below is the compiled knowledge from this notebook's sources. "
            "Answer questions based on this content. Cite with [[page-slug]] and [source:id].\n\n"
            + wiki_content
        )

    # Inject emphasis from wiki schema
    wiki_schema = getattr(ctx, "wiki_schema", None)
    if wiki_schema and isinstance(wiki_schema, dict):
        emphasis = wiki_schema.get("emphasis", [])
        if emphasis:
            parts.append(
                "## Wiki Focus\n\nFor this notebook, emphasize:\n"
                + "\n".join(f"- {item}" for item in emphasis)
            )

    if not parts:
        return None

    context_text = "\n\n".join(parts)
    return {"messages": [SystemMessage(content=context_text)] + list(messages)}
