# Hermes Harness — P2 (Notebook + Hub Surfaces on Shared Harness) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the two LangGraph agent graphs (`graphs/rag_agent.py` + `graphs/hub_agent.py`) into a single parameterized graph (`graphs/surface.py`) driven by `SurfaceConfig`. Wire all existing tools into the hermes `ToolRegistry`. Introduce real `notebook` and `hub` graph names in `langgraph.json` alongside the existing `agent`/`hub` entries, and flip the frontend to the new names. Old graph modules are kept for one release as rollback.

**Architecture:** The hermes harness is already in place (P1). P2 wires it into production:

- `tools/*.py` gain module-level `registry.register(...)` calls so `discover_builtin_tools()` picks them up.
- `config/surfaces.py` defines `SurfaceConfig` (name, surface_prompt_path, toolset, context_refs, memory_scope, max_iterations).
- `surfaces/{notebook,hub}.py` instantiate `NOTEBOOK` / `HUB` configs.
- `graphs/common.py` provides `make_llm_call(config)` and `make_tool_node(config)` factories.
- `graphs/surface.py` exposes `notebook_graph` and `hub_graph` compiled StateGraphs, built from their configs.
- `langgraph.json` registers `notebook` and `hub` graphs. The original `agent` and `hub` entries stay (old `hub` overwritten by the new impl since it's the same name; old `agent` points to `rag_agent.py` unchanged until P2 Task 13 flips it).
- Frontend `chat-panel.tsx` switches from `assistantId: "agent"` → `assistantId: "notebook"`.

**Tech Stack:** Python 3.12 (apps/agent venv), LangGraph, LangChain, hermes primitives from P1. Frontend: Next.js 16, TypeScript, `@langchain/langgraph-sdk`.

**Spec:** `docs/superpowers/specs/2026-04-22-hermes-harness-design.md` §4.3, §5, §6, §10 (P2 row).
**Preceding plan:** `docs/superpowers/plans/2026-04-22-hermes-harness-p1.md` (landed as PR #68).

---

## Scope boundaries

**IN scope for P2:**
- `apps/agent/config/surfaces.py` (new) — `SurfaceConfig` dataclass
- `apps/agent/surfaces/__init__.py` (new, empty)
- `apps/agent/surfaces/notebook.py` (new) — `NOTEBOOK` instance
- `apps/agent/surfaces/hub.py` (new) — `HUB` instance
- `apps/agent/graphs/common.py` (new) — `make_llm_call`, `make_tool_node`, `SurfaceRuntimeContext`
- `apps/agent/graphs/surface.py` (new) — `build_graph`, module-level `notebook_graph`, `hub_graph`
- `apps/agent/prompts/surfaces/notebook.md` (new, extracted from `prompts/rag_agent.py`)
- `apps/agent/prompts/surfaces/hub.md` (new, extracted from `prompts/hub_agent.py`)
- `apps/agent/tools/wiki_tools.py` (MOD) — add `registry.register(...)` for each tool; remove `set_notebook_id` global; read notebook_id from a `ToolContext` or passed-in argument
- `apps/agent/tools/hub_toolbox.py` (MOD) — registry.register each tool
- `apps/agent/tools/hub_wechat_tools.py` (MOD) — registry.register each tool
- `apps/agent/tools/hub_nav_tools.py` (MOD) — registry.register each tool
- `apps/agent/tools/hub_ui_tools.py` (MOD) — registry.register with `frontend=True`
- `apps/agent/langgraph.json` (MOD) — add `notebook` and update `hub` entries
- `apps/agent/tests/test_surfaces.py`, `tests/test_graphs_common.py`, `tests/test_graphs_surface.py` (new test files)
- `apps/web/components/deepdive/chat/chat-panel.tsx` (MOD, Task 13) — `assistantId: "agent"` → `"notebook"`

**OUT of scope for P2** (deferred):
- `deep_research` surface (→ P4)
- Memory + Skills (→ P3)
- `search` workflow (→ P4)
- `matcher` workflow (→ P5)
- `daily_digest` workflow (→ P6)
- Deletion of `graphs/rag_agent.py`, `graphs/hub_agent.py`, `prompts/{rag_agent,hub_agent}.py`, `config/{rag_agent,hub_agent}.py` (do in a later cleanup PR once parity confirmed in production)
- Any BYOK refactor — continue using existing `runtime.context.model_provider/name` and `api-key-resolver.ts` pathway
- Docker / deploy config changes

**Rollback:** Every task ends with a commit. P2 is additive-then-flip: Tasks 1-12 are pure adds (old graphs unaffected). Task 13 (frontend flip) is the single user-visible change; revert that commit alone to roll back. Task 14 (verification) is the last gate before push.

---

## Task 1: `SurfaceConfig` dataclass

**Files:**
- Create: `apps/agent/config/surfaces.py`
- Create: `apps/agent/tests/test_surfaces.py`

- [ ] **Step 1: Write the failing test**

Create `apps/agent/tests/test_surfaces.py`:

```python
"""Tests for config.surfaces.SurfaceConfig."""

from config.surfaces import SurfaceConfig


def test_surface_config_minimal():
    cfg = SurfaceConfig(
        name="notebook",
        surface_prompt_path="surfaces/notebook.md",
        toolset={"wiki"},
    )
    assert cfg.name == "notebook"
    assert cfg.surface_prompt_path == "surfaces/notebook.md"
    assert cfg.toolset == {"wiki"}
    assert cfg.context_refs == ()
    assert cfg.memory_scope == ()
    assert cfg.max_iterations == 30


def test_surface_config_full():
    from hermes.context.references import WikiContentRef, PageContextRef

    cfg = SurfaceConfig(
        name="notebook",
        surface_prompt_path="surfaces/notebook.md",
        toolset={"wiki", "memory"},
        context_refs=(WikiContentRef, PageContextRef),
        memory_scope=("user", "notebook"),
        max_iterations=50,
    )
    assert cfg.context_refs == (WikiContentRef, PageContextRef)
    assert cfg.memory_scope == ("user", "notebook")
    assert cfg.max_iterations == 50


def test_surface_config_is_frozen():
    """SurfaceConfig instances should be immutable so downstream callers
    can't accidentally mutate shared module-level configs."""
    import pytest

    cfg = SurfaceConfig(
        name="x",
        surface_prompt_path="y",
        toolset={"z"},
    )
    with pytest.raises((AttributeError, TypeError)):
        cfg.name = "mutated"  # type: ignore[misc]
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_surfaces.py -v 2>&1 | tail -5
```

Expected: `ModuleNotFoundError: No module named 'config.surfaces'`.

- [ ] **Step 3: Implement**

Create `apps/agent/config/surfaces.py`:

```python
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
```

- [ ] **Step 4: Run to verify pass**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_surfaces.py -v 2>&1 | tail -10
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/config/surfaces.py apps/agent/tests/test_surfaces.py
git commit -m "feat(agent): add SurfaceConfig dataclass"
```

---

## Task 2: `SurfaceRuntimeContext` + `graphs/common.py` factories

**Files:**
- Create: `apps/agent/graphs/common.py`
- Create: `apps/agent/tests/test_graphs_common.py`

This task adds the `llm_call` and `tool_node` factories that `graphs/surface.py` uses. Each factory returns an async function bound to a specific `SurfaceConfig`.

- [ ] **Step 1: Write the failing test**

Create `apps/agent/tests/test_graphs_common.py`:

```python
"""Tests for graphs.common factories."""

from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from config.surfaces import SurfaceConfig
from graphs.common import SurfaceRuntimeContext, make_llm_call, make_tool_node


@dataclass
class _FakeRuntime:
    context: SurfaceRuntimeContext


def _runtime(**overrides) -> _FakeRuntime:
    defaults = dict(
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
        notebook_id=None,
        page_context=None,
        api_key=None,
        extra_caller_system=None,
    )
    defaults.update(overrides)
    return _FakeRuntime(context=SurfaceRuntimeContext(**defaults))


def test_surface_runtime_context_defaults():
    ctx = SurfaceRuntimeContext(
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
    )
    assert ctx.notebook_id is None
    assert ctx.page_context is None
    assert ctx.api_key is None
    assert ctx.extra_caller_system is None


@pytest.mark.asyncio
async def test_make_llm_call_assembles_prompt_and_invokes_model():
    cfg = SurfaceConfig(
        name="notebook",
        surface_prompt_path="surfaces/notebook.md",
        toolset={"wiki"},
    )

    fake_response = MagicMock()
    fake_response.tool_calls = []
    bound_model = AsyncMock()
    bound_model.ainvoke = AsyncMock(return_value=fake_response)

    model = MagicMock()
    model.bind_tools = MagicMock(return_value=bound_model)

    # Patch init_chat_model and PromptBuilder to avoid real API + file I/O
    with patch("graphs.common.init_chat_model", return_value=model), patch(
        "graphs.common.PromptBuilder"
    ) as PB, patch(
        "graphs.common.registry.get_tools", return_value=["fake_tool"]
    ):
        PB.return_value.build = MagicMock(return_value="SYSTEM_PROMPT")
        llm_call = make_llm_call(cfg)
        result = await llm_call({"messages": []}, _runtime())

    assert result == {"messages": [fake_response]}
    bound_model.ainvoke.assert_awaited_once()
    # First positional arg is the messages list; first message is the system prompt
    call_args = bound_model.ainvoke.await_args.args[0]
    assert call_args[0].content == "SYSTEM_PROMPT"


@pytest.mark.asyncio
async def test_make_tool_node_invokes_registered_tools_and_formats_results():
    from hermes.registry import ToolRegistry
    from langchain_core.messages import AIMessage

    reg = ToolRegistry()
    fake_tool = MagicMock()
    fake_tool.name = "echo"
    fake_tool.ainvoke = AsyncMock(return_value="hi")
    reg.register(name="echo", toolset="t", tool=fake_tool)

    cfg = SurfaceConfig(
        name="x",
        surface_prompt_path="surfaces/notebook.md",
        toolset={"t"},
    )

    tool_msg = AIMessage(
        content="",
        tool_calls=[
            {"name": "echo", "args": {"text": "hi"}, "id": "call_1", "type": "tool_call"}
        ],
    )
    with patch("graphs.common.registry", reg):
        tool_node = make_tool_node(cfg)
        result = await tool_node({"messages": [tool_msg]})

    assert len(result["messages"]) == 1
    assert result["messages"][0].content == "hi"
    assert result["messages"][0].tool_call_id == "call_1"


@pytest.mark.asyncio
async def test_make_tool_node_skips_frontend_tools():
    """Frontend tools must not be executed server-side."""
    from hermes.registry import ToolRegistry
    from langchain_core.messages import AIMessage

    reg = ToolRegistry()
    ui_tool = MagicMock()
    ui_tool.name = "show_table"
    reg.register(name="show_table", toolset="ui", tool=ui_tool, frontend=True)

    cfg = SurfaceConfig(name="x", surface_prompt_path="surfaces/hub.md", toolset={"ui"})

    msg = AIMessage(
        content="",
        tool_calls=[
            {"name": "show_table", "args": {}, "id": "c1", "type": "tool_call"}
        ],
    )
    with patch("graphs.common.registry", reg):
        tool_node = make_tool_node(cfg)
        result = await tool_node({"messages": [msg]})

    # Frontend tool should NOT be invoked; returns empty/ack message path.
    ui_tool.ainvoke.assert_not_called() if hasattr(ui_tool, "ainvoke") else None
    # The node must still return a list (never crash), but with no tool messages for UI calls.
    assert result == {"messages": []}
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_graphs_common.py -v 2>&1 | tail -10
```

Expected: `ModuleNotFoundError: No module named 'graphs.common'`.

- [ ] **Step 3: Implement**

Create `apps/agent/graphs/common.py`:

```python
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
```

- [ ] **Step 4: Run to verify pass**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_graphs_common.py -v 2>&1 | tail -15
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/graphs/common.py apps/agent/tests/test_graphs_common.py
git commit -m "feat(agent): add SurfaceRuntimeContext + graphs/common factories"
```

---

## Task 3: `graphs/surface.py` — `build_graph`

**Files:**
- Create: `apps/agent/graphs/surface.py`
- Create: `apps/agent/tests/test_graphs_surface.py`

- [ ] **Step 1: Write the failing test**

Create `apps/agent/tests/test_graphs_surface.py`:

```python
"""Tests for graphs.surface.build_graph."""

from config.surfaces import SurfaceConfig
from graphs.surface import build_graph


def test_build_graph_returns_compiled_state_graph():
    cfg = SurfaceConfig(
        name="test_surface",
        surface_prompt_path="surfaces/notebook.md",  # any existing file works
        toolset={"_test"},
    )
    graph = build_graph(cfg)
    # Compiled graphs expose get_graph() and ainvoke / astream
    assert hasattr(graph, "ainvoke")
    assert hasattr(graph, "astream")


def test_build_graph_distinct_configs_produce_distinct_instances():
    a = build_graph(SurfaceConfig(name="a", surface_prompt_path="surfaces/notebook.md", toolset={"x"}))
    b = build_graph(SurfaceConfig(name="b", surface_prompt_path="surfaces/hub.md", toolset={"y"}))
    assert a is not b
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_graphs_surface.py -v 2>&1 | tail -5
```

Expected: `ModuleNotFoundError: No module named 'graphs.surface'`.

- [ ] **Step 3: Implement**

Note: the test uses `surfaces/notebook.md` and `surfaces/hub.md` — those get created in Tasks 7 & 8. For Task 3's test isolation, we use `base_identity.md` which already exists.

Actually, adjust the test to use a prompt that exists *today*:

Update `apps/agent/tests/test_graphs_surface.py` — replace `surfaces/notebook.md` with `base_identity.md` (and `surfaces/hub.md` with `tool_use_enforcement.md`). Re-run to confirm it's still compile-only (no prompt read).

Actually even simpler: `build_graph` should not read the prompt file at graph-construction time. It only compiles. The prompt is read inside `llm_call` at request time. So the path string doesn't need to exist at build time. Tests pass as written.

Create `apps/agent/graphs/surface.py`:

```python
"""Parameterized surface graph.

One function, ``build_graph(config)``, produces a compiled LangGraph
``StateGraph`` wired with ``make_llm_call(config)`` and
``make_tool_node(config)``. Module-level ``notebook_graph`` / ``hub_graph``
instances are exported for ``langgraph.json`` to reference.
"""

from __future__ import annotations

from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.checkpoint.postgres import PostgresSaver

from config.surfaces import SurfaceConfig
from graphs.common import make_llm_call, make_tool_node


def _should_continue(state: MessagesState) -> str:
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    return "tools" if tool_calls else END


def build_graph(config: SurfaceConfig):
    """Return a compiled StateGraph for ``config``.

    The caller is responsible for attaching a checkpointer (LangGraph's
    deploy/dev runtime supplies one automatically when the graph is served
    via ``langgraph.json``).
    """

    graph = StateGraph(MessagesState)
    graph.add_node("llm_call", make_llm_call(config))
    graph.add_node("tools", make_tool_node(config))
    graph.add_edge(START, "llm_call")
    graph.add_conditional_edges(
        "llm_call", _should_continue, {"tools": "tools", END: END}
    )
    graph.add_edge("tools", "llm_call")
    return graph.compile()


# Module-level graphs registered in langgraph.json (populated by Tasks 9-11)
# Placeholders imported from surfaces.* once those modules land.
```

- [ ] **Step 4: Run to verify pass**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_graphs_surface.py -v 2>&1 | tail -5
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/graphs/surface.py apps/agent/tests/test_graphs_surface.py
git commit -m "feat(agent): add parameterized graphs/surface.build_graph"
```

---

## Task 4: Register wiki tools + drop `set_notebook_id` global

**Files:**
- Modify: `apps/agent/tools/wiki_tools.py`

**Strategy:** Instead of the module-level `_current_notebook_id` global, each tool takes `notebook_id` as an argument. The LLM is required to pass it explicitly. The surface injects the current `notebook_id` into the tool's schema via a context-aware wrapper — or, simpler: we wrap each tool at registration time so the handler reads `notebook_id` from a thread-local context.

For P2 simplicity, we use **explicit passing**: the tool signature gains `notebook_id: str` as a required argument. The LLM sees `notebook_id` in every wiki tool's schema and is instructed to use the current notebook's id (available from system prompt / session metadata).

This is a behavior change — the LLM must learn to pass `notebook_id`. Update the surface prompt (Task 7) to make this explicit.

- [ ] **Step 1: Read current `tools/wiki_tools.py`**

```bash
cat apps/agent/tools/wiki_tools.py
```

Identify: the exported `wiki_tools` list and each `@tool`-decorated function.

- [ ] **Step 2: Rewrite each tool to accept `notebook_id` explicitly**

Update `apps/agent/tools/wiki_tools.py`:

1. Remove the `_current_notebook_id` global and `set_notebook_id` function.
2. Add `notebook_id: str` as a required arg on each `@tool` function (e.g., `source_read`, and any wiki search / navigation tools).
3. At the bottom of the file, add:

```python
from hermes.registry import registry

for _tool in (source_read, source_list, wiki_search, wiki_navigate):  # use the actual names
    registry.register(
        name=_tool.name,
        toolset="wiki",
        tool=_tool,
        description=_tool.description if hasattr(_tool, "description") else "",
    )
```

Adjust the list to match actual tool names. Each tool's existing `@tool` definition is kept — we only remove the `notebook_id` global and add `notebook_id: str` parameter.

- [ ] **Step 3: Update `graphs/rag_agent.py` to stop calling `set_notebook_id`**

Old graph code must keep working. The import `from tools.wiki_tools import ..., set_notebook_id` will fail after Task 4. Handle by:

- Option A: leave `set_notebook_id` as a no-op stub in `wiki_tools.py` (backward compatibility).
- Option B: edit `graphs/rag_agent.py` to remove the `set_notebook_id(notebook_id)` call.

Pick **Option A** (no-op stub) for safer migration. Add at end of `wiki_tools.py`:

```python
def set_notebook_id(notebook_id: str) -> None:
    """Deprecated no-op. The notebook_id is now passed explicitly to each
    wiki tool invocation. Retained to avoid breaking ``graphs/rag_agent.py``
    until it is deleted in the P2 cleanup phase.
    """
```

- [ ] **Step 4: Verify the old graph still imports**

```bash
cd apps/agent && .venv/bin/python -c "import graphs.rag_agent; print('rag_agent OK')"
```

Expected: `rag_agent OK`.

- [ ] **Step 5: Verify registry picks up the new tools**

```bash
cd apps/agent && .venv/bin/python -c "
from hermes.registry import discover_builtin_tools, registry
discover_builtin_tools()
tools = registry.get_tools(toolset={'wiki'})
print(f'Found {len(tools)} wiki tools:', sorted(t.name for t in tools))
"
```

Expected: lists each wiki tool name.

- [ ] **Step 6: Full test suite stays green**

```bash
cd apps/agent && .venv/bin/python -m pytest -q 2>&1 | tail -3
```

Expected: all tests pass (P1's 46 + any new from P2 tasks landed before this).

- [ ] **Step 7: Commit**

```bash
git add apps/agent/tools/wiki_tools.py
git commit -m "feat(agent): register wiki tools + deprecate set_notebook_id global"
```

---

## Task 5: Register hub backend tools (`hub_toolbox`, `hub_wechat_tools`, `hub_nav_tools`)

**Files:**
- Modify: `apps/agent/tools/hub_toolbox.py`
- Modify: `apps/agent/tools/hub_wechat_tools.py`
- Modify: `apps/agent/tools/hub_nav_tools.py`

- [ ] **Step 1: Read the current modules**

```bash
head -30 apps/agent/tools/hub_toolbox.py
head -30 apps/agent/tools/hub_wechat_tools.py
head -30 apps/agent/tools/hub_nav_tools.py
```

Identify the exported tool list names in each (`HUB_TOOLBOX_TOOLS`, `HUB_WECHAT_TOOLS`, `HUB_NAV_TOOLS`).

- [ ] **Step 2: Register in `hub_toolbox.py`**

Append to the end of `apps/agent/tools/hub_toolbox.py`:

```python
from hermes.registry import registry

for _tool in HUB_TOOLBOX_TOOLS:
    registry.register(
        name=_tool.name,
        toolset="hub",
        tool=_tool,
        description=_tool.description if hasattr(_tool, "description") else "",
    )
```

- [ ] **Step 3: Register in `hub_wechat_tools.py`**

Append:

```python
from hermes.registry import registry

for _tool in HUB_WECHAT_TOOLS:
    registry.register(
        name=_tool.name,
        toolset="wechat",
        tool=_tool,
        description=_tool.description if hasattr(_tool, "description") else "",
    )
```

- [ ] **Step 4: Register in `hub_nav_tools.py`**

Append:

```python
from hermes.registry import registry

for _tool in HUB_NAV_TOOLS:
    registry.register(
        name=_tool.name,
        toolset="navigation",
        tool=_tool,
        description=_tool.description if hasattr(_tool, "description") else "",
    )
```

- [ ] **Step 5: Verify discovery**

```bash
cd apps/agent && .venv/bin/python -c "
from hermes.registry import discover_builtin_tools, registry
discover_builtin_tools()
for ts in ('hub', 'wechat', 'navigation'):
    tools = registry.get_tools(toolset={ts})
    print(f'{ts}: {len(tools)} tools')
"
```

Expected: nonzero counts for each toolset.

- [ ] **Step 6: Verify legacy `graphs/hub_agent.py` still imports**

```bash
cd apps/agent && .venv/bin/python -c "import graphs.hub_agent; print('OK')"
```

- [ ] **Step 7: Commit**

```bash
git add apps/agent/tools/hub_toolbox.py apps/agent/tools/hub_wechat_tools.py apps/agent/tools/hub_nav_tools.py
git commit -m "feat(agent): register hub backend tools (toolbox, wechat, nav) with hermes.registry"
```

---

## Task 6: Register hub UI tools with `frontend=True`

**Files:**
- Modify: `apps/agent/tools/hub_ui_tools.py`

- [ ] **Step 1: Read the file**

```bash
cat apps/agent/tools/hub_ui_tools.py
```

Identify the exported list (`HUB_UI_TOOLS`).

- [ ] **Step 2: Append registration**

```python
from hermes.registry import registry

for _tool in HUB_UI_TOOLS:
    registry.register(
        name=_tool.name,
        toolset="ui",
        tool=_tool,
        frontend=True,
        description=_tool.description if hasattr(_tool, "description") else "",
    )
```

- [ ] **Step 3: Verify frontend flag**

```bash
cd apps/agent && .venv/bin/python -c "
from hermes.registry import discover_builtin_tools, registry
discover_builtin_tools()
for t in registry.get_tools(toolset={'ui'}):
    entry = registry.get_entry(t.name)
    print(f'{t.name}: frontend={entry.frontend}')
"
```

Expected: every ui tool prints `frontend=True`.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/tools/hub_ui_tools.py
git commit -m "feat(agent): register hub UI tools with frontend=True passthrough"
```

---

## Task 7: Extract notebook surface prompt

**Files:**
- Create: `apps/agent/prompts/surfaces/notebook.md`

- [ ] **Step 1: Read the existing Python constant**

```bash
cat apps/agent/prompts/rag_agent.py
```

The file defines `RAG_AGENT_SYSTEM_PROMPT` as a string literal. Copy its content into a new Markdown file.

- [ ] **Step 2: Create the Markdown file**

Create `apps/agent/prompts/surfaces/notebook.md` with the exact text of `RAG_AGENT_SYSTEM_PROMPT`, plus an explicit note about `notebook_id`:

At the END of the copied prompt, append:

```markdown

## Tool arguments

When calling any ``wiki_*`` or ``source_*`` tool, always pass ``notebook_id``
using the current notebook id shown in the session metadata. Do not invent
or omit it.
```

(This is the instruction that replaces the old `set_notebook_id` global.)

- [ ] **Step 3: Spot-check**

```bash
head -20 apps/agent/prompts/surfaces/notebook.md
wc -l apps/agent/prompts/surfaces/notebook.md
```

Expected: the file has the full prompt + the new "Tool arguments" section at the end.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/prompts/surfaces/notebook.md
git commit -m "feat(agent): extract notebook surface prompt to markdown"
```

---

## Task 8: Extract hub surface prompt

**Files:**
- Create: `apps/agent/prompts/surfaces/hub.md`

- [ ] **Step 1: Read `prompts/hub_agent.py`**

```bash
cat apps/agent/prompts/hub_agent.py
```

- [ ] **Step 2: Create `apps/agent/prompts/surfaces/hub.md`**

Copy the full content of the `HUB_AGENT_SYSTEM_PROMPT` string literal (or whatever the exact export name is) into `apps/agent/prompts/surfaces/hub.md`. No extra modifications needed.

- [ ] **Step 3: Spot-check**

```bash
wc -l apps/agent/prompts/surfaces/hub.md
```

- [ ] **Step 4: Commit**

```bash
git add apps/agent/prompts/surfaces/hub.md
git commit -m "feat(agent): extract hub surface prompt to markdown"
```

---

## Task 9: `surfaces/notebook.py` + `surfaces/hub.py` + update `graphs/surface.py`

**Files:**
- Create: `apps/agent/surfaces/__init__.py` (empty)
- Create: `apps/agent/surfaces/notebook.py`
- Create: `apps/agent/surfaces/hub.py`
- Modify: `apps/agent/graphs/surface.py` (add `notebook_graph` and `hub_graph` exports)

- [ ] **Step 1: Create `apps/agent/surfaces/__init__.py`** (empty)

- [ ] **Step 2: Create `apps/agent/surfaces/notebook.py`**

```python
"""Notebook surface configuration."""

from config.surfaces import SurfaceConfig
from hermes.context.references import NotebookSourcesRef, WikiContentRef

NOTEBOOK = SurfaceConfig(
    name="notebook",
    surface_prompt_path="surfaces/notebook.md",
    toolset={"wiki"},
    context_refs=(WikiContentRef, NotebookSourcesRef),
    memory_scope=("user", "notebook"),
    max_iterations=30,
)
```

- [ ] **Step 3: Create `apps/agent/surfaces/hub.py`**

```python
"""Hub surface configuration."""

from config.surfaces import SurfaceConfig
from hermes.context.references import PageContextRef

HUB = SurfaceConfig(
    name="hub",
    surface_prompt_path="surfaces/hub.md",
    toolset={"hub", "wechat", "navigation", "ui"},
    context_refs=(PageContextRef,),
    memory_scope=("user",),
    max_iterations=20,
)
```

- [ ] **Step 4: Update `graphs/surface.py` to export the graphs**

Replace the placeholder comment at the bottom of `apps/agent/graphs/surface.py` with:

```python
from hermes.registry import discover_builtin_tools as _discover_builtin_tools
from surfaces.notebook import NOTEBOOK
from surfaces.hub import HUB


# Discover and register all tools at import time so the registry is populated
# before LangGraph constructs the graphs.
_discover_builtin_tools()

notebook_graph = build_graph(NOTEBOOK)
hub_graph = build_graph(HUB)
```

- [ ] **Step 5: Verify imports + discovery succeed**

```bash
cd apps/agent && .venv/bin/python -c "
from graphs.surface import notebook_graph, hub_graph
print(f'notebook_graph: {type(notebook_graph).__name__}')
print(f'hub_graph: {type(hub_graph).__name__}')
"
```

Expected: both print `CompiledStateGraph` or similar. No exceptions.

- [ ] **Step 6: Run full test suite**

```bash
cd apps/agent && .venv/bin/python -m pytest -q 2>&1 | tail -3
```

Expected: all tests still pass.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/surfaces/ apps/agent/graphs/surface.py
git commit -m "feat(agent): add notebook+hub SurfaceConfigs and compile graphs"
```

---

## Task 10: Register `notebook` and `hub` in `langgraph.json`

**Files:**
- Modify: `apps/agent/langgraph.json`

- [ ] **Step 1: Read current `langgraph.json`**

```bash
cat apps/agent/langgraph.json
```

Current content (from P1):
```json
{
    "dependencies": ["."],
    "graphs": {
        "agent": "./graphs/rag_agent.py:agent",
        "hub": "./graphs/hub_agent.py:agent",
        "search": "./graphs/search_agent.py:agent"
    },
    "env": ".env",
    "image_distro": "wolfi"
}
```

- [ ] **Step 2: Add new graph entries**

Modify to:

```json
{
    "dependencies": ["."],
    "graphs": {
        "agent": "./graphs/rag_agent.py:agent",
        "hub": "./graphs/surface.py:hub_graph",
        "search": "./graphs/search_agent.py:agent",
        "notebook": "./graphs/surface.py:notebook_graph"
    },
    "env": ".env",
    "image_distro": "wolfi"
}
```

Notes:
- The **`hub`** entry is re-pointed to the new `surface.py:hub_graph`. Frontend continues to use `assistantId: "hub"`. Old `graphs/hub_agent.py` stays on disk for rollback but is no longer referenced here.
- The **`notebook`** entry is NEW. Frontend will flip to it in Task 13.
- The old **`agent`** entry stays; Task 13 flips the frontend from `agent` to `notebook` and then we remove the `agent` entry in a later cleanup commit (not in P2).

- [ ] **Step 3: Verify `langgraph dev` boots**

```bash
cd apps/agent && timeout 15 .venv/bin/langgraph dev --host 127.0.0.1 --port 2024 2>&1 | head -30
```

Expected: "Ready" or "Server started" line appears. If compilation errors surface for `graphs/surface.py`, diagnose (usually a missing import or context_ref mis-typing).

Kill the server after verifying (timeout handles it).

- [ ] **Step 4: Commit**

```bash
git add apps/agent/langgraph.json
git commit -m "feat(agent): register notebook + hub graphs in langgraph.json"
```

---

## Task 11: End-to-end smoke curl against `notebook` and `hub` graphs

**Files:**
- none (manual verification + documented results)

- [ ] **Step 1: Start `langgraph dev` in a background shell**

```bash
cd apps/agent && .venv/bin/langgraph dev --host 127.0.0.1 --port 2024 &
LGPID=$!
sleep 5  # boot time
```

- [ ] **Step 2: Curl the notebook graph**

```bash
curl -sS -X POST http://127.0.0.1:2024/runs/stream \
    -H 'Content-Type: application/json' \
    -d '{
        "assistant_id": "notebook",
        "input": {"messages": [{"role": "user", "content": "say hi"}]},
        "stream_mode": ["values"],
        "config": {"configurable": {
            "user_id": "smoke",
            "session_id": "smoke_nb",
            "model_provider": "openai",
            "model_name": "gpt-4o-mini"
        }}
    }' | head -40
```

Expected: A streamed NDJSON response. At minimum an AIMessage comes back without an exception. 500s at the model layer (missing API key) are OK — we're only verifying the graph constructs and starts.

If the request errors with a harness issue (missing prompt, missing tool, context_ref crash), fix before proceeding.

- [ ] **Step 3: Curl the hub graph**

```bash
curl -sS -X POST http://127.0.0.1:2024/runs/stream \
    -H 'Content-Type: application/json' \
    -d '{
        "assistant_id": "hub",
        "input": {"messages": [{"role": "user", "content": "list conferences"}]},
        "stream_mode": ["values"],
        "config": {"configurable": {
            "user_id": "smoke",
            "session_id": "smoke_hub",
            "page_context": "/explore/conferences",
            "model_provider": "openai",
            "model_name": "gpt-4o-mini"
        }}
    }' | head -40
```

Expected: similar — no harness-level exceptions.

- [ ] **Step 4: Stop the dev server**

```bash
kill $LGPID 2>/dev/null
```

- [ ] **Step 5: No commit** — this task is verification only. Record results (pass/fail) for the P2 PR description.

---

## Task 12: Wire notebook & hub graphs with checkpointer-compatible init path

**Files:**
- Verify: `apps/agent/graphs/surface.py`

LangGraph's `langgraph dev` / `langgraph up` automatically applies a checkpointer. Our `build_graph` calls `graph.compile()` without an explicit checkpointer. Confirm this works in the deploy path and that `CHECKPOINT_DB_URL` from `.env` is honored.

- [ ] **Step 1: Inspect `graphs/rag_agent.py`'s final `.compile(...)` call**

```bash
grep -n "compile(" apps/agent/graphs/rag_agent.py apps/agent/graphs/hub_agent.py
```

If either calls `compile(checkpointer=...)`, mirror that pattern in `surface.py`. If they call bare `compile()`, we're already aligned.

- [ ] **Step 2: No code change** if patterns match. Otherwise minor edit + commit.

- [ ] **Step 3: (If edit made) Commit**

```bash
git add apps/agent/graphs/surface.py
git commit -m "fix(agent): align surface graph compile() with rag/hub conventions"
```

---

## Task 13: Flip frontend `assistantId` from `agent` → `notebook`

**Files:**
- Modify: `apps/web/components/deepdive/chat/chat-panel.tsx` (line 183)

This is the single user-visible change in P2. Rolling back = revert this commit.

- [ ] **Step 1: Read the file**

```bash
head -200 apps/web/components/deepdive/chat/chat-panel.tsx | grep -n -A 2 "assistantId"
```

Current line (~183): `assistantId: "agent",`

- [ ] **Step 2: Change the literal**

```typescript
assistantId: "notebook",
```

- [ ] **Step 3: Run frontend lint + type check**

```bash
cd apps/web && npm run lint 2>&1 | tail -5
cd apps/web && npx tsc --noEmit 2>&1 | tail -5
```

Expected: no new errors from this change.

- [ ] **Step 4: (Manual) spot-check in dev**

Boot the full stack (`apps/agent` via `langgraph dev`; `apps/web` via `npm run dev`). Open a notebook, send a message in the chat. Verify a reply arrives and wiki tools fire.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/deepdive/chat/chat-panel.tsx
git commit -m "feat(web): switch deepdive chat assistantId from agent to notebook"
```

---

## Task 14: Verification gate

**Files:**
- none

- [ ] **Step 1: Full agent pytest suite**

```bash
cd apps/agent && .venv/bin/python -m pytest -v 2>&1 | tail -10
```

Expected: all tests pass; total count = P1's 46 + Task 1's 3 + Task 2's 4 + Task 3's 2 = **55 tests**.

- [ ] **Step 2: Confirm all 3 legacy graphs still import (no regressions)**

```bash
cd apps/agent && .venv/bin/python -c "
import graphs.rag_agent
import graphs.hub_agent
import graphs.search_agent
import graphs.surface
print('all 4 graph modules import cleanly')
"
```

Expected: `all 4 graph modules import cleanly`.

- [ ] **Step 3: Registry smoke — count tools by toolset**

```bash
cd apps/agent && .venv/bin/python -c "
from hermes.registry import discover_builtin_tools, registry
discover_builtin_tools()
for ts in ('wiki', 'hub', 'wechat', 'navigation', 'ui', '_test'):
    print(f'{ts}: {len(registry.get_tools(toolset={ts}))}')"
```

Expected: nonzero counts across `wiki`, `hub`, `wechat`, `navigation`, `ui`; `_test` = 1 (echo).

- [ ] **Step 4: Frontend lint + typecheck**

```bash
cd apps/web && npm run lint 2>&1 | tail -5
cd apps/web && npx tsc --noEmit 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 5: No commit** — this is the acceptance gate.

---

## Self-review checklist (run before push)

- [ ] Every task ends with a commit. `git log --oneline main..HEAD` shows ~13 new commits.
- [ ] `cd apps/agent && .venv/bin/python -m pytest -v` — 55 tests pass.
- [ ] `apps/agent/langgraph.json` registers 4 graphs: agent (legacy), hub (new surface.py), search (legacy), notebook (new surface.py).
- [ ] `apps/agent/graphs/surface.py` exports `notebook_graph` and `hub_graph` and triggers `discover_builtin_tools()` at import time.
- [ ] All tools under `apps/agent/tools/*.py` have a module-top-level `registry.register(...)` loop (discoverable by AST scan).
- [ ] `apps/web/components/deepdive/chat/chat-panel.tsx` line ~183 reads `assistantId: "notebook"`.
- [ ] Old `graphs/rag_agent.py` and `graphs/hub_agent.py` still exist on disk (for rollback); their deletion is a **later** PR.
- [ ] `apps/agent/prompts/surfaces/notebook.md` ends with the "Tool arguments" section about `notebook_id` (instructs LLM to pass it explicitly).
- [ ] No placeholder text in any committed file:
      ```bash
      grep -rnE "TODO|TBD|FIXME|XXX" apps/agent/surfaces/ apps/agent/graphs/common.py apps/agent/graphs/surface.py apps/agent/config/surfaces.py apps/agent/prompts/surfaces/
      ```

## What's NOT done after P2

- The `agent` entry in `langgraph.json` still points at `graphs/rag_agent.py` — removing it belongs to a cleanup PR after ~1 week of production stability on `notebook`.
- `deep_research` surface doesn't exist (→ P4).
- Memory / Skills layers remain no-op stubs in `PromptBuilder` (→ P3).
- `search` workflow and `matcher`/`daily_digest` workflows are untouched (→ P4–P6).
- The `agent` / `search` graphs are UNCHANGED by P2 — they still run their P1-era modules.
- `copilotkit` Python dep is still in `pyproject.toml`; removal waits until P3/P4 proves nothing uses it.

P2 is the "middle of the refactor" — the harness primitives from P1 now serve real production traffic through the parameterized graph. P3 adds memory and skills on top. P4 introduces the first non-agent workflow.
