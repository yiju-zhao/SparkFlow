"""RAG agent configuration."""

import os
from dataclasses import dataclass, field
from typing import Any


@dataclass
class RAGAgentConfig:
    """Configuration for RAG agent."""

    model_provider: str = os.getenv("DEFAULT_MODEL_PROVIDER", "openai")
    model_name: str = os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")


@dataclass
class AgentContext:
    """Runtime context for RAG agent tools and middleware."""

    notebook_id: str = ""
    wiki_index: str = ""
    wiki_schema: dict[str, Any] = field(default_factory=dict)
    model_provider: str = os.getenv("DEFAULT_MODEL_PROVIDER", "openai")
    model_name: str = os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")


RAG_AGENT_CONFIG = RAGAgentConfig()
