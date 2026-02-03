"""Sources context middleware for the RAG agent.

This middleware injects a "Knowledge Base Overview" section into the system prompt,
providing the agent with document titles and TOC headings so it can make smarter searches.
"""

from langchain.agents.middleware import before_agent, AgentState
from langchain.messages import SystemMessage
from langgraph.runtime import Runtime


def format_sources_context(sources_context: list) -> str:
    """Format sources context as a Knowledge Base Overview section."""
    if not sources_context:
        return ""

    lines = ["\n## Knowledge Base Overview\n"]
    lines.append("The following sources are available in the knowledge base:\n")

    for source in sources_context:
        title = source.get("title", "Untitled")
        toc = source.get("toc", [])

        lines.append(f"### {title}")
        if toc:
            for heading in toc:
                level = heading.get("level", 1)
                text = heading.get("text", "")
                indent = "  " * (level - 1)
                lines.append(f"{indent}- {text}")
        lines.append("")

    lines.append("Use this overview to target your searches effectively.\n")
    return "\n".join(lines)


@before_agent
def inject_sources_context(state: AgentState, runtime: Runtime) -> dict | None:
    """Inject sources context into the conversation as a system message."""
    config = runtime.config if runtime else None
    if not config:
        return None

    sources_context = config.get("configurable", {}).get("sources_context", [])
    if not sources_context:
        return None

    overview = format_sources_context(sources_context)
    if not overview:
        return None

    messages = state.get("messages", [])

    # Check if we already injected the overview (avoid duplicates on re-runs)
    for msg in messages:
        if isinstance(msg, SystemMessage) and "Knowledge Base Overview" in msg.content:
            return None

    # Inject as a system message at the beginning
    overview_message = SystemMessage(content=overview)
    return {"messages": [overview_message] + list(messages)}
