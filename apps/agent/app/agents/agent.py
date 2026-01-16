"""
RAG Agent using LangChain create_agent.
"""

import os
from typing import Annotated

from langchain.agents import create_agent
from langchain.tools import tool
from langchain_core.runnables import RunnableConfig

from app.agents.prompts import RAG_AGENT_SYSTEM_PROMPT
from app.agents.tools import (
    retrieve_documents,
    get_next_chunks,
    list_datasets,
    list_documents,
    list_chunks,
)


# Get model configuration from environment
MODEL_PROVIDER = os.getenv("MODEL_PROVIDER", "openai")
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-4o")
model = f"{MODEL_PROVIDER}:{MODEL_NAME}"

# Create the RAG agent using LangChain create_agent
agent = create_agent(
    model=model,
    tools=[
        retrieve_documents,
        get_next_chunks,
        list_datasets,
        list_documents,
        list_chunks,
    ],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
)
