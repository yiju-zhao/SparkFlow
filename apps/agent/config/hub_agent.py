"""Hub agent configuration."""

import os
from dataclasses import dataclass, field
from typing import Any


@dataclass
class HubAgentConfig:
    """Configuration for the Research Hub agent."""

    model_provider: str = os.getenv("HUB_MODEL_PROVIDER", "openai")
    model_name: str = os.getenv("HUB_MODEL_NAME", "gpt-5.4")
    toolbox_server_url: str = os.getenv(
        "TOOLBOX_SERVER_URL", "http://localhost:5000/mcp"
    )
    render_server_url: str = os.getenv("MCP_SERVER_URL", "http://localhost:3108/mcp")
    max_backend_iterations: int = int(os.getenv("HUB_MAX_BACKEND_ITERATIONS", "6"))


@dataclass
class HubAgentContext:
    """Runtime context for the hub agent."""

    model_provider: str = os.getenv("HUB_MODEL_PROVIDER", "openai")
    model_name: str = os.getenv("HUB_MODEL_NAME", "gpt-5.4")
    page_context: list[dict[str, Any]] = field(default_factory=list)


HUB_AGENT_CONFIG = HubAgentConfig()
