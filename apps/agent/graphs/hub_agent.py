"""Research Hub Agent for conference discovery.

Provides conference venue, instance, and session discovery capabilities
via direct PostgreSQL queries, with CopilotKit generative UI integration.

This agent uses CopilotKit's recommended LangGraph pattern:
- State inherits from CopilotKitState to receive frontend tools
- Agent binds both frontend actions (showTable, showChart) and backend tools
- Backend tool calls are executed in a loop; frontend tool calls (showTable,
  showChart) pass through to CopilotKit which renders the React components
- CopilotKit intercepts frontend tool calls and renders React components

Note: When running under LangGraph server (langgraph dev/up), persistence is
handled automatically by the server infrastructure (PostgresSaver is configured
by the server). Do not specify a custom checkpointer as the server manages this.
"""

from copilotkit import CopilotKitState
from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from config.hub_agent import HUB_AGENT_CONFIG
from prompts.hub_agent import HUB_AGENT_SYSTEM_PROMPT
from tools.hub_queries import list_instances, list_sessions, list_venues, search_sessions

# Backend tools for database queries
BACKEND_TOOLS = [list_venues, list_instances, list_sessions, search_sessions]
BACKEND_TOOL_NAMES = {t.name for t in BACKEND_TOOLS}


class HubAgentState(CopilotKitState):
    """State for Hub agent with CopilotKit integration.

    Inherits from CopilotKitState to receive frontend-registered tools
    (showTable, showChart) via the copilotkit.actions property.
    """

    pass


async def hub_node(state: HubAgentState, config: RunnableConfig) -> dict:
    """Main agent node that handles user queries with generative UI support.

    This node:
    1. Gets frontend tools (showTable, showChart) from CopilotKit state
    2. Binds both frontend and backend tools to the model
    3. Invokes the model with system prompt and conversation history
    4. Returns the response — routing decides whether to execute tools or end

    CopilotKit automatically intercepts tool calls to showTable/showChart
    and renders the corresponding React components inline in the chat.
    """
    model = ChatOpenAI(
        model=HUB_AGENT_CONFIG.model_name,
        temperature=0.7,
    )

    # Get frontend tools from CopilotKit state
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

    response = await model_with_tools.ainvoke(messages, config)

    return {"messages": [response]}


def route_after_hub(state: HubAgentState) -> str:
    """Route based on whether the last message has backend tool calls.

    - Backend tool calls (list_*, search_*) → execute in "tools" node, then loop back
    - Frontend tool calls (showTable, showChart) → END; CopilotKit intercepts & renders
    - No tool calls (plain text) → END
    """
    last_message = state["messages"][-1]

    if not isinstance(last_message, AIMessage) or not last_message.tool_calls:
        return END

    # If any tool call targets a backend tool, route to tool execution
    if any(tc["name"] in BACKEND_TOOL_NAMES for tc in last_message.tool_calls):
        return "tools"

    # Frontend-only tool calls — CopilotKit handles rendering
    return END


# Build the agent graph with tool execution loop
builder = StateGraph(HubAgentState)
builder.add_node("hub", hub_node)
builder.add_node("tools", ToolNode(BACKEND_TOOLS))
builder.set_entry_point("hub")
builder.add_conditional_edges("hub", route_after_hub, {"tools": "tools", END: END})
builder.add_edge("tools", "hub")  # After tool execution, loop back for next decision

# Export the compiled agent
# Note: Checkpointer is managed by LangGraph server, not specified here
hub_agent = builder.compile()
