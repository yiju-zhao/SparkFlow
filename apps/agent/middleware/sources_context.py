"""Sources context middleware for the RAG agent.

This middleware injects a "Knowledge Base Overview" section into the system prompt,
providing the agent with document structure summaries so it can make smarter searches.
"""

from langchain.agents.middleware import before_agent, AgentState
from langchain.messages import SystemMessage
from langgraph.runtime import Runtime

from utils.pageindex_client import get_tree_summary


def format_sources_context(sources_context: list) -> str:
    """Format sources context as a Knowledge Base Overview section."""
    if not sources_context:
        return ""

    lines = ["\n## Knowledge Base Overview\n"]
    lines.append("The following sources are available in the knowledge base:\n")

    for source in sources_context:
        title = source.get("title", "Untitled")
        source_id = source.get("id", "unknown")
        index_data = source.get("index_data")

        lines.append(f"### {title} [source:{source_id}]")

        if index_data:
            summary = get_tree_summary(index_data)
            lines.append(summary)
        else:
            lines.append("(content available but not indexed)")

        lines.append("")

    lines.append("Use this overview to target your searches effectively.\n")
    return "\n".join(lines)


@before_agent
def inject_sources_context(state: AgentState, runtime: Runtime) -> dict | None:
    """Inject sources context into the conversation as a system message."""
    if not runtime or not runtime.context:
        return None

    sources_context = runtime.context.get("sources_context") if isinstance(runtime.context, dict) else getattr(runtime.context, "sources_context", None)
    if not sources_context:
        return None

    overview = format_sources_context(sources_context)
    if not overview:
        return None

    messages = state.get("messages", [])

    for msg in messages:
        if isinstance(msg, SystemMessage) and "Knowledge Base Overview" in msg.content:
            return None

    overview_message = SystemMessage(content=overview)
    return {"messages": [overview_message] + list(messages)}
