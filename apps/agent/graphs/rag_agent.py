"""
RAG Agent using LangChain create_agent.

Uses middleware for context engineering:
- inject_gathered_chunks: parses chunks from tool messages and injects organized context
"""

from langchain.agents import create_agent

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe
from middleware.chunk_accumulator import inject_gathered_chunks


model = f"{RAG_AGENT_CONFIG.model_provider}:{RAG_AGENT_CONFIG.model_name}"

# Create the RAG agent using LangChain create_agent
# Middleware: inject_gathered_chunks extracts chunks from tool messages and injects context
agent = create_agent(
    model=model,
    tools=[explore, search, probe],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
    middleware=[inject_gathered_chunks],
)
