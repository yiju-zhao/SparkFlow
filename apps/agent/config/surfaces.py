"""Surface configuration: declarative description of one agent surface.

Each surface (notebook, hub, deep_research, ...) is defined by a single
``SurfaceConfig`` instance. The parameterized graph in ``graphs/surface.py``
builds a LangGraph ``StateGraph`` from this config.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True, slots=True)
class SurfaceConfig:
    """Declarative surface definition.

    Attributes:
        name: Short surface identifier ("notebook", "hub", "deep_research").
            Used for LangGraph thread routing, logging, prompt-cache keys.
        surface_prompt_path: Path under ``apps/agent/prompts/`` to the
            surface's Markdown prompt fragment (layer 7 of PromptBuilder).
        toolset: Set of ``ToolEntry.toolset`` values that this surface
            should receive. ``registry.get_tools(toolset=config.toolset)``
            returns the LangChain tools passed to ``model.bind_tools(...)``.
        context_refs: Tuple of ``ContextRef`` *classes* (not instances) that
            the llm_call node will instantiate from the runtime context
            each turn.
        memory_scope: Tuple of memory scopes visible to this surface.
            Allowed values: ``"user"``, ``"notebook"``. P1 ships the
            structure; P3 wires the real data.
        max_iterations: Hard cap on tool-call rounds per user message.
    """

    name: str
    surface_prompt_path: str
    toolset: set[str]
    context_refs: tuple[type, ...] = ()
    memory_scope: tuple[str, ...] = ()
    max_iterations: int = 30
