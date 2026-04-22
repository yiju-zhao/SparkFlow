# Hermes Harness — P1 (Primitives Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the harness primitives (`hermes/registry.py`, `hermes/prompt_builder.py`, `hermes/context/references.py`) plus their prompt-fragment markdown files and full test coverage. Do not touch any existing LangGraph graph.

**Architecture:** Pure library code added under `apps/agent/hermes/` with parallel `apps/agent/tests/`. Auto-discovery scans `apps/agent/tools/*.py` for module-level `registry.register(...)` calls via AST. `PromptBuilder` lays out the 8-layer system prompt per spec §5.2 with per-session `_cached_system_prompt`; memory/skills layers are wired as no-ops in P1 and filled in during P3.

**Tech Stack:** Python 3.11+, pytest, pydantic, LangChain `StructuredTool` (already in deps), `ast` (stdlib), `importlib` (stdlib). No new runtime deps; only `pytest` added to dev deps.

**Spec:** `docs/superpowers/specs/2026-04-22-hermes-harness-design.md` §4.3, §5.1, §5.2, §10 (P1 row).

---

## Scope boundaries

**IN scope for P1:**
- `apps/agent/hermes/__init__.py`
- `apps/agent/hermes/registry.py`
- `apps/agent/hermes/prompt_builder.py`
- `apps/agent/hermes/context/__init__.py`
- `apps/agent/hermes/context/references.py`
- `apps/agent/tools/_echo.py` (demo tool for tests; not registered into any surface)
- `apps/agent/prompts/base_identity.md`
- `apps/agent/prompts/tool_use_enforcement.md`
- `apps/agent/prompts/model_hints/openai.md`
- `apps/agent/prompts/model_hints/gemini.md`
- `apps/agent/pytest.ini`
- `apps/agent/tests/__init__.py`
- `apps/agent/tests/conftest.py`
- `apps/agent/tests/test_registry.py`
- `apps/agent/tests/test_prompt_builder.py`
- `apps/agent/tests/test_context_references.py`
- `apps/agent/tests/test_discover.py`
- `apps/agent/tests/fixtures/fake_tools/` (test-only fake tools dir)
- `apps/agent/pyproject.toml` (add `hermes` to `packages`; add pytest dev dep)

**OUT of scope for P1** (deferred to later phases):
- Any graph refactor (`graphs/rag_agent.py`, `graphs/hub_agent.py`, `graphs/search_agent.py` stay untouched → P2/P4)
- Memory / Skills implementations (no-op stubs only → P3)
- FastAPI / HTTP changes
- Frontend changes
- Any workflow or jobs code (→ P4/P5/P6)
- Real tool registrations for wiki/hub/wechat/nav/web (→ P2)

**Rollback:** Every task ends with a commit. Any task can be reverted independently. No existing code is modified; everything is additive.

---

## Task 1: Bootstrap pytest infrastructure

**Files:**
- Create: `apps/agent/pytest.ini`
- Create: `apps/agent/tests/__init__.py` (empty)
- Create: `apps/agent/tests/conftest.py`
- Modify: `apps/agent/pyproject.toml` (add `hermes` to `packages`, add pytest)

- [ ] **Step 1: Create `apps/agent/pytest.ini`**

```ini
[pytest]
testpaths = tests
python_files = test_*.py
addopts = -v
asyncio_mode = auto
```

- [ ] **Step 2: Create `apps/agent/tests/__init__.py`** (empty file)

```python
```

- [ ] **Step 3: Create `apps/agent/tests/conftest.py`**

```python
"""Shared pytest fixtures for apps/agent tests.

Injects apps/agent on sys.path so tests can import `hermes`, `tools`, etc.
without an editable install.
"""

import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
```

- [ ] **Step 4: Update `apps/agent/pyproject.toml`**

Find the `[tool.hatch.build.targets.wheel]` section and add `hermes` to packages:

```toml
[tool.hatch.build.targets.wheel]
packages = ["graphs", "tools", "config", "prompts", "embeddings", "hermes"]
```

Then add a dev dependency group near the end of the file:

```toml
[project.optional-dependencies]
dev = [
    "pytest>=7.4",
    "pytest-asyncio>=0.23",
]
```

- [ ] **Step 5: Install dev deps and verify pytest collects**

Run (from repo root):

```bash
cd apps/agent && pip install -e '.[dev]' && python -m pytest --collect-only -q
```

Expected output: `no tests ran in 0.XXs` (zero tests collected, zero errors). If you see import errors, fix the pytest.ini / conftest.py before committing.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/pytest.ini apps/agent/tests/__init__.py apps/agent/tests/conftest.py apps/agent/pyproject.toml
git commit -m "chore(agent): bootstrap pytest infra for hermes harness tests"
```

---

## Task 2: `ToolEntry` dataclass

**Files:**
- Create: `apps/agent/hermes/__init__.py` (empty)
- Create: `apps/agent/hermes/registry.py`
- Create: `apps/agent/tests/test_registry.py`

- [ ] **Step 1: Write the failing test**

Create `apps/agent/tests/test_registry.py`:

```python
"""Tests for hermes.registry."""

from hermes.registry import ToolEntry


def test_tool_entry_creation_minimal():
    entry = ToolEntry(
        name="echo",
        toolset="test",
        tool=object(),  # placeholder; real tool in later tests
    )
    assert entry.name == "echo"
    assert entry.toolset == "test"
    assert entry.check_fn is None
    assert entry.requires_env == ()
    assert entry.frontend is False
    assert entry.requires_approval is False
    assert entry.description == ""


def test_tool_entry_creation_full():
    def _check() -> bool:
        return True

    tool_obj = object()
    entry = ToolEntry(
        name="wiki_search",
        toolset="wiki",
        tool=tool_obj,
        check_fn=_check,
        requires_env=("OPENAI_API_KEY",),
        frontend=False,
        requires_approval=False,
        description="Search the notebook wiki.",
    )
    assert entry.check_fn is _check
    assert entry.requires_env == ("OPENAI_API_KEY",)
    assert entry.description == "Search the notebook wiki."
    assert entry.tool is tool_obj


