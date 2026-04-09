"""RAG Agent with per-request model selection and tool calling.

Uses standard LangGraph StateGraph with tool-augmented LLM.
The model is bound with wiki tools so it can call source_read, etc.
"""

import os

from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.runtime import Runtime

from config.rag_agent import AgentContext
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.wiki_tools import wiki_tools, set_notebook_id

# Build tool lookup
tools_by_name = {t.name: t for t in wiki_tools}


def _make_model(provider: str, name: str):
    """Create a LangChain model from provider and name."""
    if provider == "google":
        return ChatGoogleGenerativeAI(model=name)
    return init_chat_model(f"{provider}:{name}")


def llm_call(state: MessagesState, runtime: Runtime[AgentContext]):
    """LLM decides whether to call a tool or respond."""
    # Set notebook_id for tool calls
    notebook_id = getattr(runtime.context, "notebook_id", "")
    if notebook_id:
        set_notebook_id(notebook_id)

    provider = runtime.context.model_provider or os.getenv("DEFAULT_MODEL_PROVIDER", "openai")
    model_name = runtime.context.model_name or os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")
    model = _make_model(provider, model_name)
    model_with_tools = model.bind_tools(wiki_tools)

    # Build messages with system prompt + wiki context
    messages = list(state["messages"])

    # Inject wiki content from context
    wiki_content = getattr(runtime.context, "wiki_content", "")
    system_parts = [RAG_AGENT_SYSTEM_PROMPT]
    if wiki_content:
        system_parts.append(
            "\n\n## Wiki Knowledge Base\n\n"
            "Below is the compiled knowledge from this notebook's sources. "
            "Answer questions based on this content. "
            "For specific details, call source_read(source_id) using IDs from [source:id] citations.\n\n"
            + wiki_content
        )

    system_msg = SystemMessage(content="\n".join(system_parts))

    response = model_with_tools.invoke([system_msg] + messages)
    return {"messages": [response]}


def tool_node(state: MessagesState):
    """Execute tool calls from the LLM response."""
    results = []
    last_message = state["messages"][-1]
    for tool_call in last_message.tool_calls:
        tool = tools_by_name.get(tool_call["name"])
        if tool:
            try:
                observation = tool.invoke(tool_call["args"])
            except Exception as e:
                observation = f"Tool error: {e}"
        else:
            observation = f"Unknown tool: {tool_call['name']}"
        results.append(
            ToolMessage(content=str(observation), tool_call_id=tool_call["id"])
        )
    return {"messages": results}


def should_continue(state: MessagesState):
    """Route to tool_node if LLM made tool calls, otherwise end."""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tool_node"
    return END


# Build the graph
builder = StateGraph(MessagesState, context_schema=AgentContext)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
builder.add_edge("tool_node", "llm_call")

agent = builder.compile()
