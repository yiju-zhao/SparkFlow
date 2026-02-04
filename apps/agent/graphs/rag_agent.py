"""RAG Agent using LangChain create_agent.

Note: When running under LangGraph server (langgraph dev/up), persistence is
handled automatically by the server infrastructure. Do not specify a custom
checkpointer as the server manages this.
"""

from langchain.agents import create_agent

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe
from middleware.query_optimizer import optimize_query
from middleware.sources_context import inject_sources_context


model = f"{RAG_AGENT_CONFIG.model_provider}:{RAG_AGENT_CONFIG.model_name}"

# Create the RAG agent with query optimization and sources context middleware
# Persistence is managed by LangGraph server (langgraph dev uses in-memory,
# langgraph up uses PostgreSQL automatically)
agent = create_agent(
    model=model,
    tools=[explore, search, probe],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
    middleware=[inject_sources_context, optimize_query],
)
