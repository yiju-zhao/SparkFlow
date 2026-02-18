"""RAG Agent using Deep Agents with official skill system.

Skills are loaded from SKILL.md files using FilesystemBackend for progressive disclosure.

Note: When running under LangGraph server (langgraph dev/up), persistence is
handled automatically by the server infrastructure. Do not specify a custom
checkpointer as the server manages this.
"""

from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe, get_first_chunk
from middleware.sources_context import inject_sources_context
from middleware.query_optimizer import optimize_query


model = f"{RAG_AGENT_CONFIG.model_provider}:{RAG_AGENT_CONFIG.model_name}"

# Create the RAG agent with official Deep Agents skill system
# Skills are loaded from ./skills/ directory (SKILL.md files)
# Progressive disclosure: skill descriptions in prompt, full content loaded on demand
agent = create_deep_agent(
    model=model,
    backend=FilesystemBackend(root_dir="."),
    skills=["./skills/"],
    tools=[explore, search, probe, get_first_chunk],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
    middleware=[inject_sources_context, optimize_query],
)
