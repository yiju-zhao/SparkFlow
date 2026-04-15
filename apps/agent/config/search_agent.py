"""Search agent configuration."""

import os
from dataclasses import dataclass, field


@dataclass
class SearchAgentContext:
    """Runtime context for the search agent."""

    model_provider: str = os.getenv("DEFAULT_MODEL_PROVIDER", "openai")
    model_name: str = os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")
    source_type: str = "web"  # "web" | "publication" | "wechat"
    domains: list[str] = field(default_factory=list)
    wiki_context: str = ""