def test_tool_entry_uses_slots():
    entry = ToolEntry(name="x", toolset="t", tool=object())
    # slots means we can't assign arbitrary attributes
    try:
        entry.unknown_attr = 1  # type: ignore[attr-defined]
    except (AttributeError, TypeError):
        return
    raise AssertionError("ToolEntry should use __slots__ and reject unknown attrs")
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/agent && python -m pytest tests/test_registry.py -v
```

Expected: `ModuleNotFoundError: No module named 'hermes'` or `ImportError`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/agent/hermes/__init__.py` (empty):

```python
```

Create `apps/agent/hermes/registry.py`:

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/agent && python -m pytest tests/test_registry.py -v
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/hermes/__init__.py apps/agent/hermes/registry.py apps/agent/tests/test_registry.py
git commit -m "feat(agent): add ToolEntry dataclass to hermes.registry"
```

---

## Task 3: `ToolRegistry.register` and `get_entry`

**Files:**
- Modify: `apps/agent/hermes/registry.py`
- Modify: `apps/agent/tests/test_registry.py`

- [ ] **Step 1: Write the failing tests**

Append to `apps/agent/tests/test_registry.py`:

```python
import pytest

from hermes.registry import ToolRegistry


def test_registry_register_and_get():
    reg = ToolRegistry()
    tool_obj = object()
    reg.register(name="echo", toolset="test", tool=tool_obj)
    entry = reg.get_entry("echo")
    assert entry.name == "echo"
    assert entry.tool is tool_obj


def test_registry_get_entry_unknown_raises_keyerror():
    reg = ToolRegistry()
    with pytest.raises(KeyError):
        reg.get_entry("does_not_exist")


def test_registry_duplicate_name_overrides_with_warning(caplog):
    reg = ToolRegistry()
    reg.register(name="echo", toolset="a", tool=object())
    with caplog.at_level("WARNING"):
        reg.register(name="echo", toolset="b", tool=object())
    assert any("echo" in rec.message for rec in caplog.records)
    # Last registration wins
    assert reg.get_entry("echo").toolset == "b"


def test_registry_register_with_all_fields():
    reg = ToolRegistry()

    def _check() -> bool:
        return True

    reg.register(
        name="wiki_search",
        toolset="wiki",
        tool=object(),
        check_fn=_check,
        requires_env=("OPENAI_API_KEY",),
        frontend=False,
        description="Search",
    )
    entry = reg.get_entry("wiki_search")
    assert entry.check_fn is _check
    assert entry.requires_env == ("OPENAI_API_KEY",)
    assert entry.description == "Search"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/agent && python -m pytest tests/test_registry.py -v
```

Expected: 4 new tests fail with `ImportError: cannot import name 'ToolRegistry'`.

- [ ] **Step 3: Implement `ToolRegistry`**

Add to `apps/agent/hermes/registry.py` after the `ToolEntry` definition:

```python
import logging

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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/agent && python -m pytest tests/test_registry.py -v
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/hermes/registry.py apps/agent/tests/test_registry.py
git commit -m "feat(agent): add ToolRegistry.register and get_entry"
```

---

## Task 4: `ToolRegistry.get_tools` with toolset filter and check_fn gating

**Files:**
- Modify: `apps/agent/hermes/registry.py`
- Modify: `apps/agent/tests/test_registry.py`

- [ ] **Step 1: Write the failing tests**

Append to `apps/agent/tests/test_registry.py`:

```python
def test_get_tools_filters_by_toolset():
    reg = ToolRegistry()
    t1 = object()
    t2 = object()
    t3 = object()
    reg.register(name="a", toolset="wiki", tool=t1)
    reg.register(name="b", toolset="hub", tool=t2)
    reg.register(name="c", toolset="wiki", tool=t3)
    tools = reg.get_tools(toolset={"wiki"})
    assert set(id(t) for t in tools) == {id(t1), id(t3)}


def test_get_tools_multi_toolset():
    reg = ToolRegistry()
    t1, t2, t3 = object(), object(), object()
    reg.register(name="a", toolset="wiki", tool=t1)
    reg.register(name="b", toolset="hub", tool=t2)
    reg.register(name="c", toolset="memory", tool=t3)
    tools = reg.get_tools(toolset={"wiki", "memory"})
    assert set(id(t) for t in tools) == {id(t1), id(t3)}


def test_get_tools_check_fn_gates_inclusion():
    reg = ToolRegistry()
    t_available = object()
    t_unavailable = object()
    reg.register(name="a", toolset="x", tool=t_available, check_fn=lambda: True)
    reg.register(name="b", toolset="x", tool=t_unavailable, check_fn=lambda: False)
    tools = reg.get_tools(toolset={"x"})
    assert tools == [t_available]


def test_get_tools_no_check_fn_always_included():
    reg = ToolRegistry()
    t = object()
    reg.register(name="a", toolset="x", tool=t)  # no check_fn
    tools = reg.get_tools(toolset={"x"})
    assert tools == [t]


def test_get_tools_empty_toolset_returns_empty():
    reg = ToolRegistry()
    reg.register(name="a", toolset="x", tool=object())
    assert reg.get_tools(toolset=set()) == []


def test_get_tools_unknown_toolset_returns_empty():
    reg = ToolRegistry()
    reg.register(name="a", toolset="x", tool=object())
    assert reg.get_tools(toolset={"y"}) == []


def test_is_frontend():
    reg = ToolRegistry()
    reg.register(name="backend_tool", toolset="x", tool=object(), frontend=False)
    reg.register(name="ui_tool", toolset="x", tool=object(), frontend=True)
    assert reg.is_frontend("ui_tool") is True
    assert reg.is_frontend("backend_tool") is False
    with pytest.raises(KeyError):
        reg.is_frontend("unknown")
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/agent && python -m pytest tests/test_registry.py -v
```

Expected: 7 new tests fail with `AttributeError: 'ToolRegistry' object has no attribute 'get_tools'`.

- [ ] **Step 3: Implement `get_tools` and `is_frontend`**

Add to the `ToolRegistry` class in `apps/agent/hermes/registry.py` (after `get_entry`):

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/agent && python -m pytest tests/test_registry.py -v
```

