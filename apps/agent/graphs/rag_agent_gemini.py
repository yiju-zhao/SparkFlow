"""RAG Agent using Deep Agents with Google Gemini model.

This is a Gemini-specific variant of the RAG agent for users who prefer
Google's AI models over OpenAI.

Note: When running under LangGraph server (langgraph dev/up), persistence is
handled automatically by the server infrastructure. Do not specify a custom
checkpointer as the server manages this.
"""

from langchain_google_genai import ChatGoogleGenerativeAI
from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend

from config.rag_agent import AgentContext
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe, get_first_chunk
from middleware.sources_context import inject_sources_context
from middleware.query_optimizer import optimize_query


# Create Gemini model
model = ChatGoogleGenerativeAI(model="gemini-2.0-flash")

# Create the RAG agent with official Deep Agents skill system
agent_gemini = create_deep_agent(
    model=model,
    backend=FilesystemBackend(root_dir="."),
    skills=["./skills/"],
    tools=[explore, search, probe, get_first_chunk],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
    middleware=[inject_sources_context, optimize_query],
    context_schema=AgentContext,
)
