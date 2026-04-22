"""Central tool registry for the Hermes harness.

Tools live in ``apps/agent/tools/*.py`` and register themselves at module
import time via ``registry.register(...)``. ``discover_builtin_tools()``
uses AST to scan the tools directory and import only modules whose top
level actually calls ``registry.register``.

This module is the only global mutable state in the harness; after
``discover_builtin_tools`` runs at process startup, the registry is
effectively read-only for the lifetime of the process. Concurrent
requests can safely call ``get_tools`` / ``get_entry``.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class ToolEntry:
    """Metadata + handle for a single registered tool.

    ``tool`` is a LangChain ``BaseTool`` instance (usually ``StructuredTool``
    or ``@tool``-decorated function). It is what the surface's ``llm_call``
    passes to ``model.bind_tools(...)``.
    """

    name: str
    toolset: str
    tool: Any
    check_fn: Callable[[], bool] | None = None
    requires_env: tuple[str, ...] = ()
    frontend: bool = False
    requires_approval: bool = False
    description: str = ""


logger = logging.getLogger(__name__)


class ToolRegistry:
    """Central registry of all tools available to the harness.

    Typical lifecycle:
        1. Process start → ``discover_builtin_tools()`` imports every
           ``tools/*.py`` whose top level calls ``registry.register(...)``.
        2. For each request, the surface's ``llm_call`` node calls
           ``registry.get_tools(toolset={...})`` to obtain a filtered
           LangChain tool list, then ``model.bind_tools(tools)``.

    Thread safety: after discovery, the registry is effectively read-only.
    ``register`` is not intended to be called from request handlers.
    """

    _tools: dict[str, ToolEntry]

    def __init__(self) -> None:
        self._tools = {}

    def register(
        self,
        *,
        name: str,
        toolset: str,
        tool: Any,
        check_fn: Callable[[], bool] | None = None,
        requires_env: tuple[str, ...] = (),
        frontend: bool = False,
        requires_approval: bool = False,
        description: str = "",
    ) -> None:
        """Register a tool. Last registration wins on name collision."""

        if name in self._tools:
            logger.warning(
                "Tool name collision: %r re-registered (previous toolset=%r, new toolset=%r)",
                name,
                self._tools[name].toolset,
                toolset,
            )
        self._tools[name] = ToolEntry(
            name=name,
            toolset=toolset,
            tool=tool,
            check_fn=check_fn,
            requires_env=requires_env,
            frontend=frontend,
            requires_approval=requires_approval,
            description=description,
        )

    def get_entry(self, name: str) -> ToolEntry:
        """Return the ToolEntry for ``name``. Raises ``KeyError`` if absent."""

        return self._tools[name]


# Module-level singleton. Tools register themselves against this instance.
registry = ToolRegistry()
