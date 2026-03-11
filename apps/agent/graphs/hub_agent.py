"""Research Hub Agent for conference discovery.

Provides conference venue, instance, and session discovery capabilities
via direct PostgreSQL queries, with CopilotKit generative UI integration.

This agent uses CopilotKit's recommended LangGraph pattern:
- State inherits from CopilotKitState to receive frontend tools
- Agent binds both frontend actions (showTable, showChart) and backend tools
- CopilotKit intercepts frontend tool calls and renders React components

Note: When running under LangGraph server (langgraph dev/up), persistence is
handled automatically by the server infrastructure (PostgresSaver is configured
by the server). Do not specify a custom checkpointer as the server manages this.
"""

from typing import Annotated

from copilotkit import CopilotKitState
from langchain_core.messages import SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.types import Command

from config.hub_agent import HUB_AGENT_CONFIG
from prompts.hub_agent import HUB_AGENT_SYSTEM_PROMPT
from tools.hub_queries import list_instances, list_sessions, list_venues, search_sessions

# Backend tools for database queries
BACKEND_TOOLS = [list_venues, list_instances, list_sessions, search_sessions]


class HubAgentState(CopilotKitState):
    """State for Hub agent with CopilotKit integration.

    Inherits from CopilotKitState to receive frontend-registered tools
    (showTable, showChart) via the copilotkit.actions property.
    """

    pass


async def hub_node(state: HubAgentState, config: RunnableConfig) -> Command:
    """Main agent node that handles user queries with generative UI support.

    This node:
    1. Gets frontend tools (showTable, showChart) from CopilotKit state
    2. Binds both frontend and backend tools to the model
    3. Invokes the model with system prompt and conversation history
    4. Returns the response to be rendered in the chat

    CopilotKit automatically intercepts tool calls to showTable/showChart
    and renders the corresponding React components inline in the chat.
    """
    # Initialize model
    model = ChatOpenAI(
        model=HUB_AGENT_CONFIG.model_name,
        temperature=0.7,
    )

    # Get frontend tools from CopilotKit state
    # These are registered via useComponent in the frontend
    copilotkit_context = state.get("copilotkit", {})
    frontend_actions = copilotkit_context.get("actions", [])

    # Bind ALL tools: frontend generative UI + backend database queries
    all_tools = [*frontend_actions, *BACKEND_TOOLS]
    model_with_tools = model.bind_tools(all_tools)

    # Build messages with system prompt
    messages = [
        SystemMessage(content=HUB_AGENT_SYSTEM_PROMPT),
        *state["messages"],
    ]

    # Invoke model
    response = await model_with_tools.ainvoke(messages, config)

    # Return updated state
    return Command(
        goto=END,
        update={"messages": [response]},
    )


# Build the agent graph
builder = StateGraph(HubAgentState)
builder.add_node("hub", hub_node)
builder.set_entry_point("hub")
builder.set_finish_point("hub")

# Export the compiled agent
# Note: Checkpointer is managed by LangGraph server, not specified here
hub_agent = builder.compile()
