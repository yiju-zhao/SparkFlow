"""
RAG Agent using deepagents create_deep_agent.

Built-in features:
- TodoList: Planning capabilities for multi-step research
- Filesystem: Context storage across tool calls (replaces chunk_accumulator)
- SubAgents: Parallel research capability
"""

from deepagents import create_deep_agent

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe
from tools.prompt_optimizer import get_tools as get_prompt_optimizer_tools


model = f"{RAG_AGENT_CONFIG.model_provider}:{RAG_AGENT_CONFIG.model_name}"

# Load optional MCP tools
prompt_optimizer_tools = get_prompt_optimizer_tools()

# Create the RAG agent using deepagents create_deep_agent
# Built-in middleware provides: filesystem tools, todo list, subagent spawning
agent = create_deep_agent(
    model=model,
    tools=[explore, search, probe] + prompt_optimizer_tools,
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
)
