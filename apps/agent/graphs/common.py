"""Shared building blocks for parameterized surface graphs.

``make_llm_call(config)`` returns a coroutine compatible with LangGraph's
``StateGraph.add_node``. It:

  1. Instantiates a ``PromptBuilder`` (module-level singleton).
  2. Instantiates the surface's ``context_refs`` from the runtime context.
  3. Builds the 9-layer system prompt.
  4. Resolves the model via ``init_chat_model`` (BYOK-friendly — api_key
     pulled from runtime context).
  5. Binds tools filtered by ``registry.get_tools(toolset=config.toolset)``.
  6. ``ainvoke`` with [SystemMessage(...), *state.messages].

``make_tool_node(config)`` returns an async node that dispatches
``AIMessage.tool_calls`` against the registry:

  - Backend tools (``frontend=False``): ``tool.ainvoke(args)`` and emit
    ``ToolMessage(content, tool_call_id)``.
  - Frontend tools (``frontend=True``): **not executed** server-side. The
    LLM already emitted the call; the frontend will render it via the
    SDK's message stream. We simply drop it from the server-side follow-up.

The current design keeps per-surface caching within ``PromptBuilder``'s
``_cached_system_prompts``; the module-level singleton is safe because all
state is keyed by ``session_id``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import MessagesState
from langgraph.runtime import Runtime

from config.surfaces import SurfaceConfig
from hermes.prompt_builder import PromptBuilder
from hermes.registry import registry


# Module-level PromptBuilder singleton — thread-safe as long as no one mutates
# ``prompts_root`` post-init. Each surface's cache is keyed by session_id.
_prompt_builder = PromptBuilder()


@dataclass
class SurfaceRuntimeContext:
    """Per-request context passed via ``Runtime[SurfaceRuntimeContext]``.

    This replaces the surface-specific ``AgentContext`` / ``HubAgentContext``
    / ``SearchAgentContext`` dataclasses. Fields the current caller does not
    populate simply remain ``None`` and the relevant ContextRef renders to "".
    """

    model_provider: str
    model_name: str
    user_id: str
    session_id: str
    notebook_id: str | None = None
    page_context: str | None = None
    api_key: str | None = None  # BYOK — per-request
    extra_caller_system: str | None = None


def _resolve_model(ctx: SurfaceRuntimeContext):
    """Instantiate a chat model. Respects BYOK (``ctx.api_key``).

    If ``api_key`` is None, ``init_chat_model`` falls back to env vars —
    matches the existing behavior in ``graphs/rag_agent.py``.
    """

    kwargs: dict[str, Any] = {}
    if ctx.api_key:
        kwargs["api_key"] = ctx.api_key
    return init_chat_model(f"{ctx.model_provider}:{ctx.model_name}", **kwargs)


def make_llm_call(config: SurfaceConfig):
    """Return the async ``llm_call`` node bound to ``config``."""

    async def llm_call(
        state: MessagesState, runtime: Runtime[SurfaceRuntimeContext]
    ) -> dict[str, list[BaseMessage]]:
        ctx = runtime.context
        refs = [ref_cls(ctx) for ref_cls in config.context_refs]

        system_prompt = _prompt_builder.build(
            surface_prompt_path=config.surface_prompt_path,
            surface=config.name,
            model_provider=ctx.model_provider,
            model_name=ctx.model_name,
            user_id=ctx.user_id,
            session_id=ctx.session_id,
            notebook_id=ctx.notebook_id,
            context_refs=refs,
            extra_caller_system=ctx.extra_caller_system,
        )

        model = _resolve_model(ctx)
        tools = registry.get_tools(toolset=config.toolset)
        bound = model.bind_tools(tools)

        response = await bound.ainvoke(
            [SystemMessage(content=system_prompt), *state["messages"]]
        )
        return {"messages": [response]}

    return llm_call


def make_tool_node(config: SurfaceConfig):
    """Return the async ``tool_node`` bound to ``config``.

    Frontend tools are excluded from server-side execution; the LLM's
    ``AIMessage`` already contains the tool_call and will reach the client
    via the stream SDK.
    """

    async def tool_node(state: MessagesState) -> dict[str, list[BaseMessage]]:
        last = state["messages"][-1]
        if not isinstance(last, AIMessage) or not last.tool_calls:
            return {"messages": []}

        results: list[ToolMessage] = []
        for call in last.tool_calls:
            name = call["name"]
            try:
                entry = registry.get_entry(name)
            except KeyError:
                results.append(
                    ToolMessage(
                        content=json.dumps({"error": f"Unknown tool: {name}"}),
                        tool_call_id=call["id"],
                    )
                )
                continue

            if entry.frontend:
                # Not executed server-side. Client renders it.
                continue

            try:
                # Support both async and sync LangChain tools transparently.
                if hasattr(entry.tool, "ainvoke"):
                    raw = await entry.tool.ainvoke(call.get("args", {}))
                else:
                    raw = entry.tool.invoke(call.get("args", {}))
            except Exception as exc:  # noqa: BLE001
                raw = {"error": str(exc)}

            content = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
            results.append(ToolMessage(content=content, tool_call_id=call["id"]))

        return {"messages": results}

    return tool_node
