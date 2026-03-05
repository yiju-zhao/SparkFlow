"""Hub agent configuration."""

from dataclasses import dataclass


@dataclass
class HubAgentConfig:
    """Configuration for Research Hub agent."""

    model_provider: str = "openai"
    model_name: str = "gpt-4o-mini"


HUB_AGENT_CONFIG = HubAgentConfig()
