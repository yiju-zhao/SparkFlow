"""RAG Agent with tool calling and wiki knowledge injection."""

import os

from langchain.chat_models import init_chat_model
from langchain.messages import SystemMessage, ToolMessage
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, MessagesState, START, END
from langgraph.runtime import Runtime

from config.rag_agent import AgentContext
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.wiki_tools import wiki_tools, set_notebook_id

tools_by_name = {t.name: t for t in wiki_tools}

# Cache model+tools binding by (provider, model_name)
_model_cache: dict[str, object] = {}


def _get_model_with_tools(provider: str, name: str):
    """Get or create a cached model with tools bound."""
    key = f"{provider}:{name}"
    if key not in _model_cache:
        if provider == "google":
            model = ChatGoogleGenerativeAI(model=name)
        else:
            model = init_chat_model(f"{provider}:{name}")
        _model_cache[key] = model.bind_tools(wiki_tools)
    return _model_cache[key]


def llm_call(state: MessagesState, runtime: Runtime[AgentContext]):
    """LLM decides whether to call a tool or respond."""
    notebook_id = getattr(runtime.context, "notebook_id", "")
    if notebook_id:
        set_notebook_id(notebook_id)

    provider = runtime.context.model_provider or os.getenv("DEFAULT_MODEL_PROVIDER", "openai")
    model_name = runtime.context.model_name or os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")
    model_with_tools = _get_model_with_tools(provider, model_name)

    # Build system message with wiki content
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

    response = model_with_tools.invoke(
        [SystemMessage(content="\n".join(system_parts))] + list(state["messages"])
    )
    return {"messages": [response]}


def tool_node(state: MessagesState):
    """Execute tool calls from the LLM response."""
    results = []
    for tool_call in state["messages"][-1].tool_calls:
        tool = tools_by_name.get(tool_call["name"])
        try:
            observation = tool.invoke(tool_call["args"]) if tool else f"Unknown tool: {tool_call['name']}"
        except Exception as e:
            observation = f"Tool error: {e}"
        results.append(ToolMessage(content=str(observation), tool_call_id=tool_call["id"]))
    return {"messages": results}


def should_continue(state: MessagesState):
    """Route to tool_node if LLM made tool calls, otherwise end."""
    last = state["messages"][-1]
    return "tool_node" if hasattr(last, "tool_calls") and last.tool_calls else END


builder = StateGraph(MessagesState, context_schema=AgentContext)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
builder.add_edge("tool_node", "llm_call")

agent = builder.compile()
