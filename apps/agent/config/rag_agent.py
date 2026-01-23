"""RAG agent configuration."""

from dataclasses import dataclass


@dataclass
class RAGAgentConfig:
    """Configuration for RAG agent."""
    
    model_provider: str = "openai"
    model_name: str = "gpt-5.2"


RAG_AGENT_CONFIG = RAGAgentConfig()
