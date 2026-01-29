"""RAG Agent using LangChain create_agent with persistent PostgreSQL checkpointer."""

import os
from langchain.agents import create_agent
from langgraph.checkpoint.postgres import PostgresSaver

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe


model = f"{RAG_AGENT_CONFIG.model_provider}:{RAG_AGENT_CONFIG.model_name}"

# Get checkpoint database URL from environment
CHECKPOINT_DB_URL = os.getenv(
    "CHECKPOINT_DB_URL",
    "postgresql://sparkflow:sparkflow@localhost:5433/sparkflow_checkpoints"
)

# Create PostgreSQL checkpointer for persistent memory
checkpointer = PostgresSaver.from_conn_string(CHECKPOINT_DB_URL)

# Create the RAG agent with persistent PostgreSQL checkpointing
agent = create_agent(
    model=model,
    tools=[explore, search, probe],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
    checkpointer=checkpointer,
)
