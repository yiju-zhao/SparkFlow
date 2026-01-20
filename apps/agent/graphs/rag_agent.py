"""
RAG Agent using LangChain create_agent.

Uses middleware for context engineering:
- chunk_accumulator: automatically accumulates chunks from search/probe into state
"""

from langchain.agents import create_agent

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe
from middleware.chunk_accumulator import chunk_accumulator, inject_gathered_chunks


model = f"{RAG_AGENT_CONFIG.model_provider}:{RAG_AGENT_CONFIG.model_name}"

# Create the RAG agent using LangChain create_agent
# Middleware order:
# 1. chunk_accumulator: after each tool, accumulate chunks to state
# 2. inject_gathered_chunks: before each model call, inject gathered chunks
agent = create_agent(
    model=model,
    tools=[explore, search, probe],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
    middleware=[chunk_accumulator, inject_gathered_chunks],
)