Expected: 14 tests pass total.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/hermes/registry.py apps/agent/tests/test_registry.py
git commit -m "feat(agent): add ToolRegistry.get_tools and is_frontend"
```

---

## Task 5: `discover_builtin_tools` with AST-level filter

**Files:**
- Modify: `apps/agent/hermes/registry.py`
- Create: `apps/agent/tests/fixtures/__init__.py` (empty)
- Create: `apps/agent/tests/fixtures/fake_tools/__init__.py` (empty)
- Create: `apps/agent/tests/fixtures/fake_tools/real_tool.py` (registers)
- Create: `apps/agent/tests/fixtures/fake_tools/helper.py` (does not register)
- Create: `apps/agent/tests/test_discover.py`

- [ ] **Step 1: Create fake tools fixtures**

Create `apps/agent/tests/fixtures/__init__.py` (empty):

```python
```

Create `apps/agent/tests/fixtures/fake_tools/__init__.py` (empty):

```python
```

Create `apps/agent/tests/fixtures/fake_tools/real_tool.py`:

```python
"""A fake tool module that registers itself. Used by tests only."""

from hermes.registry import registry

registry.register(name="fake_real", toolset="fake", tool=object())
```

Create `apps/agent/tests/fixtures/fake_tools/helper.py`:

```python
"""A helper module that does NOT register at module top level. Should be
skipped by discover_builtin_tools' AST filter.
"""

from hermes.registry import registry


def inner_register_helper():
    """The registry.register call here is INSIDE a function body, so the
    module-top-level AST check will ignore this file."""

    registry.register(name="fake_helper", toolset="fake", tool=object())
```

- [ ] **Step 2: Write the failing tests**

Create `apps/agent/tests/test_discover.py`:

```python
"""Tests for hermes.registry.discover_builtin_tools."""

import importlib
import sys
from pathlib import Path

import pytest

from hermes.registry import ToolRegistry, discover_builtin_tools, registry as global_registry


FIXTURES = Path(__file__).parent / "fixtures" / "fake_tools"


def _clear_fixture_imports():
    """Remove any cached imports of our fixture modules so each test is fresh."""
    for mod in list(sys.modules):
        if mod.startswith("tests.fixtures.fake_tools"):
            del sys.modules[mod]


def test_discover_imports_registering_module():
    _clear_fixture_imports()
    # Ensure a clean registry slot for the fake tool
    global_registry._tools.pop("fake_real", None)

    imported = discover_builtin_tools(tools_dir=FIXTURES, package="tests.fixtures.fake_tools")
    assert "tests.fixtures.fake_tools.real_tool" in imported
    assert "fake_real" in global_registry._tools


def test_discover_skips_non_registering_module():
    _clear_fixture_imports()
    global_registry._tools.pop("fake_helper", None)

    imported = discover_builtin_tools(tools_dir=FIXTURES, package="tests.fixtures.fake_tools")
    assert "tests.fixtures.fake_tools.helper" not in imported
    # helper.py has registry.register INSIDE a function; that call should not run
    assert "fake_helper" not in global_registry._tools


def test_discover_skips_init_and_registry():
    """__init__.py and any file called registry.py should be skipped."""
    _clear_fixture_imports()
    imported = discover_builtin_tools(tools_dir=FIXTURES, package="tests.fixtures.fake_tools")
    assert not any("__init__" in m for m in imported)
    assert not any(m.endswith(".registry") for m in imported)


def test_discover_nonexistent_dir_returns_empty(tmp_path):
    # tmp_path is empty
    imported = discover_builtin_tools(tools_dir=tmp_path, package="test.empty")
    assert imported == []
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/agent && python -m pytest tests/test_discover.py -v
```

Expected: tests fail with `ImportError: cannot import name 'discover_builtin_tools'`.

- [ ] **Step 4: Implement `discover_builtin_tools`**

Add at the top of `apps/agent/hermes/registry.py`:

```python
import ast
import importlib
from pathlib import Path
```

Append at the end of `apps/agent/hermes/registry.py`:

```python
_DISCOVER_EXEMPT_FILENAMES = {"__init__.py", "registry.py", "mcp_tool.py"}


def _module_registers_tools_at_top_level(path: Path) -> bool:
    """AST-check: does this .py file have a top-level ``registry.register(...)``
    call? Calls inside function/class bodies don't count — we only want files
    whose module import triggers the registration side-effect.
    """

    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (SyntaxError, OSError):
        return False
    for node in tree.body:
        if not isinstance(node, ast.Expr):
            continue
        call = node.value
        if not isinstance(call, ast.Call):
            continue
        func = call.func
        # matches: registry.register(...), some_alias.register(...)
        if isinstance(func, ast.Attribute) and func.attr == "register":
            return True
    return False


def discover_builtin_tools(
    *,
    tools_dir: Path | None = None,
    package: str = "tools",
) -> list[str]:
    """Import all .py files under ``tools_dir`` whose module top level calls
    ``registry.register(...)``. Returns the list of imported module names.

    ``package`` is the Python package prefix used to build the module name
    (e.g. ``"tools"`` → ``"tools.wiki"``). For tests, fixtures use a custom
    package to avoid polluting the production ``tools`` namespace.
    """

    if tools_dir is None:
        tools_dir = Path(__file__).resolve().parent.parent / "tools"
    if not tools_dir.exists() or not tools_dir.is_dir():
        return []

    imported: list[str] = []
    for py in sorted(tools_dir.glob("*.py")):
        if py.name in _DISCOVER_EXEMPT_FILENAMES:
            continue
        if not _module_registers_tools_at_top_level(py):
            continue
        module_name = f"{package}.{py.stem}"
        importlib.import_module(module_name)
        imported.append(module_name)

    # Recurse one level into subdirs that are Python packages
    for sub in sorted(tools_dir.iterdir()):
        if not (sub.is_dir() and (sub / "__init__.py").exists()):
            continue
        for py in sorted(sub.glob("*.py")):
            if py.name in _DISCOVER_EXEMPT_FILENAMES:
                continue
            if not _module_registers_tools_at_top_level(py):
                continue
            module_name = f"{package}.{sub.name}.{py.stem}"
            importlib.import_module(module_name)
            imported.append(module_name)

    return imported
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/agent && python -m pytest tests/test_discover.py tests/test_registry.py -v
```

Expected: 18 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/hermes/registry.py apps/agent/tests/test_discover.py apps/agent/tests/fixtures/
git commit -m "feat(agent): add AST-based discover_builtin_tools"
```

---

## Task 6: Echo LangChain tool

**Files:**
- Create: `apps/agent/tools/_echo.py`
- Modify: `apps/agent/tests/test_discover.py`

- [ ] **Step 1: Write the failing test**

Append to `apps/agent/tests/test_discover.py`:

