"""Research Hub Agent for conference discovery.

Provides conference venue, instance, and session discovery capabilities
via direct PostgreSQL queries.

Note: When running under LangGraph server (langgraph dev/up), persistence is
handled automatically by the server infrastructure (PostgresSaver is configured
by the server). Do not specify a custom checkpointer as the server manages this.
"""

from deepagents import create_deep_agent

from config.hub_agent import HUB_AGENT_CONFIG
from prompts.hub_agent import HUB_AGENT_SYSTEM_PROMPT
from tools.hub_queries import list_venues, list_instances, list_sessions, search_sessions


model = f"{HUB_AGENT_CONFIG.model_provider}:{HUB_AGENT_CONFIG.model_name}"

# Create the Research Hub agent
# Uses query tools to access conference data from PostgreSQL
# State persistence is managed by the LangGraph server (PostgresSaver)
hub_agent = create_deep_agent(
    model=model,
    tools=[list_venues, list_instances, list_sessions, search_sessions],
    system_prompt=HUB_AGENT_SYSTEM_PROMPT,
)
