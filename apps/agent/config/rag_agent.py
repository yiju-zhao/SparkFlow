"""RAG agent configuration."""

from dataclasses import dataclass, field
from typing import Any


@dataclass
class RAGAgentConfig:
    """Configuration for RAG agent."""

    model_provider: str = "openai"
    model_name: str = "gpt-5.2"


@dataclass
class AgentContext:
    """Runtime context for RAG agent tools and middleware.

    This context is passed when invoking the agent and is accessible
    via runtime.context in tools and middleware.
    """

    dataset_ids: list[str] = field(default_factory=list)
    sources_context: list[dict[str, Any]] = field(default_factory=list)


RAG_AGENT_CONFIG = RAGAgentConfig()
