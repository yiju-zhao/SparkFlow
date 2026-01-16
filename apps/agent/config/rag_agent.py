"""RAG agent configuration."""

from dataclasses import dataclass, field


@dataclass
class RAGAgentConfig:
    """Configuration for RAG agent."""
    
    model_name: str = "gpt-4o"
    api_key: str | None = None
    synthesis_temperature: float = 0.3
    dataset_ids: list[str] = field(default_factory=list)
    document_ids: list[str] = field(default_factory=list)
    top_k: int = 10
