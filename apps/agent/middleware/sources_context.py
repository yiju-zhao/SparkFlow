"""Wiki context middleware — currently a no-op.

Wiki content injection is handled directly in rag_agent.py llm_call()
to avoid double-injection. This middleware is kept as a placeholder
for future schema-only injection needs.
"""

from langchain.agents.middleware import before_agent, AgentState
from langgraph.runtime import Runtime


@before_agent
def inject_wiki_context(state: AgentState, runtime: Runtime) -> dict | None:
    """No-op — wiki content is injected in llm_call() directly."""
    return None
