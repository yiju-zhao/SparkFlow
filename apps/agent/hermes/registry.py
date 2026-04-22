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

    def get_tools(self, *, toolset: set[str]) -> list[Any]:
        """Return LangChain tool objects whose toolset is in ``toolset`` and
        whose ``check_fn`` (if any) returns True.

        ``check_fn`` is called at most once per call, cached on the local
        ``check_results`` map. Returns tools in the order they were registered.
        """

        check_results: dict[Callable[[], bool], bool] = {}
        out: list[Any] = []
        for name, entry in self._tools.items():
            if entry.toolset not in toolset:
                continue
            if entry.check_fn is not None:
                if entry.check_fn not in check_results:
                    try:
                        check_results[entry.check_fn] = bool(entry.check_fn())
                    except Exception:
                        logger.exception(
                            "check_fn raised for tool %r; treating as unavailable", name
                        )
                        check_results[entry.check_fn] = False
                if not check_results[entry.check_fn]:
                    continue
            out.append(entry.tool)
        return out

    def is_frontend(self, name: str) -> bool:
        """Return True if the tool is a frontend/UI passthrough.

        Raises ``KeyError`` if the tool is not registered.
        """

        return self._tools[name].frontend


# Module-level singleton. Tools register themselves against this instance.
registry = ToolRegistry()