```python
def test_echo_tool_is_discovered_from_production_tools_dir():
    """The real apps/agent/tools/ directory must include _echo.py after P1."""
    _clear_fixture_imports()
    # Clear any prior registration so the discovery side-effect is observable
    global_registry._tools.pop("echo", None)

    imported = discover_builtin_tools()  # use default tools_dir
    assert "tools._echo" in imported
    entry = global_registry.get_entry("echo")
    assert entry.name == "echo"
    assert entry.toolset == "_test"
    # The tool itself is a LangChain BaseTool instance
    from langchain_core.tools import BaseTool
    assert isinstance(entry.tool, BaseTool)


def test_echo_tool_invocation_returns_input():
    from hermes.registry import registry as global_registry

    entry = global_registry.get_entry("echo")
    result = entry.tool.invoke({"text": "hello"})
    assert result == "hello"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/agent && python -m pytest tests/test_discover.py::test_echo_tool_is_discovered_from_production_tools_dir -v
```

Expected: fail with `KeyError: 'echo'` (no such tool).

- [ ] **Step 3: Implement the echo tool**

Create `apps/agent/tools/_echo.py`:

```python
"""Smoke-test tool. Not attached to any surface's toolset in production —
lives in an ``_test`` toolset so nothing can accidentally expose it to an
LLM. Its sole purpose is to let tests verify that auto-discovery + registry
round-trip works end to end.
"""

from langchain_core.tools import tool

from hermes.registry import registry


@tool
def echo(text: str) -> str:
    """Return the input text verbatim. Used only for harness smoke tests."""

    return text


registry.register(
    name="echo",
    toolset="_test",
    tool=echo,
    description="Return the input text verbatim (test-only).",
)
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/agent && python -m pytest tests/test_discover.py -v
```

