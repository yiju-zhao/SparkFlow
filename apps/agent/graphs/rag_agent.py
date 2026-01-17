"""
RAG Agent using LangChain create_agent.
"""

from langchain.agents import create_agent

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, extend


model = f"{RAG_AGENT_CONFIG.model_provider}:{RAG_AGENT_CONFIG.model_name}"

# Create the RAG agent using LangChain create_agent
agent = create_agent(
    model=model,
    tools=[explore, search, extend],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
)
