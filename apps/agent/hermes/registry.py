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

from collections.abc import Callable
from dataclasses import dataclass, field
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