Expected: all discover tests pass (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/tools/_echo.py apps/agent/tests/test_discover.py
git commit -m "feat(agent): add echo test tool + registry discovery coverage"
```

---

## Task 7: Prompt markdown fragments

**Files:**
- Create: `apps/agent/prompts/base_identity.md`
- Create: `apps/agent/prompts/tool_use_enforcement.md`
- Create: `apps/agent/prompts/model_hints/openai.md`
- Create: `apps/agent/prompts/model_hints/gemini.md`

- [ ] **Step 1: Create `apps/agent/prompts/base_identity.md`**

```markdown
You are SparkFlow's research assistant. You help users investigate technical
topics by grounding answers in the user's notebook sources, the research hub's
conference/paper data, and — where appropriate — the open web.

Core principles:

1. **Cite what you claim.** Every factual claim that could be contested must
   link to a concrete source (a notebook source id, a conference session,
   a URL). Use inline `[source:id]` citations for internal content.
2. **Prefer the user's own library.** If the user has uploaded sources or
   has notebooks with relevant content, consult those first. Open-web search
   is a fallback, not a default.
3. **Ask when the question is ambiguous.** A one-line clarifying question
   beats a confident wrong answer.
4. **Use tools; don't narrate tool usage.** Call tools directly when they
   would help. Do not describe what you plan to do and then not do it.
5. **Match the user's language.** Respond in the language the user writes
   in. Chinese and English are both first-class.
```

- [ ] **Step 2: Create `apps/agent/prompts/tool_use_enforcement.md`**

```markdown
# Tool-use enforcement

You MUST use your tools to take action — do not describe what you would do
or plan to do without actually doing it. When a tool would help, call it.

When tools return structured results, ground your reply in those results.
Do not fabricate data beyond what the tools returned.

If a tool call fails, read the error, decide whether to retry with adjusted
arguments, switch to a different tool, or ask the user for more information.
Never silently pretend the call succeeded.
```

- [ ] **Step 3: Create `apps/agent/prompts/model_hints/openai.md`**

```markdown
# OpenAI-family execution guidance

<tool_persistence>
- Use tools whenever they improve correctness.
- Do not stop early when another tool call would improve the result.
- Keep calling tools until: task complete AND verified.
</tool_persistence>

<prerequisite_checks>
- Check whether prerequisite discovery steps are needed (e.g., list sources
  before reading them).
- Do not skip prerequisite steps to save a turn.
</prerequisite_checks>

<verification>
- Correctness: does output satisfy every requirement?
- Grounding: are factual claims backed by tool outputs?
- Formatting: does output match requested format?
- Safety: confirm scope before executing side effects (memory writes, etc.).
</verification>
```

- [ ] **Step 4: Create `apps/agent/prompts/model_hints/gemini.md`**

```markdown
# Google Gemini-family execution guidance

- Prefer parallel tool calls when independent work can be batched.
- Do not assume a library, file, or datum exists — verify with a read/search
  before acting on it.
- When writing commands or URLs, prefer absolute identifiers over relative
  ones (absolute paths, full URLs, complete session ids).
- Tool calls may use non-interactive flags (`-y`, `--yes`) when the operation
  is safe and idempotent.
```

- [ ] **Step 5: Commit**

```bash
git add apps/agent/prompts/base_identity.md apps/agent/prompts/tool_use_enforcement.md apps/agent/prompts/model_hints/
git commit -m "feat(agent): add SparkFlow SOUL + tool-use enforcement + model hints"
```

---

## Task 8: `ContextRef` protocol + `WikiContentRef` stub

**Files:**
- Create: `apps/agent/hermes/context/__init__.py` (empty)
- Create: `apps/agent/hermes/context/references.py`
- Create: `apps/agent/tests/test_context_references.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/agent/tests/test_context_references.py`:

```python
"""Tests for hermes.context.references."""

from dataclasses import dataclass

from hermes.context.references import ContextRef, WikiContentRef, NotebookSourcesRef, PageContextRef


@dataclass
class _FakeCtx:
    notebook_id: str | None = None
    page_context: str | None = None


def test_wiki_content_ref_renders_header_and_placeholder_when_no_data():
    ref = WikiContentRef(_FakeCtx(notebook_id="nb_123"))
    out = ref.render()
    assert "Wiki Knowledge Base" in out
    assert "nb_123" in out or "notebook" in out.lower()


def test_wiki_content_ref_empty_when_no_notebook_id():
    ref = WikiContentRef(_FakeCtx(notebook_id=None))
    assert ref.render() == ""


def test_notebook_sources_ref_empty_when_no_notebook_id():
    ref = NotebookSourcesRef(_FakeCtx(notebook_id=None))
    assert ref.render() == ""


def test_page_context_ref_includes_raw_when_present():
    ref = PageContextRef(_FakeCtx(page_context="user is on /explore/conferences"))
    out = ref.render()
    assert "Current page context" in out
    assert "explore/conferences" in out


def test_page_context_ref_empty_when_missing():
    ref = PageContextRef(_FakeCtx(page_context=None))
    assert ref.render() == ""


def test_context_ref_is_a_protocol():
    # Should be usable as a structural type
    class _Custom:
        def render(self) -> str:
            return "custom"

    def _takes(ref: ContextRef) -> str:
        return ref.render()

    assert _takes(_Custom()) == "custom"
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/agent && python -m pytest tests/test_context_references.py -v
```

Expected: `ModuleNotFoundError: No module named 'hermes.context'`.

- [ ] **Step 3: Implement the module**

Create `apps/agent/hermes/context/__init__.py` (empty):

```python
```

Create `apps/agent/hermes/context/references.py`:

```python
"""Context references for the prompt builder.

A ``ContextRef`` renders an optional string block to be concatenated into
the system prompt. Each subclass targets a specific external data source
(wiki, notebook sources, current page, web-search history, etc.). In P1
these are stubs that either return an empty string or a lightweight header;
P2/P3/P4 replace the stubs with real data access.

The design choice: each ref takes the full request ``context`` object in
its constructor and owns its own lookup logic. The prompt builder does
not need to know what a ref depends on — it just calls ``render()``.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ContextRef(Protocol):
    """Any object with a ``render() -> str`` method qualifies."""

    def render(self) -> str: ...


class _RefBase:
    """Common ctor. Subclasses pull what they need off ``ctx``."""

    def __init__(self, ctx: Any) -> None:
        self.ctx = ctx


class WikiContentRef(_RefBase):
    """Inject the notebook's wiki knowledge as a system-prompt block.

    P1 stub: returns a header referencing the notebook id so downstream
    tests can verify the hook is wired correctly. Real content load is P2
    (reuses ``lib/services/wiki-ingest.ts`` output via HTTP to Next.js).
    """

    def render(self) -> str:
        notebook_id = getattr(self.ctx, "notebook_id", None)
        if not notebook_id:
            return ""
        return (
            f"## Wiki Knowledge Base\n\n"
            f"Compiled knowledge for notebook `{notebook_id}`. "
            f"(P1 placeholder — real content injected in P2.)"
        )


class NotebookSourcesRef(_RefBase):
    """List the notebook's uploaded sources so the model knows what `source_read`
    can retrieve. P1 stub returns empty; P2 wires in the real list.
    """

    def render(self) -> str:
        notebook_id = getattr(self.ctx, "notebook_id", None)
        if not notebook_id:
            return ""
        return (
            f"## Notebook Sources\n\n"
            f"Sources for notebook `{notebook_id}`. "
            f"(P1 placeholder — real list injected in P2.)"
        )


class PageContextRef(_RefBase):
    """Inject the frontend's current-page hint (e.g., 'user is on
    /explore/conferences'). Passed through from the HTTP request.
    """

    def render(self) -> str:
        page = getattr(self.ctx, "page_context", None)
        if not page:
            return ""
        return f"## Current page context\n\n- {page}"


class WebSearchContextRef(_RefBase):
    """For the deep_research surface: running history of web searches and
    URLs already visited. P1 stub; real impl in P4.
    """

    def render(self) -> str:
        return ""
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/agent && python -m pytest tests/test_context_references.py -v
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/hermes/context/ apps/agent/tests/test_context_references.py
git commit -m "feat(agent): add ContextRef protocol + Wiki/Sources/Page/WebSearch stubs"
```

---

## Task 9: `PromptBuilder.build_minimal`

**Files:**
- Create: `apps/agent/hermes/prompt_builder.py`
- Create: `apps/agent/tests/test_prompt_builder.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/agent/tests/test_prompt_builder.py`:

```python
"""Tests for hermes.prompt_builder."""

from pathlib import Path

import pytest

from hermes.prompt_builder import PromptBuilder


def test_build_minimal_includes_base_identity():
    pb = PromptBuilder()
    out = pb.build_minimal(
        surface_prompt_path="surfaces/echo_test.md",
        model_provider="openai",
        model_name="gpt-4o",
    )
    assert "SparkFlow" in out
    assert "research assistant" in out


def test_build_minimal_includes_tool_use_enforcement():
    pb = PromptBuilder()
    out = pb.build_minimal(
        surface_prompt_path="surfaces/echo_test.md",
        model_provider="openai",
        model_name="gpt-4o",
    )
    assert "Tool-use enforcement" in out


def test_build_minimal_openai_hint_for_openai_family():
    pb = PromptBuilder()
    out = pb.build_minimal(
        surface_prompt_path="surfaces/echo_test.md",
        model_provider="openai",
        model_name="gpt-4o",
    )
    assert "<tool_persistence>" in out


def test_build_minimal_gemini_hint_for_google():
    pb = PromptBuilder()
    out = pb.build_minimal(
        surface_prompt_path="surfaces/echo_test.md",
        model_provider="google",
        model_name="gemini-2.0-flash",
    )
    assert "Gemini-family" in out
    assert "<tool_persistence>" not in out  # should not include openai hints


def test_build_minimal_unknown_provider_skips_model_hint():
    pb = PromptBuilder()
    out = pb.build_minimal(
        surface_prompt_path="surfaces/echo_test.md",
        model_provider="something-nonexistent",
        model_name="x",
    )
    # No crash; just no hints
    assert "<tool_persistence>" not in out
    assert "Gemini-family" not in out


def test_build_minimal_includes_surface_prompt(tmp_path):
    # Write a temporary surface prompt and point the builder at tmp_path
    surface_dir = tmp_path / "surfaces"
    surface_dir.mkdir()
    (surface_dir / "test_surface.md").write_text("Surface: test_surface body.", encoding="utf-8")

    pb = PromptBuilder(prompts_root=tmp_path)
    out = pb.build_minimal(
        surface_prompt_path="surfaces/test_surface.md",
        model_provider="openai",
        model_name="gpt-4o",
    )
    assert "Surface: test_surface body." in out


def test_build_minimal_missing_surface_prompt_raises(tmp_path):
    pb = PromptBuilder(prompts_root=tmp_path)
    with pytest.raises(FileNotFoundError):
        pb.build_minimal(
            surface_prompt_path="surfaces/does_not_exist.md",
            model_provider="openai",
            model_name="gpt-4o",
        )


def test_build_minimal_layer_order(tmp_path):
    """Base identity must precede enforcement, which must precede model hint,
    which must precede the surface prompt."""
    surface_dir = tmp_path / "surfaces"
    surface_dir.mkdir()
    (surface_dir / "order.md").write_text("SURFACE_MARKER", encoding="utf-8")
    # Copy the real identity/enforcement/hints into tmp for this test
    (tmp_path / "base_identity.md").write_text("IDENTITY_MARKER", encoding="utf-8")
    (tmp_path / "tool_use_enforcement.md").write_text("ENFORCEMENT_MARKER", encoding="utf-8")
    (tmp_path / "model_hints").mkdir()
    (tmp_path / "model_hints" / "openai.md").write_text("OPENAI_HINT_MARKER", encoding="utf-8")

    pb = PromptBuilder(prompts_root=tmp_path)
    out = pb.build_minimal(
        surface_prompt_path="surfaces/order.md",
        model_provider="openai",
        model_name="gpt-4o",
    )
    i_ident = out.index("IDENTITY_MARKER")
    i_enforce = out.index("ENFORCEMENT_MARKER")
    i_hint = out.index("OPENAI_HINT_MARKER")
    i_surface = out.index("SURFACE_MARKER")
    assert i_ident < i_enforce < i_hint < i_surface
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/agent && python -m pytest tests/test_prompt_builder.py -v
```

Expected: `ModuleNotFoundError: No module named 'hermes.prompt_builder'`.

- [ ] **Step 3: Implement `PromptBuilder.build_minimal`**

Create `apps/agent/hermes/prompt_builder.py`:

```python
"""Layered system-prompt assembly for the Hermes harness.

Layer order (per spec §5.2):

    1. base_identity.md                          (SparkFlow SOUL)
    2. tool_use_enforcement.md                   (model-family filtered)
    3. model_hints/{provider}.md                 (if present)
    4. extra_caller_system                       (runtime injection)
    5. memory usage guide + MEMORY snapshot      (P3 — no-op in P1)
    6. skills index                              (P3 — no-op in P1)
    7. surfaces/{surface}.md                     (SurfaceConfig.surface_prompt_path)
    8. context_refs[*].render()                  (wiki / sources / page / web)
    9. session metadata                          (timestamp, model, session_id, surface)

``build_minimal`` runs only layers 1-3 and 7 — used by workflows that need
no memory, skills, or context refs.

``build`` runs all layers and caches the result as
``_cached_system_prompts[session_id]`` so subsequent turns in the same
session reuse the same prefix (LLM prefix-cache friendly). The cache is
invalidated when ``mark_compressed(session_id)`` is called.
"""

from __future__ import annotations

from pathlib import Path


_OPENAI_HINT_FAMILIES = {"openai", "gpt", "codex", "deepseek"}  # OpenAI-style SDK usage
_GOOGLE_HINT_FAMILIES = {"google", "gemini"}


class PromptBuilder:
    """Builds system prompts by concatenating markdown fragments."""

    def __init__(self, prompts_root: Path | None = None) -> None:
        if prompts_root is None:
            # apps/agent/hermes/prompt_builder.py → apps/agent/prompts/
            prompts_root = Path(__file__).resolve().parent.parent / "prompts"
        self.prompts_root = Path(prompts_root)

    # ---- public API --------------------------------------------------

    def build_minimal(
        self,
        *,
        surface_prompt_path: str,
        model_provider: str,
        model_name: str,  # reserved for future model-specific tuning
    ) -> str:
        """Layers 1, 2, 3, 7 only. For workflows and one-shot LLM calls."""

        parts: list[str] = []
        parts.append(self._read("base_identity.md"))
        parts.append(self._read("tool_use_enforcement.md"))
        hint = self._model_hint(model_provider)
        if hint:
            parts.append(hint)
        parts.append(self._read(surface_prompt_path))
        return "\n\n".join(p for p in parts if p)

    # ---- private helpers ---------------------------------------------

    def _read(self, relpath: str) -> str:
        path = self.prompts_root / relpath
        if not path.exists():
            raise FileNotFoundError(f"Prompt fragment not found: {path}")
        return path.read_text(encoding="utf-8").strip()

    def _model_hint(self, provider: str) -> str:
        """Return the markdown for a model-family hint, or empty string."""

        key = provider.lower().strip()
        if key in _OPENAI_HINT_FAMILIES:
            hint_path = self.prompts_root / "model_hints" / "openai.md"
        elif key in _GOOGLE_HINT_FAMILIES:
            hint_path = self.prompts_root / "model_hints" / "gemini.md"
        else:
            return ""
        if not hint_path.exists():
            return ""
        return hint_path.read_text(encoding="utf-8").strip()
```

Also, the test `test_build_minimal_includes_surface_prompt` expects the builder to resolve `surface_prompt_path` relative to a `prompts_root` parameter. The implementation above does that.

Two tests (`test_build_minimal_includes_base_identity`, `test_build_minimal_includes_tool_use_enforcement`, the two model-family tests, and the unknown-provider test) use the REAL `apps/agent/prompts/` directory (via default `prompts_root`). They will pass because Task 7 created those files.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/agent && python -m pytest tests/test_prompt_builder.py -v
```

Expected: 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/hermes/prompt_builder.py apps/agent/tests/test_prompt_builder.py
git commit -m "feat(agent): add PromptBuilder.build_minimal with layered assembly"
```

---

## Task 10: `PromptBuilder.build` (full shape with memory/skills as no-ops)

**Files:**
- Modify: `apps/agent/hermes/prompt_builder.py`
- Modify: `apps/agent/tests/test_prompt_builder.py`

- [ ] **Step 1: Write the failing tests**

Append to `apps/agent/tests/test_prompt_builder.py`:

```python
from dataclasses import dataclass

from hermes.context.references import WikiContentRef, PageContextRef


@dataclass
class _Ctx:
    notebook_id: str | None = None
    page_context: str | None = None


def test_build_full_includes_all_applicable_layers():
    pb = PromptBuilder()
    out = pb.build(
        surface_prompt_path="base_identity.md",   # any file that exists works for P1
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
        notebook_id="nb_1",
        context_refs=[WikiContentRef(_Ctx(notebook_id="nb_1"))],
    )
    assert "SparkFlow" in out             # layer 1
    assert "Tool-use enforcement" in out  # layer 2
    assert "<tool_persistence>" in out    # layer 3 (openai)
    assert "Wiki Knowledge Base" in out   # layer 8 (context ref)
    assert "Session Metadata" in out      # layer 9
    assert "s_1" in out                   # session id in metadata


def test_build_skips_memory_and_skills_in_p1():
    """Memory and Skills layers are no-op placeholders in P1."""
    pb = PromptBuilder()
    out = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
    )
    # These sections should not appear because their providers return "".
    assert "## Memory" not in out
    assert "## Skills" not in out


def test_build_injects_extra_caller_system():
    pb = PromptBuilder()
    out = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
        extra_caller_system="Do not mention banana.",
    )
    assert "Do not mention banana." in out


def test_build_context_refs_in_order():
    pb = PromptBuilder()
    out = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
        context_refs=[
            WikiContentRef(_Ctx(notebook_id="nb_1")),
            PageContextRef(_Ctx(page_context="/explore")),
        ],
    )
    i_wiki = out.index("Wiki Knowledge Base")
    i_page = out.index("Current page context")
    assert i_wiki < i_page


def test_build_caches_per_session():
    pb = PromptBuilder()
    out1 = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="cache_sess",
    )
    # Change a field that would normally rebuild: the cache should still hit.
    out2 = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_2",            # different — but cache is keyed by session_id
        session_id="cache_sess",
    )
    assert out1 == out2


def test_build_cache_separate_sessions():
    pb = PromptBuilder()
    out1 = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="sess_a",
    )
    out2 = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="sess_b",
    )
    # Different session_id → different cache entries, but since everything else
    # is identical the metadata timestamp differs. Check via the session id tag:
    assert "sess_a" in out1 and "sess_b" in out2


def test_build_mark_compressed_invalidates_cache():
    pb = PromptBuilder()
    pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_evict",
    )
    assert "s_evict" in pb._cached_system_prompts
    pb.mark_compressed("s_evict")
    assert "s_evict" not in pb._cached_system_prompts
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/agent && python -m pytest tests/test_prompt_builder.py -v
```

Expected: 7 new tests fail with `AttributeError: 'PromptBuilder' object has no attribute 'build'` (or `mark_compressed`).

- [ ] **Step 3: Implement `build` + caching + no-op memory/skills hooks**

Update `apps/agent/hermes/prompt_builder.py`:

Add imports at the top:

```python
from datetime import datetime, timezone
```

Add after `__init__`:

```python
        self._cached_system_prompts: dict[str, str] = {}
```

Replace the class with the full version (keeping `build_minimal` and `_read` / `_model_hint` exactly as-is, adding `build` / `mark_compressed` / no-op hooks):

```python
    # ---- public API --------------------------------------------------

    def build(
        self,
        *,
        surface_prompt_path: str,
        model_provider: str,
        model_name: str,
        user_id: str,
        session_id: str,
        notebook_id: str | None = None,
        context_refs: list = (),
        skip_memory: bool = False,
        skip_skills: bool = False,
        extra_caller_system: str | None = None,
    ) -> str:
        """Full 9-layer system prompt. Cached per ``session_id``."""

        cached = self._cached_system_prompts.get(session_id)
        if cached is not None:
            return cached

        parts: list[str] = []
        parts.append(self._read("base_identity.md"))                           # 1
        parts.append(self._read("tool_use_enforcement.md"))                    # 2
        hint = self._model_hint(model_provider)                                # 3
        if hint:
            parts.append(hint)
        if extra_caller_system:                                                # 4
            parts.append(extra_caller_system.strip())
        if not skip_memory:                                                    # 5
            mem = self._memory_snippet(user_id=user_id, notebook_id=notebook_id)
            if mem:
                parts.append(mem)
        if not skip_skills:                                                    # 6
            skills = self._skills_snippet(surface_path=surface_prompt_path)
            if skills:
                parts.append(skills)
        parts.append(self._read(surface_prompt_path))                          # 7
        for ref in context_refs:                                               # 8
            rendered = ref.render()
            if rendered:
                parts.append(rendered.strip())
        parts.append(self._session_metadata(                                   # 9
            session_id=session_id,
            model_provider=model_provider,
            model_name=model_name,
            surface_prompt_path=surface_prompt_path,
        ))

        out = "\n\n".join(p for p in parts if p)
        self._cached_system_prompts[session_id] = out
        return out

    def mark_compressed(self, session_id: str) -> None:
        """Invalidate the cache for ``session_id``. Call this after context
        compression rewrites the message history (so the next turn rebuilds
        the system prompt with fresh memory/skills snapshots).
        """

        self._cached_system_prompts.pop(session_id, None)

    # ---- P1 no-op hooks (filled in P3) ------------------------------

    def _memory_snippet(self, *, user_id: str, notebook_id: str | None) -> str:
        """P1: return empty. P3 loads UserMemory + NotebookMemory from Prisma
        and renders as a ``## Memory`` section, plus a usage guide."""

        return ""

    def _skills_snippet(self, *, surface_path: str) -> str:
        """P1: return empty. P3 scans ``~/.sparkflow/skills/*.md`` and renders
        the index as a ``## Skills`` section with progressive disclosure."""

        return ""

    def _session_metadata(
        self,
        *,
        session_id: str,
        model_provider: str,
        model_name: str,
        surface_prompt_path: str,
    ) -> str:
        return (
            "## Session Metadata\n\n"
            f"- session_id: `{session_id}`\n"
            f"- surface: `{surface_prompt_path}`\n"
            f"- model: `{model_provider}/{model_name}`\n"
            f"- timestamp: `{datetime.now(timezone.utc).isoformat()}`"
        )
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/agent && python -m pytest tests/test_prompt_builder.py -v
```

Expected: all 15 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/hermes/prompt_builder.py apps/agent/tests/test_prompt_builder.py
git commit -m "feat(agent): add PromptBuilder.build with per-session cache and P3 hooks"
```

---

## Task 11: End-to-end harness smoke test

**Files:**
- Create: `apps/agent/tests/test_smoke.py`

- [ ] **Step 1: Write the integration test**

Create `apps/agent/tests/test_smoke.py`:

```python
"""End-to-end smoke test: discovery + registry + prompt builder.

Verifies that the full P1 harness plumbing works in one shot. After P1
lands, this is the canary that breaks if any task's public surface drifts.
"""

from hermes.prompt_builder import PromptBuilder
from hermes.registry import discover_builtin_tools, registry


def test_p1_harness_end_to_end():
    # 1. Discover and register all tools in apps/agent/tools/
    imported = discover_builtin_tools()
    assert any(m.endswith("._echo") for m in imported)

    # 2. The echo tool is queryable from the registry via toolset filter
    tools = registry.get_tools(toolset={"_test"})
    assert len(tools) == 1
    assert tools[0].name == "echo"

    # 3. Invoking the tool round-trips
    assert tools[0].invoke({"text": "hi"}) == "hi"

    # 4. PromptBuilder assembles a full system prompt without crashing
    pb = PromptBuilder()
    prompt = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="smoke_user",
        session_id="smoke_session",
    )
    assert "SparkFlow" in prompt
    assert "<tool_persistence>" in prompt
    assert "Session Metadata" in prompt
    assert "smoke_session" in prompt

    # 5. Cache hits on second call
    prompt2 = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="smoke_user",
        session_id="smoke_session",
    )
    assert prompt is prompt2 or prompt == prompt2
```

- [ ] **Step 2: Run the smoke test**

```bash
cd apps/agent && python -m pytest tests/test_smoke.py -v
```

Expected: 1 test passes.

- [ ] **Step 3: Run the full test suite**

```bash
cd apps/agent && python -m pytest -v
```

Expected: all tests from Tasks 1-11 pass. Count: roughly 30 tests. No failures, no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/tests/test_smoke.py
git commit -m "test(agent): add P1 harness end-to-end smoke test"
```

---

## Task 12: Verification + CI plumbing

**Files:**
- Modify: `apps/agent/README.md`

- [ ] **Step 1: Verify that existing graphs still import and run**

This is the critical "do no harm" check. P1 must not break the currently-running LangGraph graphs. Run:

```bash
cd apps/agent && python -c "import graphs.rag_agent; import graphs.hub_agent; import graphs.search_agent; print('OK')"
```

Expected: `OK` on stdout, no exceptions. If any graph module import fails, P1 has introduced a regression — find it before commit.

- [ ] **Step 2: Verify `langgraph dev` still starts (manual/smoke)**

```bash
cd apps/agent && timeout 10 langgraph dev --host 0.0.0.0 --port 2024 || echo 'exited as expected'
```

Expected: server reaches "Server started" or times out at 10s. P1 should not have touched `langgraph.json` — this proves it.

- [ ] **Step 3: Update `apps/agent/README.md`**

Read the current README first:

```bash
cat apps/agent/README.md
```

Append a new section at the end (don't replace existing content):

```markdown
## Hermes Harness (P1)

`apps/agent/hermes/` is the shared primitives layer used by all agent
surfaces and workflows (see `docs/superpowers/specs/2026-04-22-hermes-harness-design.md`).

- `registry.py` — central tool registry + AST-based auto-discovery.
- `prompt_builder.py` — 9-layer system prompt assembly with per-session cache.
- `context/references.py` — context-ref injectors (wiki / sources / page / web).

### Running tests

```bash
cd apps/agent
pip install -e '.[dev]'       # first time only
python -m pytest -v
```

### Current status

- P1 (2026-04-22): primitives skeleton — this commit. No surfaces refactored yet.
- P2: notebook + hub surfaces on shared harness. Coming after P1 lands.
- P3: memory + skills.
- P4: search workflow + deep-research surface.
- P5: matcher workflow out of apps/semops.
- P6: digest orchestrator from Node to Python.
```

- [ ] **Step 4: Commit**

```bash
git add apps/agent/README.md
git commit -m "docs(agent): document P1 harness primitives in README"
```

---

## Self-review checklist (run before PR)

- [ ] Every task ends with a commit. `git log --oneline refactor/hermes-agent ^<base>` shows ~12 new commits.
- [ ] `cd apps/agent && python -m pytest -v` — ALL tests pass, ≥30 tests collected.
- [ ] `cd apps/agent && python -c "import graphs.rag_agent; import graphs.hub_agent; import graphs.search_agent"` — no errors.
- [ ] `cd apps/agent && timeout 10 langgraph dev --host 0.0.0.0 --port 2024` — server boots cleanly (manually verified).
- [ ] `apps/agent/hermes/` exists with `registry.py`, `prompt_builder.py`, `context/references.py`.
- [ ] `apps/agent/tools/_echo.py` exists and is picked up by `discover_builtin_tools()`.
- [ ] `apps/agent/prompts/{base_identity,tool_use_enforcement}.md` exist.
- [ ] `apps/agent/prompts/model_hints/{openai,gemini}.md` exist.
- [ ] No changes to `graphs/`, `prompts/{rag_agent,hub_agent,search_agent}.py`, `config/`, `langgraph.json`.
- [ ] `apps/agent/pyproject.toml` includes `hermes` in packages and `pytest` in dev deps.
- [ ] No placeholder text (`TODO`, `TBD`, `FIXME`) left in any committed file. Run:
      ```bash
      grep -rnE "TODO|TBD|FIXME|XXX" apps/agent/hermes/ apps/agent/tests/ apps/agent/tools/_echo.py apps/agent/prompts/
      ```
      Expected: no output (or only intentional P3-deferral mentions in prompt_builder docstrings).

## What's NOT done after P1

(Explicit so P2 planner knows the starting state.)

- No tool from `wiki_tools.py` / `hub_*_tools.py` / `search_tools.py` is registered into `hermes.registry` yet — they still exist as LangChain tools imported by the three legacy graphs.
- No surface (`notebook` / `hub` / `deep_research`) exists yet.
- No parameterized `graphs/surface.py`.
- `PromptBuilder._memory_snippet()` and `_skills_snippet()` return empty strings.
- No Prisma migration, no `UserMemory` / `NotebookMemory` tables.
- No new HTTP endpoints; `langgraph dev` still serves the three legacy graphs exclusively.
- No frontend changes.

P1 is a pure, additive, dormant library checkpoint. It proves the primitives work in isolation; P2 wires them into production.
