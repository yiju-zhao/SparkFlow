"""RAG Agent with per-request model selection.

The model is selected at runtime based on the context passed by the frontend.
Users choose their preferred model in Settings, and the frontend sends
model_provider/model_name with each request via the context field.

Uses a routing StateGraph that delegates to pre-built deep agents based on
the model_provider in the runtime context.
"""

import os

from langchain.chat_models import init_chat_model
from langchain_google_genai import ChatGoogleGenerativeAI
from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.runtime import Runtime

from config.rag_agent import AgentContext
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe, get_first_chunk
from middleware.sources_context import inject_sources_context
from middleware.query_optimizer import optimize_query


def _make_model(provider: str, name: str):
    """Create a LangChain model from provider and name."""
    if provider == "google":
        return ChatGoogleGenerativeAI(model=name)
    return init_chat_model(f"{provider}:{name}")


def _build_agent(model):
    """Build a deep agent with the given model."""
    return create_deep_agent(
        model=model,
        backend=FilesystemBackend(root_dir="."),
        skills=["./skills/"],
        tools=[explore, search, probe, get_first_chunk],
        system_prompt=RAG_AGENT_SYSTEM_PROMPT,
        middleware=[inject_sources_context, optimize_query],
        context_schema=AgentContext,
    )


# Pre-build agents for each supported provider/model from env config
_default_provider = os.getenv("DEFAULT_MODEL_PROVIDER", "openai")
_default_model_name = os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")

# Cache of compiled agents keyed by "provider:model_name"
_agent_cache: dict[str, object] = {}


def _get_agent(provider: str, model_name: str):
    """Get or create a cached agent for the given provider/model."""
    key = f"{provider}:{model_name}"
    if key not in _agent_cache:
        model = _make_model(provider, model_name)
        _agent_cache[key] = _build_agent(model)
    return _agent_cache[key]


# Pre-warm default agent
_get_agent(_default_provider, _default_model_name)


def route_to_agent(state: MessagesState, runtime: Runtime[AgentContext]):
    """Route to the appropriate deep agent based on runtime context."""
    provider = runtime.context.model_provider
    model_name = runtime.context.model_name
    inner_agent = _get_agent(provider, model_name)
    result = inner_agent.invoke(
        state,
        context=runtime.context,
    )
    return result


builder = StateGraph(MessagesState, context_schema=AgentContext)
builder.add_node("agent", route_to_agent)
builder.add_edge(START, "agent")
builder.add_edge("agent", END)

agent = builder.compile()
