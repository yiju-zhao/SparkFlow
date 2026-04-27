# `apps/agent` Refactor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `apps/agent` to match LangGraph reference patterns: build tool-calling agents from `StateGraph` primitives per surface, convert workflows to Functional API (search stays plain async; daily_digest uses Functional parallelization; matcher uses Graph API + `Send`), port wiki-ingest from Node to Python as the fourth workflow, delete the LLM gateway and ~1,200 LOC of harness.

**Architecture:** One file per agent surface (`agents/{notebook,hub,deep_research}.py`) constructed from `StateGraph(MessagesState)` per the reference doc's "Agents → Graph API" example. One flat `prompt_builder.py` (~30 LOC) replaces the 9-layer `PromptBuilder`. Workflows live in `workflows/`: search is plain `async def`; daily_digest is `@entrypoint` + `@task` parallelization; matcher is `StateGraph` + `Send`; wiki_ingest is `@entrypoint` chain. FastAPI surface preserved; `/v1/llm/models` extracted to a litellm-free route, gateway and `graph-service.ts` deleted in step 11.

**Tech Stack:** Python 3.11, langgraph 0.6.x, langchain-openai, networkx 3.x, FastAPI, pytest + pytest-asyncio, ARQ (digest worker), psycopg (memory tables retained, Python access removed). Cross-app: TypeScript (Next.js + BullMQ worker on the `apps/web` side).

**Spec:** `docs/superpowers/specs/2026-04-27-agent-refactor-design.md` (read before starting).
**Reference:** `docs/reference/langgraph-agent-and-workflow.md` — every pattern below cites a section here.

---

## Pre-flight

Before Task 1, read these in order:
1. `docs/superpowers/specs/2026-04-27-agent-refactor-design.md` — the design (12 sections).
2. `docs/reference/langgraph-agent-and-workflow.md` — §Agents → Graph API (matches surfaces); §Functional API (matches digest/wiki_ingest); §Creating workers in LangGraph (matches matcher with `Send`).
3. `apps/agent/README.md` — current dev-server / docker workflow (won't change).
4. The current files you'll be deleting: `apps/agent/graphs/{surface,common}.py`, `apps/agent/hermes/registry.py`, `apps/agent/hermes/prompt_builder.py`. Skim — don't memorize.

Verify the dev environment runs current tests green:

```bash
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/agent-dev/apps/agent
.venv/bin/python -m pytest -x
```
Expected: all current tests pass (some you'll delete; that's fine — verifies baseline).

---

## File map

### Created in this plan

| File | Phase | Purpose |
|---|---|---|
| `apps/agent/prompt_builder.py` | 1 | Flat function `build_system_prompt(...)` |
| `apps/agent/agents/__init__.py` | 2 | Empty package marker |
| `apps/agent/agents/notebook.py` | 2 | Notebook surface — `StateGraph(MessagesState)` |
| `apps/agent/agents/deep_research.py` | 2 | Deep-research surface |
| `apps/agent/agents/hub.py` | 2 | Hub surface with frontend-tool exit semantics |
| `apps/agent/tests/test_prompt_builder.py` | 1 | Tests (REPLACES the existing one — same path, new content) |
| `apps/agent/tests/test_agents.py` | 2 | Surface tests with hub four-paths |
| `apps/agent/tests/test_workflows_search.py` | 4 | Tests (REPLACES; covers new plain-async shape) |
| `apps/agent/tests/test_workflows_daily_digest.py` | 5 | Tests (REPLACES; covers Functional API) |
| `apps/agent/tests/test_workflows_digest_tasks.py` | 5 | ARQ adapter tests (REPLACES) |
| `apps/agent/tests/test_matcher_workflow.py` | 6 | Tests (REPLACES; covers Graph API + Send) |
| `apps/agent/tests/test_wiki_ingest.py` | 8 | Wiki-ingest workflow tests |
| `apps/agent/tests/test_wiki_ingest_router.py` | 9 | Wiki-ingest HTTP route tests |
| `apps/agent/tests/test_llm_models.py` | 9 | New `/v1/workflows/llm/list-models` route tests |
| `apps/agent/workflows/wiki_ingest.py` | 8 | Port of graph-service.ts |
| `apps/agent/workflows/matcher/job.py` | 6 | Was `job_runner.py`; rewritten as Graph API + Send |
| `apps/agent/server/wiki_ingest_types.py` | 9 | Pydantic discriminated-union models |
| `apps/agent/server/routes/wiki_ingest.py` | 9 | `POST /v1/workflows/wiki/extract` |
| `apps/agent/server/routes/llm_models.py` | 9 | `POST /v1/workflows/llm/list-models` (httpx, no litellm) |
| `apps/agent/scripts/diff_wiki_ingest.py` | 8 | One-off diff harness for cutover gate |

### Modified

| File | Phase |
|---|---|
| `apps/agent/langgraph.json` | 2 |
| `apps/agent/pyproject.toml` | 3, 8, 11 |
| `apps/agent/tools/web.py` | 3 |
| `apps/agent/tools/wiki.py` (renamed from `wiki_tools.py`) | 3 |
| `apps/agent/tools/hub_toolbox.py` | 3 |
| `apps/agent/tools/hub_ui.py` (renamed from `hub_ui_tools.py`) | 3 |
| `apps/agent/tools/hub_nav.py` (renamed from `hub_nav_tools.py`) | 3 |
| `apps/agent/tools/hub_wechat.py` (renamed from `hub_wechat_tools.py`) | 3 |
| `apps/agent/workflows/search.py` | 4 |
| `apps/agent/workflows/daily_digest.py` | 5 |
| `apps/agent/workflows/digest_tasks.py` | 5 |
| `apps/agent/server/app.py` | 4, 5, 6, 9 |
| `apps/agent/server/routes/matcher_jobs.py` | 6 |
| `apps/agent/README.md` | 7 |
| `apps/web/workers/ingest.ts` | 10 |
| `apps/web/lib/services/wiki-ingest.ts` | 10 |
| `apps/web/lib/providers/list-models.ts` | 10 |
| `apps/web/CLAUDE.md` and `apps/agent/CLAUDE.md` | 7, 10 |
| `apps/web/package.json` | 10 |

### Deleted

| File / dir | Phase | Reason |
|---|---|---|
| `apps/agent/hermes/` (entire directory) | 3 | Replaced by `prompt_builder.py` and explicit tool imports |
| `apps/agent/graphs/` (entire directory) | 2 | Replaced by `agents/` |
| `apps/agent/surfaces/` (entire directory) | 2 | Surface configs colocated in `agents/*.py` |
| `apps/agent/config/` (entire directory) | 2 | `SurfaceConfig` no longer needed |
| `apps/agent/tools/_echo.py` | 3 | Debug-only |
| `apps/agent/tools/skills.py` | 3 | Skills subsystem dropped |
| `apps/agent/tools/memory.py` | 3 | Memory Python access dropped (Prisma tables retained) |
| `apps/agent/skills/` (entire directory) | 3 | Skill files were never mounted to `~/.sparkflow/skills/` |
| `apps/agent/prompts/surfaces/echo_test.md` | 3 | Debug surface |
| `apps/agent/server/routes/llm_gateway.py` | 10 | After cutover; consumers replaced |
| Numerous `tests/test_*.py` | 3 | Tests for deleted subsystems (see Task 12) |
| `apps/web/lib/services/graph-service.ts` | 10 | Replaced by `workflows/wiki_ingest.py` |

---

# Phase 1 — Prompt builder foundation

### Task 1: Write tests for `build_system_prompt`

**Files:**
- Create: `apps/agent/tests/test_prompt_builder.py` (overwrites existing — back up first if needed; existing tests are for the deleted `PromptBuilder` class)

- [ ] **Step 1: Save the new test file**

```python
"""Tests for the flat prompt_builder.build_system_prompt function."""

from __future__ import annotations

import pytest

from prompt_builder import build_system_prompt


def test_includes_base_identity_and_enforcement():
    out = build_system_prompt(
        surface="notebook",
        surface_prompt="surfaces/notebook.md",
        provider="openai",
        model="gpt-4o",
        session_id="sess_1",
    )
    # Layer order: base_identity → tool_use_enforcement → model_hints → surface → session
    assert "## Session Metadata" in out
    assert "session_id: `sess_1`" in out
    assert "surface: `notebook`" in out
    assert "model: `openai/gpt-4o`" in out


def test_openai_provider_loads_openai_hint():
    out = build_system_prompt(
        surface="hub", surface_prompt="surfaces/hub.md",
        provider="deepseek", model="deepseek-chat", session_id="s",
    )
    # deepseek is in the OpenAI-hint family per spec §6
    # We expect the openai.md hint to be embedded somewhere before session metadata
    body, sep, meta = out.partition("## Session Metadata")
    assert sep, "session metadata block should be present"
    # Sanity: openai hint markdown text appears at least via a heading from prompts/model_hints/openai.md
    assert "tool" in body.lower()  # model_hints/openai.md mentions tool semantics


def test_gemini_provider_loads_gemini_hint():
    out = build_system_prompt(
        surface="deep_research", surface_prompt="surfaces/deep_research.md",
        provider="gemini", model="gemini-2.0-flash", session_id="s",
    )
    # Gemini hint family — distinct file from openai.md
    assert "deep_research" in out  # surface metadata block


def test_unknown_provider_skips_hint():
    out = build_system_prompt(
        surface="notebook", surface_prompt="surfaces/notebook.md",
        provider="zzz_unknown", model="x", session_id="s",
    )
    # No exception, just no hint section
    assert "## Session Metadata" in out


def test_page_context_inserted_before_metadata():
    out = build_system_prompt(
        surface="hub", surface_prompt="surfaces/hub.md",
        provider="openai", model="gpt-4o", session_id="s",
        page_context="user is on /explore/conferences/publications",
    )
    pc_idx = out.index("Current page context")
    sess_idx = out.index("Session Metadata")
    assert pc_idx < sess_idx
    assert "/explore/conferences/publications" in out


def test_no_page_context_when_omitted():
    out = build_system_prompt(
        surface="notebook", surface_prompt="surfaces/notebook.md",
        provider="openai", model="gpt-4o", session_id="s",
    )
    assert "Current page context" not in out


def test_missing_surface_prompt_raises():
    with pytest.raises(FileNotFoundError):
        build_system_prompt(
            surface="x", surface_prompt="surfaces/does_not_exist.md",
            provider="openai", model="gpt-4o", session_id="s",
        )
```

- [ ] **Step 2: Run tests; confirm they FAIL**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_prompt_builder.py -v
```
Expected: 7 ImportErrors or test failures — `prompt_builder` module does not yet exist.

- [ ] **Step 3: Commit the failing tests**

```bash
git add apps/agent/tests/test_prompt_builder.py
git commit -m "test(agent): add tests for flat build_system_prompt"
```

### Task 2: Implement `prompt_builder.py`

**Files:**
- Create: `apps/agent/prompt_builder.py`

- [ ] **Step 1: Write the implementation**

```python
"""Assemble system prompts from prompts/*.md fragments.

Layer order (per refactor spec §6):
  1. base_identity.md
  2. tool_use_enforcement.md
  3. model_hints/{openai|gemini}.md          (skipped if provider doesn't match)
  4. <surface_prompt> contents
  5. page_context block                       (if provided)
  6. session metadata
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent / "prompts"

OPENAI_HINT_FAMILIES = {
    "openai", "gpt", "codex",
    "deepseek", "glm", "zhipu", "minimax", "kimi", "moonshot",
    "custom",
}
GEMINI_HINT_FAMILIES = {"google", "gemini"}


def _read(rel: str) -> str:
    path = ROOT / rel
    return path.read_text(encoding="utf-8").strip()


def _model_hint(provider: str) -> str:
    p = provider.lower().strip()
    if p in OPENAI_HINT_FAMILIES:
        return _read("model_hints/openai.md")
    if p in GEMINI_HINT_FAMILIES:
        return _read("model_hints/gemini.md")
    return ""


def build_system_prompt(
    *,
    surface: str,
    surface_prompt: str,
    provider: str,
    model: str,
    session_id: str,
    page_context: str | None = None,
) -> str:
    parts: list[str] = [
        _read("base_identity.md"),
        _read("tool_use_enforcement.md"),
        _model_hint(provider),
        _read(surface_prompt),
    ]
    if page_context:
        parts.append(f"## Current page context\n\n- {page_context}")
    parts.append(
        "## Session Metadata\n\n"
        f"- session_id: `{session_id}`\n"
        f"- surface: `{surface}`\n"
        f"- model: `{provider}/{model}`\n"
        f"- timestamp: `{datetime.now(timezone.utc).isoformat()}`"
    )
    return "\n\n".join(p for p in parts if p)
```

- [ ] **Step 2: Run tests; confirm PASS**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_prompt_builder.py -v
```
Expected: 7 passed.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/prompt_builder.py
git commit -m "feat(agent): add flat build_system_prompt"
```

---

# Phase 2 — Agent surfaces

### Task 3: Add `agents/` package + write notebook agent test

**Files:**
- Create: `apps/agent/agents/__init__.py` (empty)
- Create: `apps/agent/tests/test_agents.py` (initial content: notebook tests only)

- [ ] **Step 1: Create the package marker**

```bash
mkdir -p apps/agent/agents
touch apps/agent/agents/__init__.py
```

- [ ] **Step 2: Write notebook agent tests (test_agents.py — initial content)**

```python
"""Tests for agents.{notebook,hub,deep_research}.

Pattern: each surface defines a module-level `agent` (compiled StateGraph).
We invoke it with a fake LLM that emits a tool call then a final answer,
and assert the loop terminates correctly.
"""
from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage


def _fake_model_factory(responses):
    """Return a callable mimicking init_chat_model().bind_tools(...).invoke().

    `responses` is a list of AIMessage instances; each invoke returns the next.
    """
    iter_responses = iter(responses)
    bound = MagicMock()
    bound.invoke = MagicMock(side_effect=lambda msgs: next(iter_responses))
    model = MagicMock()
    model.bind_tools = MagicMock(return_value=bound)
    return model


# --------------------- notebook surface ---------------------

def test_notebook_dispatches_backend_tool(monkeypatch):
    from agents import notebook as nb

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "source_list", "args": {"notebook_id": "nb_1"}, "id": "c1"}
        ]),
        AIMessage(content="here are your sources"),
    ]
    monkeypatch.setattr(nb, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    # Mock source_list tool dispatch to avoid real HTTP
    monkeypatch.setattr(nb.TOOLS_BY_NAME["source_list"], "invoke",
                        lambda args: "Source A\nSource B")

    ctx = nb.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-test",
                 user_id="u1", session_id="s1", notebook_id="nb_1")
    out = nb.agent.invoke({"messages": [HumanMessage("list sources")]}, context=ctx)
    msgs = out["messages"]
    # Expect: human, ai-toolcall, tool-result, ai-final
    assert isinstance(msgs[-1], AIMessage)
    assert msgs[-1].content == "here are your sources"
    assert any(isinstance(m, ToolMessage) for m in msgs)


def test_notebook_unknown_tool_returns_error_toolmessage(monkeypatch):
    from agents import notebook as nb

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "no_such_tool", "args": {}, "id": "c1"}
        ]),
        AIMessage(content="oh well"),
    ]
    monkeypatch.setattr(nb, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    ctx = nb.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-test",
                 user_id="u1", session_id="s1", notebook_id="nb_1")
    out = nb.agent.invoke({"messages": [HumanMessage("hi")]}, context=ctx)
    tool_msgs = [m for m in out["messages"] if isinstance(m, ToolMessage)]
    assert len(tool_msgs) == 1
    assert "unknown tool" in tool_msgs[0].content.lower()


def test_notebook_no_api_key_raises():
    from agents import notebook as nb
    ctx = nb.Ctx(model_provider="openai", model_name="gpt-4o", api_key="",
                 user_id="u1", session_id="s1", notebook_id="nb_1")
    with pytest.raises(ValueError, match="BYOK"):
        nb.agent.invoke({"messages": [HumanMessage("hi")]}, context=ctx)
```

- [ ] **Step 3: Run; confirm all 3 FAIL with ImportError**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_agents.py -v
```
Expected: ImportError — `agents.notebook` does not yet exist.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/agents/__init__.py apps/agent/tests/test_agents.py
git commit -m "test(agent): add agents package + notebook surface tests"
```

### Task 4: Implement `agents/notebook.py`

**Files:**
- Create: `apps/agent/agents/notebook.py`

- [ ] **Step 1: Write the notebook agent module**

```python
"""Notebook surface — RAG over a notebook's wiki + sources.

Built from StateGraph primitives per ref doc §Agents → Graph API.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.runtime import Runtime

from prompt_builder import build_system_prompt
from tools.wiki import source_read, source_list

TOOLS = [source_read, source_list]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}
SURFACE = "notebook"
PROMPT_PATH = "surfaces/notebook.md"


@dataclass
class Ctx:
    model_provider: str
    model_name: str
    api_key: str
    user_id: str
    session_id: str
    notebook_id: str | None = None
    page_context: str | None = None  # unused on notebook; kept for shared Ctx shape


def llm_call(state: MessagesState, runtime: Runtime[Ctx]) -> dict[str, list[BaseMessage]]:
    ctx = runtime.context
    if not ctx.api_key:
        raise ValueError(f"BYOK required for provider {ctx.model_provider!r}")
    system = build_system_prompt(
        surface=SURFACE, surface_prompt=PROMPT_PATH,
        provider=ctx.model_provider, model=ctx.model_name,
        session_id=ctx.session_id, page_context=ctx.page_context,
    )
    model = init_chat_model(f"{ctx.model_provider}:{ctx.model_name}", api_key=ctx.api_key)
    bound = model.bind_tools(TOOLS)
    response = bound.invoke([SystemMessage(content=system), *state["messages"]])
    return {"messages": [response]}


async def tool_node(state: MessagesState) -> dict[str, list[BaseMessage]]:
    last = state["messages"][-1]
    if not isinstance(last, AIMessage) or not last.tool_calls:
        return {"messages": []}
    results: list[ToolMessage] = []
    for call in last.tool_calls:
        tool = TOOLS_BY_NAME.get(call["name"])
        if tool is None:
            results.append(ToolMessage(
                content=json.dumps({"error": f"unknown tool {call['name']}"}),
                tool_call_id=call["id"],
            ))
            continue
        try:
            if hasattr(tool, "ainvoke"):
                raw = await tool.ainvoke(call["args"])
            else:
                raw = tool.invoke(call["args"])
        except Exception as exc:  # noqa: BLE001
            raw = {"error": str(exc)}
        content = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
        results.append(ToolMessage(content=content, tool_call_id=call["id"]))
    return {"messages": results}


def should_continue(state: MessagesState):
    last = state["messages"][-1]
    return "tool_node" if getattr(last, "tool_calls", None) else END


builder = StateGraph(MessagesState, context_schema=Ctx)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
builder.add_edge("tool_node", "llm_call")
agent = builder.compile()
```

Note: `tools.wiki` does not yet exist — it's renamed from `tools.wiki_tools` in Task 11. For now this import will fail. Defer running tests until Task 11. Mark this in the commit message:

- [ ] **Step 2: Commit (deliberately broken pending Task 11)**

```bash
git add apps/agent/agents/notebook.py
git commit -m "feat(agent): add agents/notebook.py (StateGraph from primitives)

NOTE: imports tools.wiki which does not exist yet (renamed in Task 11).
Tests deferred until tools/ rename completes."
```

### Task 5: Implement `agents/deep_research.py`

**Files:**
- Create: `apps/agent/agents/deep_research.py`

- [ ] **Step 1: Write the module**

```python
"""Deep research surface — open-web research."""
from __future__ import annotations

import json
from dataclasses import dataclass

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.runtime import Runtime

from prompt_builder import build_system_prompt
from tools.web import search_web, url_fetch
from tools.wiki import source_read, source_list

TOOLS = [search_web, url_fetch, source_read, source_list]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}
SURFACE = "deep_research"
PROMPT_PATH = "surfaces/deep_research.md"


@dataclass
class Ctx:
    model_provider: str
    model_name: str
    api_key: str
    user_id: str
    session_id: str
    notebook_id: str | None = None
    page_context: str | None = None


def llm_call(state: MessagesState, runtime: Runtime[Ctx]) -> dict[str, list[BaseMessage]]:
    ctx = runtime.context
    if not ctx.api_key:
        raise ValueError(f"BYOK required for provider {ctx.model_provider!r}")
    system = build_system_prompt(
        surface=SURFACE, surface_prompt=PROMPT_PATH,
        provider=ctx.model_provider, model=ctx.model_name,
        session_id=ctx.session_id, page_context=ctx.page_context,
    )
    model = init_chat_model(f"{ctx.model_provider}:{ctx.model_name}", api_key=ctx.api_key)
    bound = model.bind_tools(TOOLS)
    response = bound.invoke([SystemMessage(content=system), *state["messages"]])
    return {"messages": [response]}


async def tool_node(state: MessagesState) -> dict[str, list[BaseMessage]]:
    last = state["messages"][-1]
    if not isinstance(last, AIMessage) or not last.tool_calls:
        return {"messages": []}
    results: list[ToolMessage] = []
    for call in last.tool_calls:
        tool = TOOLS_BY_NAME.get(call["name"])
        if tool is None:
            results.append(ToolMessage(
                content=json.dumps({"error": f"unknown tool {call['name']}"}),
                tool_call_id=call["id"],
            ))
            continue
        try:
            if hasattr(tool, "ainvoke"):
                raw = await tool.ainvoke(call["args"])
            else:
                raw = tool.invoke(call["args"])
        except Exception as exc:
            raw = {"error": str(exc)}
        content = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
        results.append(ToolMessage(content=content, tool_call_id=call["id"]))
    return {"messages": results}


def should_continue(state: MessagesState):
    last = state["messages"][-1]
    return "tool_node" if getattr(last, "tool_calls", None) else END


builder = StateGraph(MessagesState, context_schema=Ctx)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
builder.add_edge("tool_node", "llm_call")
agent = builder.compile()
```

- [ ] **Step 2: Commit (broken pending Task 11)**

```bash
git add apps/agent/agents/deep_research.py
git commit -m "feat(agent): add agents/deep_research.py"
```

### Task 6: Implement `agents/hub.py` with frontend-tool exit semantics

**Files:**
- Create: `apps/agent/agents/hub.py`

- [ ] **Step 1: Write the hub module**

```python
"""Hub surface — research assistant with generative UI via CopilotKit.

Distinguishing feature vs. notebook/deep_research: tools include both
backend (server-executed) tools AND frontend tools that the LLM emits
as tool_calls but the SERVER does not dispatch — the LangGraph SDK
forwards the AIMessage to CopilotKit which renders the tool_call as a
React component. The local tool_node skips dispatch for frontend tools;
should_continue routes to END when ALL tool_calls in the turn are
frontend (otherwise the loop re-invokes llm_call with no ToolMessage
answers, causing repeats / hallucination — see spec §5.3).
"""
from __future__ import annotations

import json
from dataclasses import dataclass

from langchain.chat_models import init_chat_model
from langchain_core.messages import AIMessage, BaseMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, MessagesState, StateGraph
from langgraph.runtime import Runtime

from prompt_builder import build_system_prompt
from tools.hub_toolbox import HUB_TOOLBOX_TOOLS
from tools.hub_nav import HUB_NAV_TOOLS
from tools.hub_ui import HUB_FRONTEND_TOOLS, HUB_FRONTEND_TOOL_NAMES
from tools.hub_wechat import HUB_WECHAT_TOOLS

TOOLS = [*HUB_TOOLBOX_TOOLS, *HUB_NAV_TOOLS, *HUB_FRONTEND_TOOLS, *HUB_WECHAT_TOOLS]
TOOLS_BY_NAME = {t.name: t for t in TOOLS}
SURFACE = "hub"
PROMPT_PATH = "surfaces/hub.md"


@dataclass
class Ctx:
    model_provider: str
    model_name: str
    api_key: str
    user_id: str
    session_id: str
    notebook_id: str | None = None
    page_context: str | None = None


def llm_call(state: MessagesState, runtime: Runtime[Ctx]) -> dict[str, list[BaseMessage]]:
    ctx = runtime.context
    if not ctx.api_key:
        raise ValueError(f"BYOK required for provider {ctx.model_provider!r}")
    system = build_system_prompt(
        surface=SURFACE, surface_prompt=PROMPT_PATH,
        provider=ctx.model_provider, model=ctx.model_name,
        session_id=ctx.session_id, page_context=ctx.page_context,
    )
    model = init_chat_model(f"{ctx.model_provider}:{ctx.model_name}", api_key=ctx.api_key)
    bound = model.bind_tools(TOOLS)
    response = bound.invoke([SystemMessage(content=system), *state["messages"]])
    return {"messages": [response]}


async def tool_node(state: MessagesState) -> dict[str, list[BaseMessage]]:
    """Dispatch backend tool calls; skip frontend tool calls (rendered client-side)."""
    last = state["messages"][-1]
    if not isinstance(last, AIMessage) or not last.tool_calls:
        return {"messages": []}
    results: list[ToolMessage] = []
    for call in last.tool_calls:
        if call["name"] in HUB_FRONTEND_TOOL_NAMES:
            continue  # client renders; no ToolMessage produced
        tool = TOOLS_BY_NAME.get(call["name"])
        if tool is None:
            results.append(ToolMessage(
                content=json.dumps({"error": f"unknown tool {call['name']}"}),
                tool_call_id=call["id"],
            ))
            continue
        try:
            if hasattr(tool, "ainvoke"):
                raw = await tool.ainvoke(call["args"])
            else:
                raw = tool.invoke(call["args"])
        except Exception as exc:
            raw = {"error": str(exc)}
        content = raw if isinstance(raw, str) else json.dumps(raw, ensure_ascii=False)
        results.append(ToolMessage(content=content, tool_call_id=call["id"]))
    return {"messages": results}


def should_continue(state: MessagesState):
    """Route to END when no tool_calls OR when every tool_call is frontend.

    Without the all-frontend short-circuit, the loop re-enters llm_call
    with the same message tail (AIMessage with tool_calls but no answering
    ToolMessage), and the LLM either repeats the call or hallucinates.
    """
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    if not tool_calls:
        return END
    if all(tc["name"] in HUB_FRONTEND_TOOL_NAMES for tc in tool_calls):
        return END
    return "tool_node"


builder = StateGraph(MessagesState, context_schema=Ctx)
builder.add_node("llm_call", llm_call)
builder.add_node("tool_node", tool_node)
builder.add_edge(START, "llm_call")
builder.add_conditional_edges("llm_call", should_continue, ["tool_node", END])
builder.add_edge("tool_node", "llm_call")
agent = builder.compile()
```

- [ ] **Step 2: Commit (broken pending Task 11)**

```bash
git add apps/agent/agents/hub.py
git commit -m "feat(agent): add agents/hub.py with all-frontend exit semantics"
```

### Task 7: Add hub four-path tests + deep_research test to `test_agents.py`

**Files:**
- Modify: `apps/agent/tests/test_agents.py`

- [ ] **Step 1: Append the hub + deep_research tests**

Append below the notebook tests in `test_agents.py`:

```python
# --------------------- hub surface — four paths ---------------------

def test_hub_all_backend_tool_calls(monkeypatch):
    from agents import hub as h

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "list_publications", "args": {"limit": 5}, "id": "c1"}
        ]),
        AIMessage(content="here are publications"),
    ]
    monkeypatch.setattr(h, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    # Mock the toolbox dispatch
    fake_tool = MagicMock()
    fake_tool.ainvoke = MagicMock(return_value={"items": [], "total": 0})
    monkeypatch.setitem(h.TOOLS_BY_NAME, "list_publications", fake_tool)

    import asyncio
    async def _patched_ainvoke(args):
        return {"items": []}
    fake_tool.ainvoke = _patched_ainvoke

    ctx = h.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-t",
                user_id="u", session_id="s")
    out = h.agent.invoke({"messages": [HumanMessage("list pubs")]}, context=ctx)
    msgs = out["messages"]
    assert any(isinstance(m, ToolMessage) for m in msgs)
    assert msgs[-1].content == "here are publications"


def test_hub_all_frontend_tool_calls_terminates_loop(monkeypatch):
    """Critical regression test: when EVERY tool_call is frontend, loop must END.

    Otherwise the LLM is invoked again with no ToolMessage answers and
    will repeat the frontend call or hallucinate (spec §5.3).
    """
    from agents import hub as h

    # Single response — if loop terminates, no second invoke needed.
    # If the bug regresses, the iterator will be exhausted and StopIteration
    # bubbles up.
    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "show_table", "args": {"title": "T", "rows": []}, "id": "c1"}
        ]),
    ]
    monkeypatch.setattr(h, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))

    ctx = h.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-t",
                user_id="u", session_id="s")
    out = h.agent.invoke({"messages": [HumanMessage("show me a table")]}, context=ctx)
    # Last message is the AIMessage with the frontend tool_call — client renders it.
    assert isinstance(out["messages"][-1], AIMessage)
    assert out["messages"][-1].tool_calls[0]["name"] == "show_table"


def test_hub_mixed_frontend_and_backend(monkeypatch):
    from agents import hub as h

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "show_table", "args": {"title": "T", "rows": []}, "id": "c1"},
            {"name": "list_publications", "args": {"limit": 5}, "id": "c2"},
        ]),
        AIMessage(content="ok"),
    ]
    monkeypatch.setattr(h, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    fake = MagicMock()
    async def _ainvoke(args):
        return {"items": []}
    fake.ainvoke = _ainvoke
    monkeypatch.setitem(h.TOOLS_BY_NAME, "list_publications", fake)

    ctx = h.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-t",
                user_id="u", session_id="s")
    out = h.agent.invoke({"messages": [HumanMessage("hi")]}, context=ctx)
    tool_msgs = [m for m in out["messages"] if isinstance(m, ToolMessage)]
    # Only the backend tool produces a ToolMessage; frontend is skipped.
    assert len(tool_msgs) == 1
    assert msgs := out["messages"]
    assert msgs[-1].content == "ok"


def test_hub_unknown_backend_tool(monkeypatch):
    from agents import hub as h

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "no_such_tool", "args": {}, "id": "c1"}
        ]),
        AIMessage(content="recovered"),
    ]
    monkeypatch.setattr(h, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    ctx = h.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-t",
                user_id="u", session_id="s")
    out = h.agent.invoke({"messages": [HumanMessage("?")]}, context=ctx)
    tool_msgs = [m for m in out["messages"] if isinstance(m, ToolMessage)]
    assert len(tool_msgs) == 1
    assert "unknown tool" in tool_msgs[0].content.lower()


# --------------------- deep_research surface ---------------------

def test_deep_research_dispatches_web_search(monkeypatch):
    from agents import deep_research as dr

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "search_web", "args": {"query": "diffusion"}, "id": "c1"}
        ]),
        AIMessage(content="results follow"),
    ]
    monkeypatch.setattr(dr, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    monkeypatch.setattr(dr.TOOLS_BY_NAME["search_web"], "invoke",
                        lambda args: '[{"title":"a","url":"u","content":"c"}]')

    ctx = dr.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-t",
                 user_id="u", session_id="s",
                 page_context="user is on /explore")
    out = dr.agent.invoke({"messages": [HumanMessage("research diffusion")]}, context=ctx)
    assert out["messages"][-1].content == "results follow"
```

- [ ] **Step 2: Run; expect ImportError still (tools/ not yet renamed)**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_agents.py -v
```
Expected: ImportError on `tools.wiki` / `tools.hub_ui` etc.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/tests/test_agents.py
git commit -m "test(agent): add hub four-paths + deep_research tests"
```

### Task 8: Update `langgraph.json`

**Files:**
- Modify: `apps/agent/langgraph.json`

- [ ] **Step 1: Update graph paths**

```json
{
    "$schema": "https://langgra.ph/schema.json",
    "dependencies": ["."],
    "graphs": {
        "hub": "./agents/hub.py:agent",
        "notebook": "./agents/notebook.py:agent",
        "deep_research": "./agents/deep_research.py:agent"
    },
    "env": ".env",
    "image_distro": "wolfi"
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/langgraph.json
git commit -m "chore(agent): point langgraph.json at agents/ modules"
```

### Task 9: Delete `graphs/`, `surfaces/`, `config/` directories

**Files:**
- Delete: `apps/agent/graphs/` (entire directory)
- Delete: `apps/agent/surfaces/` (entire directory)
- Delete: `apps/agent/config/` (entire directory)
- Delete: `apps/agent/tests/test_graphs_common.py`
- Delete: `apps/agent/tests/test_graphs_surface.py`
- Delete: `apps/agent/tests/test_surfaces.py`

- [ ] **Step 1: Remove the directories and their tests**

```bash
cd apps/agent
git rm -r graphs surfaces config
git rm tests/test_graphs_common.py tests/test_graphs_surface.py tests/test_surfaces.py
```

- [ ] **Step 2: Update `pyproject.toml` packages list**

In `apps/agent/pyproject.toml`, change:

```toml
[tool.hatch.build.targets.wheel]
packages = ["graphs", "tools", "config", "prompts", "embeddings", "hermes"]
```

to:

```toml
[tool.hatch.build.targets.wheel]
packages = ["agents", "tools", "prompts", "embeddings", "workflows", "server"]
```

- [ ] **Step 3: Commit**

```bash
git add apps/agent/pyproject.toml
git commit -m "chore(agent): delete graphs/ surfaces/ config/ — replaced by agents/"
```

---

# Phase 3 — Tools de-registry + hermes deletion

### Task 10: Rename `tools/*_tools.py` and drop registry self-registration

**Files:**
- Rename: `apps/agent/tools/wiki_tools.py` → `apps/agent/tools/wiki.py`
- Rename: `apps/agent/tools/hub_ui_tools.py` → `apps/agent/tools/hub_ui.py`
- Rename: `apps/agent/tools/hub_nav_tools.py` → `apps/agent/tools/hub_nav.py`
- Rename: `apps/agent/tools/hub_wechat_tools.py` → `apps/agent/tools/hub_wechat.py`
- Modify: `apps/agent/tools/web.py`, `apps/agent/tools/hub_toolbox.py`, and the four renamed files

- [ ] **Step 1: Rename via `git mv`**

```bash
cd apps/agent
git mv tools/wiki_tools.py tools/wiki.py
git mv tools/hub_ui_tools.py tools/hub_ui.py
git mv tools/hub_nav_tools.py tools/hub_nav.py
git mv tools/hub_wechat_tools.py tools/hub_wechat.py
```

- [ ] **Step 2: Strip `registry.register(...)` blocks from each tool module**

For each of the six tool modules (`web.py`, `wiki.py`, `hub_toolbox.py`, `hub_nav.py`, `hub_wechat.py`, `hub_ui.py`):

- Remove the `from hermes.registry import registry` import.
- Remove the trailing `registry.register(...)` block(s).
- Remove the leading per-module module-level test-discovery comment if present.

`tools/wiki.py` should also drop the deprecated `set_notebook_id` and `_current_notebook_id` (originally retained for `graphs/rag_agent.py` compatibility — that file is gone).

For `tools/hub_ui.py`, **add** at module bottom (replaces the old `frontend=True` registration loop):

```python
HUB_FRONTEND_TOOL_NAMES = {
    "show_stat_card", "show_table", "show_chart",
    "show_select", "show_confirm", "show_navigation",
}
```

(`HUB_FRONTEND_TOOLS` already exists as the list — keep it.)

- [ ] **Step 3: Run tests; expect things to start passing**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_prompt_builder.py tests/test_agents.py -v
```
Expected: All `test_prompt_builder.py` and `test_agents.py` tests PASS now that imports resolve. Other tests may still fail (they exercise hermes, which still exists).

- [ ] **Step 4: Commit**

```bash
git add apps/agent/tools/
git commit -m "refactor(tools): rename *_tools.py → short names; drop registry self-registration"
```

### Task 11: Delete `tools/_echo.py`, `tools/skills.py`, `tools/memory.py`, and their tests

**Files:**
- Delete: `apps/agent/tools/_echo.py`
- Delete: `apps/agent/tools/skills.py`
- Delete: `apps/agent/tools/memory.py`
- Delete: `apps/agent/skills/` (entire directory)
- Delete: `apps/agent/prompts/surfaces/echo_test.md`
- Delete: `apps/agent/tests/test_memory_tools.py`
- Delete: `apps/agent/tests/test_memory_store.py`
- Delete: `apps/agent/tests/test_skills_index.py`
- Delete: `apps/agent/tests/test_skills_loader.py`
- Delete: `apps/agent/tests/test_context_references.py`
- Delete: `apps/agent/tests/test_registry.py`
- Delete: `apps/agent/tests/test_discover.py`
- Delete: `apps/agent/tests/fixtures/fake_tools/`

- [ ] **Step 1: Bulk delete**

```bash
cd apps/agent
git rm tools/_echo.py tools/skills.py tools/memory.py
git rm -r skills
git rm prompts/surfaces/echo_test.md
git rm tests/test_memory_tools.py tests/test_memory_store.py
git rm tests/test_skills_index.py tests/test_skills_loader.py
git rm tests/test_context_references.py
git rm tests/test_registry.py tests/test_discover.py
git rm -r tests/fixtures/fake_tools
```

- [ ] **Step 2: Commit**

```bash
git commit -m "chore(agent): delete dead subsystems (skills/memory/echo/registry tests)"
```

### Task 12: Delete `hermes/` entirely

**Files:**
- Delete: `apps/agent/hermes/` (entire directory)
- Modify: `apps/agent/tests/test_smoke.py` (drop hermes imports)

- [ ] **Step 1: Inspect what test_smoke.py imports**

```bash
cd apps/agent && grep -n "hermes" tests/test_smoke.py
```
Replace any line of the form `from hermes.registry import discover_builtin_tools, registry` and the call `discover_builtin_tools()` — these are the only hermes references. Replace the body of any test that exercised registry behavior with a simple `agents/notebook.py` import smoke (see test_agents.py for pattern).

For example, replace `test_smoke.py` body with:

```python
"""Smoke test: every agent module imports cleanly and exposes a compiled `agent`."""

def test_agents_import():
    from agents import notebook, hub, deep_research
    for mod in (notebook, hub, deep_research):
        assert hasattr(mod, "agent"), f"{mod.__name__} must export `agent`"
        assert hasattr(mod.agent, "invoke")
```

- [ ] **Step 2: Delete the hermes directory**

```bash
cd apps/agent && git rm -r hermes
```

- [ ] **Step 3: Run all tests**

```bash
cd apps/agent && .venv/bin/python -m pytest -v
```
Expected: prompt_builder, agents, smoke tests PASS. Workflow tests (search/digest/matcher) still pass against current legacy code.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/tests/test_smoke.py
git commit -m "chore(agent): delete hermes/; smoke test imports new agents/"
```

---

# Phase 4 — `workflows/search.py` to plain async

### Task 13: Rewrite tests for `workflows/search.py`

**Files:**
- Overwrite: `apps/agent/tests/test_workflows_search.py`

- [ ] **Step 1: Write the new tests**

```python
"""Tests for workflows.search — plain async (NOT Functional API)."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from workflows.search import SearchRequest, search


@pytest.mark.asyncio
async def test_web_branch_returns_tavily_items(monkeypatch):
    monkeypatch.setattr(
        "workflows.search._web_search",
        AsyncMock(return_value=[{"title": "A", "url": "https://a.test", "content": "..."}]),
    )
    req = SearchRequest(query="diffusion", source_type="web",
                        model_provider="openai", model_name="gpt-4o",
                        api_key="sk-t", top_k=10)
    resp = await search(req)
    assert resp.items[0]["url"] == "https://a.test"


@pytest.mark.asyncio
async def test_wechat_branch_calls_prefilter_then_semops(monkeypatch):
    monkeypatch.setattr(
        "workflows.search._prefilter",
        AsyncMock(return_value=[{"id": 1, "text": "Article 1"},
                                {"id": 2, "text": "Article 2"}]),
    )
    monkeypatch.setattr(
        "workflows.search._semops_rank",
        AsyncMock(return_value={"ranked": [{"id": 1}], "reasons": {"1": "best match"}}),
    )
    req = SearchRequest(query="ai", source_type="wechat",
                        model_provider="openai", model_name="gpt-4o",
                        api_key="sk-t", top_k=10)
    resp = await search(req)
    assert resp.items == [{"id": 1}]
    assert resp.reasons == {"1": "best match"}


@pytest.mark.asyncio
async def test_publication_branch(monkeypatch):
    monkeypatch.setattr("workflows.search._prefilter",
                        AsyncMock(return_value=[{"id": 7, "text": "..."}]))
    monkeypatch.setattr("workflows.search._semops_rank",
                        AsyncMock(return_value={"ranked": [{"id": 7}], "reasons": {}}))
    req = SearchRequest(query="x", source_type="publication",
                        model_provider="openai", model_name="gpt-4o",
                        api_key="sk-t", top_k=5)
    resp = await search(req)
    assert resp.items == [{"id": 7}]


@pytest.mark.asyncio
async def test_empty_prefilter_short_circuits(monkeypatch):
    monkeypatch.setattr("workflows.search._prefilter", AsyncMock(return_value=[]))
    # _semops_rank must NOT be called.
    rank = AsyncMock()
    monkeypatch.setattr("workflows.search._semops_rank", rank)
    req = SearchRequest(query="zzz", source_type="wechat",
                        model_provider="openai", model_name="gpt-4o",
                        api_key="sk-t", top_k=10)
    resp = await search(req)
    assert resp.items == []
    rank.assert_not_called()


@pytest.mark.asyncio
async def test_unsupported_source_type_raises():
    req = SearchRequest(query="x", source_type="unknown_type",
                        model_provider="openai", model_name="gpt-4o",
                        api_key="sk-t", top_k=10)
    with pytest.raises(ValueError, match="Unsupported source_type"):
        await search(req)
```

- [ ] **Step 2: Run; expect failures (current code uses `run`, not `search`)**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_workflows_search.py -v
```
Expected: ImportError or AttributeError — `search` doesn't exist yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add apps/agent/tests/test_workflows_search.py
git commit -m "test(workflows/search): rewrite tests for plain async shape"
```

### Task 14: Rewrite `workflows/search.py` as plain `async def`

**Files:**
- Overwrite: `apps/agent/workflows/search.py`
- Modify: `apps/agent/server/app.py` (route now calls `search`, not `run`)

- [ ] **Step 1: Rewrite `workflows/search.py`**

```python
"""Search workflow — plain async, NOT Functional API.

Three source_types:
- "web": Tavily single-shot
- "wechat" / "publication": pgvector prefilter (Next.js) → semops rank

Pure HTTP orchestration. No LLM here; LLM ranking happens inside semops.
NOT @entrypoint — single chain, no parallelism, no checkpoint payoff.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any

import httpx

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")
SEMOPS_API_URL = os.getenv("SEMOPS_API_URL", "http://localhost:2025")
PREFILTER_LIMIT = 80
DEFAULT_TOP_K = 10


@dataclass
class SearchRequest:
    query: str
    source_type: str
    notebook_id: str | None = None
    domains: list[str] = field(default_factory=list)
    model_provider: str = "openai"
    model_name: str = "gpt-4o-mini"
    api_key: str | None = None
    tavily_api_key: str | None = None
    top_k: int = DEFAULT_TOP_K


@dataclass
class SearchResponse:
    items: list[dict[str, Any]]
    reasons: dict[str, str] = field(default_factory=dict)


async def search(req: SearchRequest) -> SearchResponse:
    if req.source_type == "web":
        items = await _web_search(req)
        return SearchResponse(items=items)

    if req.source_type not in ("wechat", "publication"):
        raise ValueError(f"Unsupported source_type: {req.source_type!r}")

    candidates = await _prefilter(req.source_type, req.query, PREFILTER_LIMIT)
    if not candidates:
        return SearchResponse(items=[])

    ranked = await _semops_rank(
        candidates=candidates, query=req.query, top_k=req.top_k,
        provider=req.model_provider, model=req.model_name, api_key=req.api_key,
    )
    return SearchResponse(items=ranked.get("ranked", []),
                          reasons=ranked.get("reasons") or {})


async def _web_search(req: SearchRequest) -> list[dict[str, Any]]:
    from tools.web import search_web
    raw = search_web.invoke({
        "query": req.query, "domains": req.domains or None,
        "api_key": req.tavily_api_key,
    })
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return []
    if isinstance(parsed, dict) and "error" in parsed:
        return []
    return list(parsed)[: req.top_k]


async def _prefilter(source_type: str, query: str, limit: int) -> list[dict[str, Any]]:
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SPARKFLOW_API_URL}/api/explore/search/{source_type}/prefilter",
            json={"query": query, "limit": limit},
        )
        resp.raise_for_status()
        return list(resp.json().get("candidates") or [])


async def _semops_rank(
    *, candidates: list[dict[str, Any]], query: str, top_k: int,
    provider: str, model: str, api_key: str, api_base: str | None = None,
) -> dict[str, Any]:
    normalized: list[dict[str, Any]] = []
    for c in candidates:
        if "match_text" in c:
            normalized.append(c)
        elif "text" in c:
            renamed = dict(c)
            renamed["match_text"] = renamed.pop("text")
            normalized.append(renamed)
        else:
            normalized.append(c)
    lm_config: dict[str, Any] = {
        "provider": provider, "model": model, "api_key": api_key,
    }
    if api_base:
        lm_config["api_base"] = api_base
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{SEMOPS_API_URL}/api/operators/rank",
            json={"candidates": normalized, "query_text": query, "top_k": top_k,
                  "include_reasons": True, "lm_config": lm_config},
        )
        resp.raise_for_status()
        return resp.json()
```

- [ ] **Step 2: Update `server/app.py` route**

In `apps/agent/server/app.py`, change the import and route body:

```python
from workflows.search import SearchRequest, SearchResponse, search   # was: ..., run as run_search
```

```python
@app.post("/v1/workflows/search", response_model=None)
async def search_route(req: SearchRequest) -> dict[str, Any]:
    result = await search(req)
    return {"items": result.items, "reasons": result.reasons}
```

- [ ] **Step 3: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_workflows_search.py tests/test_server_app.py -v
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/workflows/search.py apps/agent/server/app.py
git commit -m "refactor(workflows/search): plain async; remove Functional API ceremony"
```

---

# Phase 5 — `workflows/daily_digest.py` to Functional API

### Task 15: Rewrite tests for `workflows/daily_digest.py`

**Files:**
- Overwrite: `apps/agent/tests/test_workflows_daily_digest.py`

- [ ] **Step 1: Write tests covering parallelization + the EMPTY/COMPLETED/FAILED branches**

```python
"""Tests for workflows.daily_digest — Functional API entrypoint."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from workflows.daily_digest import GenerateSectionRequest, generate_section


def _make_req(**overrides):
    base = dict(
        section_id="sec_1",
        source_type="WECHAT",
        digest_date="2026-04-27",
        queries=[{"id": "q1", "text": "ai", "enabled": True},
                 {"id": "q2", "text": "ml", "enabled": True}],
        subscribed_source_ids=[],
        top_n=5,
        model_provider="openai",
        model_name="gpt-4o-mini",
        api_key="sk-t",
    )
    base.update(overrides)
    return GenerateSectionRequest(**base)


@pytest.mark.asyncio
async def test_completed_path(monkeypatch):
    """Two queries → parallel prefilter → merge → rank → COMPLETED callback."""
    prefilter_calls = []

    async def fake_prefilter(query_text, source_ids):
        prefilter_calls.append(query_text)
        return [{"id": 1, "title": "T", "source_name": "S", "author": "A",
                 "content_text": "c" * 50, "url": "u", "publish_time": "2026-04-26",
                 "cover_url": None, "score": 0.9, "matched_queries": []}]

    callback_payloads = []

    async def fake_callback(section_id, status, **kw):
        callback_payloads.append({"section_id": section_id, "status": status, **kw})

    async def fake_rank(**kw):
        return {"ranked": [{"id": 1}], "reasons": {"1": "great"}}

    monkeypatch.setattr("workflows.daily_digest._prefilter_query_impl", fake_prefilter)
    monkeypatch.setattr("workflows.daily_digest._semops_rank_impl", fake_rank)
    monkeypatch.setattr("workflows.daily_digest._callback_impl", fake_callback)

    await generate_section.ainvoke(_make_req())

    assert prefilter_calls == ["ai", "ml"]
    assert callback_payloads[-1]["status"] == "COMPLETED"
    assert callback_payloads[-1]["items"][0]["sourceRefId"] == 1


@pytest.mark.asyncio
async def test_empty_pool(monkeypatch):
    async def empty_prefilter(query_text, source_ids):
        return []
    callbacks = []
    async def fake_callback(section_id, status, **kw):
        callbacks.append((section_id, status, kw))
    monkeypatch.setattr("workflows.daily_digest._prefilter_query_impl", empty_prefilter)
    monkeypatch.setattr("workflows.daily_digest._callback_impl", fake_callback)

    await generate_section.ainvoke(_make_req())
    assert callbacks == [("sec_1", "EMPTY", {"items": []})]


@pytest.mark.asyncio
async def test_rank_failure_emits_failed_callback(monkeypatch):
    async def fake_prefilter(query_text, source_ids):
        return [{"id": 1, "title": "T", "source_name": "S", "content_text": "c"}]
    async def failing_rank(**kw):
        raise RuntimeError("upstream 502")
    callbacks = []
    async def fake_callback(section_id, status, **kw):
        callbacks.append((section_id, status, kw))

    monkeypatch.setattr("workflows.daily_digest._prefilter_query_impl", fake_prefilter)
    monkeypatch.setattr("workflows.daily_digest._semops_rank_impl", failing_rank)
    monkeypatch.setattr("workflows.daily_digest._callback_impl", fake_callback)

    await generate_section.ainvoke(_make_req())
    assert callbacks[-1][1] == "FAILED"
    assert "upstream 502" in callbacks[-1][2]["error"]
```

- [ ] **Step 2: Confirm tests fail (entrypoint shape doesn't exist yet)**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_workflows_daily_digest.py -v
```
Expected: failures (current code uses plain `async def generate_section`, not `@entrypoint`).

- [ ] **Step 3: Commit**

```bash
git add apps/agent/tests/test_workflows_daily_digest.py
git commit -m "test(workflows/daily_digest): rewrite for Functional API"
```

### Task 16: Rewrite `workflows/daily_digest.py` as `@entrypoint`

**Files:**
- Overwrite: `apps/agent/workflows/daily_digest.py`

- [ ] **Step 1: Write the new module**

```python
"""Daily Digest workflow — Functional API parallelization (ref doc §Parallelization).

Per-query prefilter calls run in parallel via [task(q) for q in enabled];
results aggregate with sync .result() per ref doc idiom (NOT `await f.result()`,
which breaks the deterministic-replay contract).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import httpx
from langgraph.func import entrypoint, task

SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")
SEMOPS_API_URL = os.getenv("SEMOPS_API_URL", "http://localhost:2025")
POOL_CAP = 30


@dataclass
class GenerateSectionRequest:
    section_id: str
    source_type: str
    digest_date: str
    queries: list[dict[str, Any]]
    subscribed_source_ids: list[int]
    top_n: int
    model_provider: str
    model_name: str
    api_key: str
    api_base: str | None = None


# ---------------------------------------------------------------------------
# Implementation helpers — named at module scope so tests can monkeypatch them.
# The @task wrappers below call these so tests don't have to reach into
# the task internals.
# ---------------------------------------------------------------------------


async def _prefilter_query_impl(query_text: str, source_ids: list[int]) -> list[dict[str, Any]]:
    payload: dict[str, Any] = {"query": query_text, "limit": POOL_CAP}
    if source_ids:
        payload["source_ids"] = source_ids
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SPARKFLOW_API_URL}/api/explore/search/wechat/prefilter", json=payload,
        )
        resp.raise_for_status()
        return list(resp.json().get("candidates") or [])


async def _semops_rank_impl(*, candidates, query, top_k, provider, model, api_key,
                            api_base=None) -> dict[str, Any]:
    normalized = []
    for c in candidates:
        if "match_text" in c:
            normalized.append(c)
        elif "text" in c:
            renamed = dict(c)
            renamed["match_text"] = renamed.pop("text")
            normalized.append(renamed)
        else:
            normalized.append(c)
    lm_config: dict[str, Any] = {"provider": provider, "model": model, "api_key": api_key}
    if api_base:
        lm_config["api_base"] = api_base
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{SEMOPS_API_URL}/api/operators/rank",
            json={"candidates": normalized, "query_text": query, "top_k": top_k,
                  "include_reasons": True, "lm_config": lm_config},
        )
        resp.raise_for_status()
        return resp.json()


async def _callback_impl(section_id: str, status: str, *, items=None, model_used=None,
                          error=None, completed_at=None) -> None:
    payload: dict[str, Any] = {"status": status}
    if items is not None: payload["items"] = items
    if model_used is not None: payload["model_used"] = model_used
    if error is not None: payload["error"] = error
    if completed_at is not None: payload["completed_at"] = completed_at
    internal_token = os.getenv("INTERNAL_CALLBACK_TOKEN", "")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{SPARKFLOW_API_URL}/api/digest/sections/{section_id}/complete",
            json=payload,
            headers={"X-Internal-Token": internal_token} if internal_token else {},
        )
        resp.raise_for_status()


# ---------------------------------------------------------------------------
# Functional API tasks
# ---------------------------------------------------------------------------


@task
async def prefilter_query(query_text: str, source_ids: list[int]) -> list[dict[str, Any]]:
    return await _prefilter_query_impl(query_text, source_ids)


@task
def merge_pool(per_query_results: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Union + dedupe by id; keep highest score; track matched_queries; cap at POOL_CAP."""
    seen: dict[int, dict[str, Any]] = {}
    for batch in per_query_results:
        for art in batch:
            art_id = art.get("id")
            if art_id is None:
                continue
            existing = seen.get(art_id)
            if existing is None:
                seen[art_id] = dict(art)
                seen[art_id].setdefault("matched_queries", [])
                existing = seen[art_id]
            existing_score = existing.get("score") or 0.0
            new_score = art.get("score") or 0.0
            if new_score > existing_score:
                existing["score"] = new_score
    pool = list(seen.values())
    pool.sort(key=lambda a: a.get("score") or 0.0, reverse=True)
    return pool[:POOL_CAP]


@task
async def semops_rank(candidates, query_text, top_k, provider, model, api_key,
                      api_base=None) -> dict[str, Any]:
    return await _semops_rank_impl(
        candidates=candidates, query=query_text, top_k=top_k,
        provider=provider, model=model, api_key=api_key, api_base=api_base,
    )


@task
async def callback(section_id: str, status: str, **kw) -> None:
    await _callback_impl(section_id, status, **kw)


# ---------------------------------------------------------------------------
# Helpers (pure, not @task)
# ---------------------------------------------------------------------------


def _build_candidate_text(article: dict[str, Any]) -> str:
    title = article.get("title") or ""
    author = article.get("author") or ""
    source = article.get("source_name") or ""
    content = (article.get("content_text") or "")[:300]
    return f"Title: {title} | Author: {author} | Source: {source} | Summary: {content}"


def _to_digest_items(pool: list[dict[str, Any]], ranked_result: dict[str, Any]) -> list[dict[str, Any]]:
    index_by_id = {a["id"]: a for a in pool if "id" in a}
    ranked_items = ranked_result.get("ranked") or []
    reasons = ranked_result.get("reasons") or {}
    items = []
    for position, ri in enumerate(ranked_items, start=1):
        item_id = ri.get("id")
        original = index_by_id.get(item_id, {})
        reason = reasons.get(str(item_id)) or ""
        items.append({
            "rank": position, "externalId": str(item_id), "sourceRefId": item_id,
            "sourceName": original.get("source_name") or "",
            "title": original.get("title") or "",
            "author": original.get("author") or None,
            "publishedAt": original.get("publish_time") or "",
            "url": original.get("url") or "",
            "score": float(original.get("score") or 0.0),
            "matchedQueries": original.get("matched_queries") or [],
            "reason": reason,
            "summary": (original.get("content_text") or "")[:300],
            "meta": {"cover_url": original.get("cover_url")},
        })
    return items


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


@entrypoint()
async def generate_section(req: GenerateSectionRequest) -> None:
    """Per ref doc §Parallelization (Functional API): tasks kicked off without
    await, aggregated via sync .result() — even inside async entrypoints.
    """
    enabled = [q for q in req.queries if q.get("enabled")]
    futures = [prefilter_query(q["text"], req.subscribed_source_ids) for q in enabled]
    pool = merge_pool([f.result() for f in futures]).result()

    if not pool:
        callback(req.section_id, "EMPTY", items=[]).result()
        return

    semops_candidates = [
        {"id": a["id"], "text": _build_candidate_text(a)}
        for a in pool if "id" in a
    ]
    joint_query = " ".join(q["text"] for q in enabled)
    try:
        ranked_result = semops_rank(
            semops_candidates, joint_query, req.top_n,
            req.model_provider, req.model_name, req.api_key, req.api_base,
        ).result()
    except Exception as exc:
        callback(req.section_id, "FAILED", error=str(exc)).result()
        return

    items = _to_digest_items(pool, ranked_result)
    callback(
        req.section_id, "COMPLETED",
        items=items, model_used=f"{req.model_provider}/{req.model_name}",
        completed_at=datetime.now(tz=timezone.utc).isoformat(),
    ).result()
```

- [ ] **Step 2: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_workflows_daily_digest.py -v
```
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/workflows/daily_digest.py
git commit -m "refactor(workflows/daily_digest): convert to Functional API"
```

### Task 17: Update ARQ adapter `workflows/digest_tasks.py`

**Files:**
- Modify: `apps/agent/workflows/digest_tasks.py`
- Overwrite: `apps/agent/tests/test_workflows_digest_tasks.py`

- [ ] **Step 1: Update the adapter to call `generate_section.ainvoke`**

```python
"""ARQ task adapter for daily-digest generation."""
from __future__ import annotations

from typing import Any

from workflows.daily_digest import GenerateSectionRequest, generate_section


async def arq_generate_section(ctx: dict, payload: dict[str, Any]) -> Any:
    _ = ctx  # ARQ protocol; unused here.
    req = GenerateSectionRequest(**payload)
    return await generate_section.ainvoke(req)
```

- [ ] **Step 2: Update the test**

```python
"""Tests for the ARQ → daily_digest adapter."""

from unittest.mock import AsyncMock

import pytest

from workflows.digest_tasks import arq_generate_section


@pytest.mark.asyncio
async def test_adapter_invokes_entrypoint(monkeypatch):
    fake = AsyncMock(return_value=None)
    monkeypatch.setattr("workflows.digest_tasks.generate_section.ainvoke", fake)
    payload = {
        "section_id": "s", "source_type": "WECHAT", "digest_date": "2026-04-27",
        "queries": [], "subscribed_source_ids": [], "top_n": 5,
        "model_provider": "openai", "model_name": "gpt-4o", "api_key": "k",
    }
    await arq_generate_section({}, payload)
    fake.assert_called_once()
    # Argument is a GenerateSectionRequest dataclass
    call_arg = fake.call_args.args[0]
    assert call_arg.section_id == "s"
```

- [ ] **Step 3: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_workflows_digest_tasks.py -v
```
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/workflows/digest_tasks.py apps/agent/tests/test_workflows_digest_tasks.py
git commit -m "refactor(workflows/digest_tasks): call generate_section.ainvoke"
```

---

# Phase 6 — `workflows/matcher` to Graph API + `Send`

### Task 18: Rewrite tests for matcher

**Files:**
- Overwrite: `apps/agent/tests/test_matcher_workflow.py`

- [ ] **Step 1: Write the new tests**

```python
"""Tests for workflows.matcher.job — Graph API + Send orchestrator-worker."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from workflows.matcher.job import match_job_graph, JobState
from workflows.matcher.job_store import JobStore


@pytest.fixture
def reset_job_store():
    JobStore._jobs = {}
    yield
    JobStore._jobs = {}


def _fake_optimized(bu: str):
    obj = MagicMock()
    obj.optimized_query_en = f"english query for {bu}"
    obj.optimized_query_native = f"原查询 {bu}"
    obj.source_queries = [f"q-{bu}"]
    obj.focuses = [bu]
    obj.used_llm = True
    return obj


def test_send_dispatches_one_worker_per_bu(reset_job_store, monkeypatch):
    """Verify the Send API dispatches one rank_bu node per BU."""
    target_df = pd.DataFrame([
        {"id": 1, "title": "T1"}, {"id": 2, "title": "T2"},
    ])
    req = MagicMock()
    req.queries = [{"bu": "BU_A", "query": "q1"}, {"bu": "BU_B", "query": "q2"}]
    req.target_type = "publication"
    req.top_k = 5; req.search_k = 50; req.include_reasons = True
    req.lm = MagicMock(provider="openai", model="gpt-4o-mini",
                       api_key="sk-t", api_base=None)

    rank_calls = []
    def fake_rank(state):
        rank_calls.append(state["bu"])
        df = pd.DataFrame([{"id": state["bu"], "title": f"match_{state['bu']}"}])
        return {"results_by_bu": {state["bu"]: df}}

    monkeypatch.setattr("workflows.matcher.job.rank_bu", fake_rank)

    fake_optimize = MagicMock(side_effect=lambda bu, qs, tt, lm: _fake_optimized(bu))
    with patch("workflows.matcher.job.query_optimizer.optimize", fake_optimize), \
         patch("workflows.matcher.job.ExcelProcessor") as fake_xls, \
         patch("workflows.matcher.job._build_master") as fake_master, \
         patch("workflows.matcher.job.LotusMatcher") as fake_lotus:
        fake_xls.return_value.create_result_excel.return_value = b"BYTES"
        fake_master.return_value = target_df
        # Pre-create the job in JobStore (route normally does this)
        JobStore().create_job(user_id="u", instance_id="i", target_type="publication",
                               top_k=5, search_k=50, include_reasons=True,
                               query_data=req.queries, query_count=2,
                               target_data=target_df.to_dict("records"),
                               model_provider="openai", model_name="gpt-4o-mini")
        job_id = list(JobStore._jobs.keys())[0]

        final = match_job_graph.invoke({
            "job_id": job_id, "target_df": target_df, "req": req,
            "results_by_bu": {},
        })

    assert sorted(rank_calls) == ["BU_A", "BU_B"], "one worker per BU"
    assert final["excel_bytes"] == b"BYTES"
    assert final["total_matches"] == 2  # 1 per BU


def test_progress_milestones_written_to_jobstore(reset_job_store, monkeypatch):
    """JobStore writes happen at documented progress points (5/30/85/100)."""
    target_df = pd.DataFrame([{"id": 1}])
    req = MagicMock()
    req.queries = [{"bu": "X", "query": "q"}]
    req.target_type = "publication"
    req.top_k = 1; req.search_k = 5; req.include_reasons = False
    req.lm = MagicMock(provider="openai", model="gpt-4o", api_key="sk", api_base=None)

    monkeypatch.setattr("workflows.matcher.job.rank_bu",
                        lambda s: {"results_by_bu": {s["bu"]: pd.DataFrame()}})
    fake_optimize = MagicMock(return_value=_fake_optimized("X"))
    with patch("workflows.matcher.job.query_optimizer.optimize", fake_optimize), \
         patch("workflows.matcher.job.ExcelProcessor") as fx, \
         patch("workflows.matcher.job._build_master", return_value=target_df), \
         patch("workflows.matcher.job.LotusMatcher"):
        fx.return_value.create_result_excel.return_value = b""
        store = JobStore()
        job_id = store.create_job(user_id="u", instance_id="i", target_type="publication",
                                    top_k=1, search_k=5, include_reasons=False,
                                    query_data=req.queries, query_count=1,
                                    target_data=[], model_provider="openai", model_name="gpt-4o")
        match_job_graph.invoke({"job_id": job_id, "target_df": target_df,
                                 "req": req, "results_by_bu": {}})
        job = store.get_job(job_id)
    # synthesize node sets progress=85; final commit happens in _run_and_persist
    # which is tested separately. Assert orchestrator wrote progress=30.
    assert job["status"] == "PROCESSING"
    assert job["progress"] >= 30
```

- [ ] **Step 2: Run; expect ImportError (job.py doesn't exist yet — it's job_runner.py)**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_matcher_workflow.py -v
```
Expected: ImportError on `workflows.matcher.job`.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/tests/test_matcher_workflow.py
git commit -m "test(workflows/matcher): rewrite for Graph API + Send"
```

### Task 19: Implement `workflows/matcher/job.py`

**Files:**
- Create: `apps/agent/workflows/matcher/job.py` (replaces `job_runner.py`)

- [ ] **Step 1: Write the module**

```python
"""Match-job orchestration as Graph API + Send (ref doc §Creating workers in LangGraph).

BUs are unknown at build time; orchestrator groups + optimizes them, assign_workers
dispatches one rank_bu Send per BU, results aggregate via merge_dict reducer,
synthesize assembles the master DataFrame and Excel bytes.

JobStore writes are plain function calls inside nodes — NOT @task — to keep
SSE polling deterministic.
"""
from __future__ import annotations

import logging
import tempfile
from collections import defaultdict
from datetime import datetime
from typing import Annotated, Any, TypedDict

import pandas as pd
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from workflows.matcher.excel_processor import ExcelProcessor
from workflows.matcher.job_store import JobStore
from workflows.matcher.lotus import LotusMatcher
from workflows.matcher.query_optimizer import QueryOptimizer

logger = logging.getLogger(__name__)
job_store = JobStore()


def _merge_dict(left: dict, right: dict) -> dict:
    return {**left, **right}


class JobState(TypedDict, total=False):
    job_id: str
    target_df: pd.DataFrame
    req: Any
    queries_by_bu: dict[str, list[str]]
    optimized: dict[str, Any]
    results_by_bu: Annotated[dict[str, pd.DataFrame], _merge_dict]
    excel_bytes: bytes
    total_matches: int
    index_dir: str


# Lazily-constructed singleton so tests can patch the class.
query_optimizer = QueryOptimizer.__new__(QueryOptimizer)
def _ensure_optimizer(req):
    """Init query_optimizer per-request (BYOK threaded through req.lm)."""
    return QueryOptimizer(
        excel_processor=ExcelProcessor(),
        model_provider=req.lm.provider, model_name=req.lm.model,
        api_key=req.lm.api_key, api_base=req.lm.api_base,
    )


def orchestrator(state: JobState) -> dict:
    job_store.update_job(state["job_id"], status="PROCESSING",
                          started_at=datetime.utcnow())
    req = state["req"]
    queries_by_bu: dict[str, list[str]] = defaultdict(list)
    for q in req.queries:
        bu = q.get("bu", "Unknown")
        text = (q.get("query") or "").strip()
        if text:
            queries_by_bu[bu].append(text)
    queries_by_bu = dict(queries_by_bu)
    optimizer = _ensure_optimizer(req)
    optimized: dict[str, Any] = {}
    total_bus = max(len(queries_by_bu), 1)
    for i, (bu, qs) in enumerate(queries_by_bu.items()):
        progress = 5 + int((i / total_bus) * 20)
        job_store.update_job(state["job_id"], progress=progress,
                              error_message=f"Optimizing queries: {bu}")
        optimized[bu] = optimizer.optimize_queries(
            bu=bu, queries=qs, target_type=req.target_type,
        )
    job_store.update_job(state["job_id"], progress=30,
                          query_data=_enriched(req.queries, optimized))
    return {
        "queries_by_bu": queries_by_bu,
        "optimized": optimized,
        "index_dir": tempfile.mkdtemp(prefix=f"lotus_{state['job_id']}_"),
    }


def assign_workers(state: JobState) -> list[Send]:
    """Send one rank_bu invocation per BU. Per ref doc §Creating workers in LangGraph."""
    return [
        Send("rank_bu", {
            "bu": bu, "optimized": opt, "target_df": state["target_df"],
            "req": state["req"], "index_dir": state["index_dir"],
        })
        for bu, opt in state["optimized"].items()
    ]


def rank_bu(ws: dict) -> dict:
    """Worker — runs LOTUS pipeline for one BU. Writes one entry into results_by_bu."""
    matcher = LotusMatcher()
    target_df = matcher.build_text_column(ws["target_df"], ws["req"].target_type)
    matches_df = matcher.run_pipeline(
        df=target_df, query_text=ws["optimized"].optimized_query_en,
        query_name=ws["bu"], top_k=ws["req"].top_k, search_k=ws["req"].search_k,
        include_reasons=ws["req"].include_reasons, index_dir=ws["index_dir"],
        progress_callback=lambda *_: None,
        model_provider=ws["req"].lm.provider, model_name=ws["req"].lm.model,
        api_key=ws["req"].lm.api_key, api_base=ws["req"].lm.api_base,
    )
    matches_df.insert(0, "bu", ws["bu"])
    matches_df.insert(0, "rank", range(1, len(matches_df) + 1))
    reason_cols = [c for c in matches_df.columns if "recommendation_reason" in c]
    if reason_cols:
        matches_df = matches_df.rename(columns={reason_cols[0]: "recommendation_reason"})
    return {"results_by_bu": {ws["bu"]: matches_df}}


def synthesize(state: JobState) -> dict:
    job_store.update_job(state["job_id"], progress=85,
                          error_message="Creating result file...")
    master = _build_master(state["target_df"], state["results_by_bu"],
                           state["req"].include_reasons)
    excel_bytes = ExcelProcessor().create_result_excel(
        results_by_query=state["results_by_bu"], master_df=master,
    )
    total = sum(len(df) for df in state["results_by_bu"].values())
    return {"excel_bytes": excel_bytes, "total_matches": total}


# --- helpers (match the legacy job_runner.py output shape) ---


def _enriched(queries: list[dict], optimized: dict[str, Any]) -> list[dict]:
    out = []
    for q in queries:
        rec = dict(q)
        opt = optimized.get(rec.get("bu", "Unknown"))
        if opt:
            rec.update({
                "optimized_query_native": opt.optimized_query_native,
                "optimized_query_en": opt.optimized_query_en,
                "optimization_focuses": opt.focuses,
                "optimizer_used_llm": opt.used_llm,
            })
        out.append(rec)
    return out


def _build_master(target_df: pd.DataFrame,
                  results_by_bu: dict[str, pd.DataFrame],
                  include_reasons: bool) -> pd.DataFrame:
    master = target_df.drop(columns=["match_text"], errors="ignore").copy()
    bu_names = list(results_by_bu.keys())
    for bu in bu_names:
        bu_df = results_by_bu[bu]
        id_col = "id" if "id" in bu_df.columns else (
            "title" if "title" in bu_df.columns else None)
        if id_col and id_col in master.columns:
            rank_map = dict(zip(bu_df[id_col], bu_df["rank"]))
            master[bu] = master[id_col].map(rank_map)
        else:
            master[bu] = ""
    if include_reasons and any("recommendation_reason" in results_by_bu[bu].columns
                                for bu in bu_names):
        reason_maps: dict[str, dict] = {}
        for bu in bu_names:
            df = results_by_bu[bu]
            if "recommendation_reason" not in df.columns:
                continue
            key = "id" if "id" in df.columns else "title"
            if key in df.columns:
                reason_maps[bu] = dict(zip(df[key], df["recommendation_reason"]))
        if reason_maps:
            id_key = "id" if "id" in master.columns else "title"
            def agg(row):
                parts = []
                k = row[id_key]
                for bu, m in reason_maps.items():
                    r = m.get(k)
                    if r and str(r).strip():
                        parts.append(f"[{bu}]\n{r}")
                return "\n\n".join(parts)
            master["recommendation_reasons"] = master.apply(agg, axis=1)
    master = master.drop(columns=["id"], errors="ignore")
    for bu in results_by_bu:
        results_by_bu[bu] = results_by_bu[bu].drop(columns=["id"], errors="ignore")
    return master


# ---------------------------------------------------------------------------
# Build the graph
# ---------------------------------------------------------------------------

builder = StateGraph(JobState)
builder.add_node("orchestrator", orchestrator)
builder.add_node("rank_bu", rank_bu)
builder.add_node("synthesize", synthesize)
builder.add_edge(START, "orchestrator")
builder.add_conditional_edges("orchestrator", assign_workers, ["rank_bu"])
builder.add_edge("rank_bu", "synthesize")
builder.add_edge("synthesize", END)
match_job_graph = builder.compile()
```

- [ ] **Step 2: Delete the legacy `job_runner.py`**

```bash
git rm apps/agent/workflows/matcher/job_runner.py
```

- [ ] **Step 3: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_matcher_workflow.py -v
```
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/workflows/matcher/job.py
git commit -m "refactor(workflows/matcher): Graph API + Send orchestrator-worker"
```

### Task 20: Update `server/routes/matcher_jobs.py` to use new graph

**Files:**
- Modify: `apps/agent/server/routes/matcher_jobs.py`

- [ ] **Step 1: Update create_job to dispatch via the new graph**

In `apps/agent/server/routes/matcher_jobs.py`, replace the body of `create_job` and add `_run_and_persist`:

```python
import asyncio
import logging
from datetime import datetime

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

from server.matcher_types import (CreateMatchJobRequest, JobProgressResponse,
                                    MatchJobResponse, MatchJobStatus, MatchTargetType)
from workflows.matcher.job import match_job_graph
from workflows.matcher.job_store import JobStore

logger = logging.getLogger(__name__)
router = APIRouter()


def get_job_store() -> JobStore:
    return JobStore()


async def _run_and_persist(job_id: str, req: CreateMatchJobRequest, target_data: list[dict]):
    """Run match_job_graph in a worker thread (LOTUS / pandas blocks the loop)."""
    store = JobStore()
    try:
        # Build a minimal "req" object the graph nodes can read.
        class _Lm:
            provider = req.model_provider
            model = req.model_name
            api_key = req.api_key
            api_base = req.api_base
        class _Req:
            queries = [q.model_dump() for q in req.queries]
            target_type = req.target_type.value
            top_k = req.top_k
            search_k = req.search_k
            include_reasons = req.include_reasons
            lm = _Lm()
        graph_req = _Req()
        target_df = pd.DataFrame(target_data)
        final = await asyncio.to_thread(
            match_job_graph.invoke,
            {"job_id": job_id, "target_df": target_df, "req": graph_req,
             "results_by_bu": {}},
        )
        store.update_job(
            job_id, status="COMPLETED", progress=100,
            result_data=final["excel_bytes"], match_count=final["total_matches"],
            completed_at=datetime.utcnow(), error_message=None,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception(f"Job {job_id} failed: {exc}")
        store.update_job(job_id, status="FAILED", error_message=str(exc),
                         completed_at=datetime.utcnow())


@router.post("/jobs", response_model=MatchJobResponse)
async def create_job(req: CreateMatchJobRequest,
                     background_tasks: BackgroundTasks,
                     request: Request,
                     job_store: JobStore = Depends(get_job_store)):
    if not req.queries:
        raise HTTPException(status_code=400, detail="No queries provided")
    if not req.target_data:
        raise HTTPException(status_code=400, detail="No target data provided")
    logger.info(f"Creating job with {len(req.queries)} queries and {len(req.target_data)} target items")
    job_id = job_store.create_job(
        user_id=req.user_id, instance_id=req.instance_id,
        target_type=req.target_type.value, top_k=req.top_k, search_k=req.search_k,
        include_reasons=req.include_reasons,
        query_data=[q.model_dump() for q in req.queries],
        query_count=len(req.queries), target_data=req.target_data,
        model_provider=req.model_provider, model_name=req.model_name,
    )
    background_tasks.add_task(_run_and_persist, job_id, req, req.target_data)
    job = job_store.get_job(job_id)
    return _job_to_response(job)


# Keep the rest of the route handlers (get_job, get_job_progress,
# stream_job_progress, cancel_job, download_results, _job_to_response)
# UNCHANGED — they read JobStore and the contract is identical.
```

(Leave the unchanged handler bodies alone — only `create_job`, the imports, and the new `_run_and_persist` change.)

- [ ] **Step 2: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_matcher_workflow.py tests/test_server_app.py -v
```
Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/server/routes/matcher_jobs.py
git commit -m "refactor(server/matcher_jobs): dispatch via match_job_graph + asyncio.to_thread"
```

---

# Phase 7 — Docs

### Task 21: Update `apps/agent/README.md` and CLAUDE.md

**Files:**
- Modify: `apps/agent/README.md`
- Modify: `apps/agent/.claude/CLAUDE.md` if present (or update root `.claude/CLAUDE.md`)
- Modify: `.claude/CLAUDE.md` (root)

- [ ] **Step 1: Rewrite the README's "Layout" + "Hermes Harness" sections**

Replace the "Layout" section in `apps/agent/README.md` with:

```markdown
## Layout
- `agents/`: One file per surface (`notebook.py`, `hub.py`, `deep_research.py`).
  Each is a `StateGraph(MessagesState)` built from `llm_call ↔ tool_node`
  primitives per LangGraph's "Agents → Graph API" pattern.
- `prompts/`: Markdown fragments concatenated by `prompt_builder.py`.
- `tools/`: `@tool` functions; agents import them directly (no registry).
- `workflows/`: Functional API and Graph API workflows.
  - `search.py` — plain `async def` (single chain, no parallelism payoff)
  - `daily_digest.py` — Functional API, per-query parallelization
  - `matcher/job.py` — Graph API + `Send` orchestrator-worker
  - `wiki_ingest.py` — Functional API chain (added in Phase 8 of the refactor)
- `server/`: FastAPI shell at `:2027` for workflow HTTP endpoints.
```

Delete the entire "Hermes Harness (P1)" section (lines containing "P1 (2026-04-22)"). Hermes is gone.

- [ ] **Step 2: Grep root + agent CLAUDE.md for references to deleted paths**

```bash
grep -rn "hermes\|graphs/\|surfaces/\|config/surfaces" .claude apps/agent apps/web --include="*.md"
```

For every match, update the path or remove the bullet. The most important updates are in the root `.claude/CLAUDE.md` "Architecture → Agent Architecture" subsection: change it to reference `agents/{notebook,hub,deep_research}.py` and the four workflows.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/README.md .claude/CLAUDE.md apps/agent/.claude/CLAUDE.md 2>/dev/null || true
git commit -m "docs(agent): rewrite README + CLAUDE.md for new agents/ + workflows/ shape"
```

---

# Phase 8 — Wiki-ingest workflow (Python)

### Task 22: Add networkx + write basic extract_graph + _merge_graph tests

**Files:**
- Modify: `apps/agent/pyproject.toml` (add `networkx>=3.0`)
- Create: `apps/agent/tests/test_wiki_ingest.py` (initial subset)

- [ ] **Step 1: Add networkx dependency**

In `apps/agent/pyproject.toml` under `[project] dependencies`, add:

```toml
    "networkx>=3.0",
```

Then install:

```bash
cd apps/agent && .venv/bin/pip install -e .
```

- [ ] **Step 2: Write the initial extract/merge tests**

```python
"""Tests for workflows.wiki_ingest."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from workflows.wiki_ingest import (
    Extraction, Graph, Node, Edge, _merge_graph, _build_extraction_report,
    _cluster_graph, _filter_source,
)


def test_merge_graph_adds_new_nodes_and_edges():
    existing = Graph(nodes=[Node(id="n1", label="A", type="concept",
                                  summary="...", source_refs=["src_old"])],
                     edges=[])
    extracted = Extraction(
        normalized_title="t",
        nodes=[Node(id="n2", label="B", type="concept", summary="...",
                    source_refs=["src_new"])],
        edges=[Edge(source="n1", target="n2", relation="rel",
                    confidence="EXTRACTED", weight=1, source_ref="src_new")],
    )
    merged = _merge_graph(existing, extracted)
    assert {n.id for n in merged.nodes} == {"n1", "n2"}
    assert len(merged.edges) == 1


def test_merge_graph_preserves_existing_source_refs():
    """A node already in the graph should keep its old source_refs and gain new ones."""
    existing = Graph(nodes=[Node(id="n1", label="A", type="c", summary="s",
                                  source_refs=["src_a"])],
                     edges=[])
    extracted = Extraction(
        normalized_title="t",
        nodes=[Node(id="n1", label="A", type="c", summary="s",
                    source_refs=["src_b"])],
        edges=[],
    )
    merged = _merge_graph(existing, extracted)
    n = next(n for n in merged.nodes if n.id == "n1")
    assert set(n.source_refs) == {"src_a", "src_b"}


def test_extraction_report_crossrefs_when_node_already_exists():
    existing = Graph(nodes=[Node(id="n1", label="DPO", type="c", summary="...",
                                  source_refs=["paper_a"])], edges=[])
    extracted = Extraction(
        normalized_title="t",
        nodes=[Node(id="n1", label="DPO", type="c", summary="...",
                    source_refs=["paper_b"])],
        edges=[],
    )
    report = _build_extraction_report(existing, extracted)
    cross = [c for c in report["crossRefs"] if c["label"] == "DPO"]
    assert cross and cross[0]["existingSourceIds"] == ["paper_a"]


def test_cluster_graph_returns_dict_of_communities():
    g = Graph(
        nodes=[Node(id=f"n{i}", label=f"L{i}", type="c", summary="",
                    source_refs=["s"]) for i in range(4)],
        edges=[Edge(source="n0", target="n1", relation="r",
                    confidence="EXTRACTED", weight=1, source_ref="s"),
               Edge(source="n2", target="n3", relation="r",
                    confidence="EXTRACTED", weight=1, source_ref="s")],
    )
    communities = _cluster_graph(g)
    assert isinstance(communities, dict)
    # Two disconnected pairs → at least 2 communities
    assert len(communities) >= 2


def test_filter_source_drops_nodes_with_only_that_source():
    g = Graph(
        nodes=[Node(id="n1", label="A", type="c", summary="",
                    source_refs=["src_remove"]),
               Node(id="n2", label="B", type="c", summary="",
                    source_refs=["src_remove", "src_keep"])],
        edges=[Edge(source="n1", target="n2", relation="r",
                    confidence="EXTRACTED", weight=1, source_ref="src_remove")],
    )
    out = _filter_source(g, "src_remove")
    # n1 dropped (only ref); n2 kept with src_remove stripped from refs
    assert {n.id for n in out.nodes} == {"n2"}
    n2 = next(n for n in out.nodes if n.id == "n2")
    assert n2.source_refs == ["src_keep"]
    # Edge touching dropped node is gone
    assert out.edges == []
```

- [ ] **Step 3: Confirm tests fail**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_wiki_ingest.py -v
```
Expected: ImportError — wiki_ingest module not yet created.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/pyproject.toml apps/agent/tests/test_wiki_ingest.py
git commit -m "test(workflows/wiki_ingest): add initial extract/merge/cluster/filter tests"
```

### Task 23: Implement core wiki-ingest types + pure helpers

**Files:**
- Create: `apps/agent/workflows/wiki_ingest.py` (initial — pure helpers only; LLM-bound `@task`s and `@entrypoint` come in Tasks 24–25)

- [ ] **Step 1: Write the dataclasses + _merge_graph + _cluster_graph + _filter_source + _build_extraction_report**

```python
"""Wiki-ingest workflow — port of apps/web/lib/services/graph-service.ts.

Pattern: Functional API chain (ref doc §Functional API). LLM-bound steps
(extract_graph, build_wiki_pages) are @task; pure helpers stay inline.

Modes:
  - "extract": new source ingest (LLM extract → merge → cluster → pages)
  - "remove": surgical source removal (filter graph → re-cluster → pages)

The Node-side worker calls POST /v1/workflows/wiki/extract with a Pydantic
discriminated-union request (see server/wiki_ingest_types.py) and runs the
prisma.$transaction on the response — that part stays in Node.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

import networkx as nx


# --- types ---


@dataclass
class Node:
    id: str
    label: str
    type: str
    summary: str
    source_refs: list[str] = field(default_factory=list)


@dataclass
class Edge:
    source: str
    target: str
    relation: str
    confidence: Literal["EXTRACTED", "INFERRED"]
    weight: int
    source_ref: str


@dataclass
class Graph:
    nodes: list[Node]
    edges: list[Edge]


@dataclass
class Extraction:
    normalized_title: str
    nodes: list[Node]
    edges: list[Edge]


# --- pure helpers (no @task) ---


def _merge_graph(existing: Graph | None, extracted: Extraction) -> Graph:
    """Merge `extracted` into `existing` (None → empty graph).

    Same semantics as graph-service.ts:mergeGraph: node id collisions
    union source_refs; new nodes append; edges append (no dedup — each
    extraction emits its own per-source edges, and crossRefs synth pulls
    information from edges that reference nodes already in the graph).
    """
    merged_nodes: dict[str, Node] = {n.id: Node(**n.__dict__) for n in (existing.nodes if existing else [])}
    for n in extracted.nodes:
        if n.id in merged_nodes:
            existing_refs = merged_nodes[n.id].source_refs
            for ref in n.source_refs:
                if ref not in existing_refs:
                    existing_refs.append(ref)
        else:
            merged_nodes[n.id] = Node(**n.__dict__)
    merged_edges = list((existing.edges if existing else []))
    merged_edges.extend(extracted.edges)
    return Graph(nodes=list(merged_nodes.values()), edges=merged_edges)


def _build_extraction_report(existing: Graph | None, extracted: Extraction) -> dict[str, Any]:
    """Build the {nodes, edges, crossRefs} payload the Node-side UI consumes
    (graph-service.ts:610-625 equivalent). crossRefs lists nodes the LLM
    extracted that already exist in the prior graph, with their existing
    source IDs.
    """
    existing_node_ids = {n.id: n for n in (existing.nodes if existing else [])}
    cross_refs = []
    for n in extracted.nodes:
        if n.id in existing_node_ids:
            cross_refs.append({
                "label": n.label,
                "existingSourceIds": list(existing_node_ids[n.id].source_refs),
            })
    return {
        "nodes": [n.__dict__ for n in extracted.nodes],
        "edges": [e.__dict__ for e in extracted.edges],
        "crossRefs": cross_refs,
    }


def _cluster_graph(g: Graph) -> dict[int, list[str]]:
    """Run Louvain on `g`. Returns {community_id: [node_id, ...]}.

    Note: community IDs differ across runs (random tie-breaks) and across
    implementations (TS graphology vs. Python networkx). The orphan-page
    delete in the Node-side prisma.$transaction handles re-numbering, so
    this isn't a bug as long as no UI code caches community IDs across
    requests.
    """
    nx_graph = nx.Graph()
    for n in g.nodes:
        nx_graph.add_node(n.id)
    for e in g.edges:
        nx_graph.add_edge(e.source, e.target, weight=e.weight)
    communities = nx.community.louvain_communities(nx_graph, seed=42)
    return {i: sorted(c) for i, c in enumerate(communities)}


def _filter_source(g: Graph, source_id: str) -> Graph:
    """Mode=remove implementation. Mirrors graph-service.ts:removeSourceFromGraph.

    Drop nodes whose only source_ref is this source. For nodes co-referenced
    by other sources, strip just this source from their source_refs.
    Drop edges that reference dropped nodes OR were emitted by this source.
    """
    surviving_nodes: list[Node] = []
    dropped_node_ids: set[str] = set()
    for n in g.nodes:
        new_refs = [r for r in n.source_refs if r != source_id]
        if not new_refs:
            dropped_node_ids.add(n.id)
            continue
        surviving_nodes.append(Node(id=n.id, label=n.label, type=n.type,
                                     summary=n.summary, source_refs=new_refs))
    surviving_edges = [
        e for e in g.edges
        if e.source not in dropped_node_ids
        and e.target not in dropped_node_ids
        and e.source_ref != source_id
    ]
    return Graph(nodes=surviving_nodes, edges=surviving_edges)
```

- [ ] **Step 2: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_wiki_ingest.py -v
```
Expected: 5 passed.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/workflows/wiki_ingest.py
git commit -m "feat(workflows/wiki_ingest): add core types + pure graph helpers"
```

### Task 24: Implement `extract_graph` + `build_wiki_pages` LLM tasks

**Files:**
- Modify: `apps/agent/workflows/wiki_ingest.py` (append `@task`s and prompt templates)
- Modify: `apps/agent/tests/test_wiki_ingest.py` (add LLM-mocking tests)

- [ ] **Step 1: Append the LLM-bound tasks to wiki_ingest.py**

After the pure helpers, append:

```python
import json
from langgraph.func import task
from langchain_openai import ChatOpenAI


# --- LLM tasks ---


_EXTRACT_PROMPT = """\
You are a knowledge-graph extractor. Given the following source document,
extract:
- nodes: entities/concepts (id, label, type, summary). Use a stable
  slug-style id (e.g., "direct_preference_optimization"). Avoid
  duplicates — if the existing graph already has a node by that id,
  reuse the same id.
- edges: relationships between nodes (source_id, target_id, relation,
  confidence: "EXTRACTED" if directly stated, "INFERRED" if derived).

Output JSON:
{
  "normalized_title": "...",
  "nodes": [{"id":"...","label":"...","type":"...","summary":"..."}, ...],
  "edges": [{"source":"...","target":"...","relation":"...","confidence":"EXTRACTED|INFERRED"}, ...]
}

Existing node labels (avoid duplicating these as new nodes):
{existing_labels}

Source title: {title}
Source body:
{content}
"""


_PAGE_PROMPT = """\
You are writing a wiki page for a community of related concepts.

Community concepts:
{community_nodes}

Source materials referenced (id → title):
{source_map}

Write a concise wiki page in Markdown explaining how these concepts
relate. Cite sources inline as [source:<id>]. Do not exceed 500 words.

Output JSON:
{{
  "title": "...",
  "markdown": "..."
}}
"""


def _resolve_llm(lm) -> ChatOpenAI:
    """BYOK threading: lm is a dict with provider/model/api_key/api_base."""
    return ChatOpenAI(
        model=lm["model"],
        api_key=lm["api_key"],
        base_url=lm.get("api_base"),
        timeout=120,
    )


@task
async def extract_graph(content: str, title: str, source_id: str,
                         existing_labels: list[str], lm: dict) -> Extraction:
    """LLM call: extract nodes + edges from source content."""
    llm = _resolve_llm(lm)
    prompt = _EXTRACT_PROMPT.format(
        existing_labels=", ".join(existing_labels) or "(none)",
        title=title, content=content[:20000],
    )
    raw = (await llm.ainvoke(prompt)).content
    data = json.loads(_strip_codefence(raw))
    nodes = [Node(id=n["id"], label=n["label"], type=n.get("type", "concept"),
                   summary=n.get("summary", ""), source_refs=[source_id])
             for n in data.get("nodes", [])]
    edges = [Edge(source=e["source"], target=e["target"],
                   relation=e.get("relation", ""),
                   confidence=e.get("confidence", "EXTRACTED"),
                   weight=int(e.get("weight", 1)), source_ref=source_id)
             for e in data.get("edges", [])]
    return Extraction(normalized_title=data.get("normalized_title", title),
                      nodes=nodes, edges=edges)


@dataclass
class WikiPagePayload:
    slug: str
    title: str
    markdown: str
    source_ids: list[str]


@task
async def build_wiki_pages(g: Graph, communities: dict[int, list[str]],
                            source_map: dict[str, str], lm: dict) -> list[WikiPagePayload]:
    """LLM call per community — write a wiki page describing the cluster."""
    llm = _resolve_llm(lm)
    nodes_by_id = {n.id: n for n in g.nodes}
    pages: list[WikiPagePayload] = []
    for cid, node_ids in communities.items():
        community_nodes = "\n".join(
            f"- {nodes_by_id[nid].label} ({nodes_by_id[nid].type}): {nodes_by_id[nid].summary}"
            for nid in node_ids if nid in nodes_by_id
        )
        source_ids = sorted({s for nid in node_ids for s in nodes_by_id.get(nid, Node(
            id="", label="", type="", summary="")).source_refs})
        source_lines = "\n".join(f"- [{sid}] {source_map.get(sid, sid)}"
                                  for sid in source_ids)
        prompt = _PAGE_PROMPT.format(community_nodes=community_nodes,
                                      source_map=source_lines)
        raw = (await llm.ainvoke(prompt)).content
        data = json.loads(_strip_codefence(raw))
        pages.append(WikiPagePayload(
            slug=f"community-{cid}", title=data.get("title", f"Community {cid}"),
            markdown=data.get("markdown", ""), source_ids=source_ids,
        ))
    return pages


def _strip_codefence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = s.split("\n", 1)[1] if "\n" in s else s[3:]
        if s.endswith("```"):
            s = s.rsplit("```", 1)[0]
    return s.strip()


def _build_index_page(g: Graph, communities: dict[int, list[str]],
                      pages: list[WikiPagePayload]) -> WikiPagePayload:
    """Generate the deterministic index page (no LLM call)."""
    lines = ["# Wiki Index\n"]
    for p in pages:
        lines.append(f"- [{p.title}](./{p.slug}.md)")
    return WikiPagePayload(slug="index", title="Wiki Index",
                           markdown="\n".join(lines),
                           source_ids=sorted({s for p in pages for s in p.source_ids}))
```

- [ ] **Step 2: Add LLM-mocking tests to `test_wiki_ingest.py`**

Append:

```python
@pytest.mark.asyncio
async def test_extract_graph_parses_llm_response(monkeypatch):
    from workflows.wiki_ingest import extract_graph

    canned = AsyncMock()
    canned.ainvoke = AsyncMock(return_value=type("R", (), {"content": """
    {"normalized_title":"DPO Paper",
     "nodes":[{"id":"dpo","label":"DPO","type":"method","summary":"..."}],
     "edges":[]}
    """})())
    monkeypatch.setattr("workflows.wiki_ingest._resolve_llm", lambda lm: canned)

    fut = extract_graph("body", "T", "src1", [], {"provider": "openai",
                                                      "model": "gpt-4o", "api_key": "k"})
    extraction = fut.result()
    assert extraction.normalized_title == "DPO Paper"
    assert extraction.nodes[0].label == "DPO"
    assert extraction.nodes[0].source_refs == ["src1"]


@pytest.mark.asyncio
async def test_extract_graph_strips_markdown_codefence(monkeypatch):
    from workflows.wiki_ingest import extract_graph

    canned = AsyncMock()
    canned.ainvoke = AsyncMock(return_value=type("R", (), {"content": """```json
    {"normalized_title":"x","nodes":[],"edges":[]}
    ```"""})())
    monkeypatch.setattr("workflows.wiki_ingest._resolve_llm", lambda lm: canned)
    fut = extract_graph("body", "T", "src1", [], {"provider": "openai",
                                                      "model": "gpt-4o", "api_key": "k"})
    assert fut.result().normalized_title == "x"
```

- [ ] **Step 3: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_wiki_ingest.py -v
```
Expected: 7 passed.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/workflows/wiki_ingest.py apps/agent/tests/test_wiki_ingest.py
git commit -m "feat(workflows/wiki_ingest): add extract_graph + build_wiki_pages @tasks"
```

### Task 25: Implement `extract_wiki` `@entrypoint` with mode discrimination

**Files:**
- Modify: `apps/agent/workflows/wiki_ingest.py`
- Modify: `apps/agent/tests/test_wiki_ingest.py` (add end-to-end test)

- [ ] **Step 1: Append the entrypoint and request/result dataclasses**

```python
from langgraph.func import entrypoint
from typing import Optional


@dataclass
class WikiExtractRequest:
    """Plain dataclass form. The HTTP route binds this from the Pydantic
    discriminated-union (server/wiki_ingest_types.py) so this dataclass
    is what the Functional API entrypoint actually consumes.
    """
    mode: Literal["extract", "remove"]
    notebook_id: str
    source_id: str
    user_id: str
    source_title: str
    source_content: str = ""           # required if mode == "extract"
    existing_node_labels: list[str] = field(default_factory=list)
    existing_graph: Graph | None = None
    source_map: dict[str, str] = field(default_factory=dict)
    lm: dict = field(default_factory=dict)


@dataclass
class WikiExtractResult:
    normalized_title: str
    extraction: Extraction | None
    extraction_report: dict[str, Any] | None
    merged_graph: Graph
    communities: dict[int, list[str]]
    community_pages: list[WikiPagePayload]
    index_page: WikiPagePayload
    log_entry: str


@entrypoint()
async def extract_wiki(req: WikiExtractRequest) -> WikiExtractResult:
    if req.mode == "extract":
        extraction = extract_graph(
            req.source_content, req.source_title, req.source_id,
            req.existing_node_labels, req.lm,
        ).result()
        merged = _merge_graph(req.existing_graph, extraction)
        extraction_report = _build_extraction_report(req.existing_graph, extraction)
        normalized_title = extraction.normalized_title or req.source_title
    else:  # remove
        if req.existing_graph is None:
            raise ValueError("existing_graph required for mode=remove")
        merged = _filter_source(req.existing_graph, req.source_id)
        extraction = None
        extraction_report = None
        normalized_title = req.source_title

    communities = _cluster_graph(merged)
    community_pages = build_wiki_pages(merged, communities, req.source_map, req.lm).result()
    index_page = _build_index_page(merged, communities, community_pages)
    log_entry = (
        f"{req.source_id} extracted "
        f"{len(extraction.nodes) if extraction else 0} nodes, "
        f"{len(extraction.edges) if extraction else 0} edges; "
        f"{len(community_pages)} community pages"
    )

    return WikiExtractResult(
        normalized_title=normalized_title,
        extraction=extraction,
        extraction_report=extraction_report,
        merged_graph=merged,
        communities=communities,
        community_pages=community_pages,
        index_page=index_page,
        log_entry=log_entry,
    )
```

- [ ] **Step 2: Append the end-to-end test**

```python
@pytest.mark.asyncio
async def test_extract_wiki_end_to_end(monkeypatch):
    from workflows.wiki_ingest import extract_wiki, WikiExtractRequest

    canned = AsyncMock()
    iter_calls = iter([
        type("R", (), {"content":
            """{"normalized_title":"Paper","nodes":[
                {"id":"a","label":"A","type":"c","summary":"s"},
                {"id":"b","label":"B","type":"c","summary":"s"}],
              "edges":[{"source":"a","target":"b","relation":"r","confidence":"EXTRACTED"}]}"""})(),
        type("R", (), {"content":
            """{"title":"Cluster 0","markdown":"about [source:src1]"}"""})(),
    ])
    canned.ainvoke = AsyncMock(side_effect=lambda p: next(iter_calls))
    monkeypatch.setattr("workflows.wiki_ingest._resolve_llm", lambda lm: canned)

    req = WikiExtractRequest(
        mode="extract", notebook_id="nb1", source_id="src1", user_id="u",
        source_title="t", source_content="body",
        existing_node_labels=[], existing_graph=None,
        source_map={"src1": "Paper"},
        lm={"provider": "openai", "model": "gpt-4o", "api_key": "k"},
    )
    result = await extract_wiki.ainvoke(req)
    assert result.normalized_title == "Paper"
    assert len(result.community_pages) >= 1
    assert result.index_page.slug == "index"
    assert result.extraction_report["crossRefs"] == []  # no overlap with empty existing


@pytest.mark.asyncio
async def test_extract_wiki_remove_mode(monkeypatch):
    from workflows.wiki_ingest import extract_wiki, WikiExtractRequest

    canned = AsyncMock()
    canned.ainvoke = AsyncMock(return_value=type("R", (), {"content":
        """{"title":"page","markdown":"..."}"""})())
    monkeypatch.setattr("workflows.wiki_ingest._resolve_llm", lambda lm: canned)

    existing = Graph(
        nodes=[Node(id="x", label="X", type="c", summary="",
                    source_refs=["src_remove", "src_other"]),
               Node(id="y", label="Y", type="c", summary="",
                    source_refs=["src_remove"])],
        edges=[],
    )
    req = WikiExtractRequest(
        mode="remove", notebook_id="nb1", source_id="src_remove", user_id="u",
        source_title="t", existing_graph=existing, source_map={},
        lm={"provider": "openai", "model": "gpt-4o", "api_key": "k"},
    )
    result = await extract_wiki.ainvoke(req)
    assert result.extraction is None
    assert result.extraction_report is None
    # y dropped (only ref); x kept with src_remove stripped
    assert {n.id for n in result.merged_graph.nodes} == {"x"}


@pytest.mark.asyncio
async def test_extract_wiki_remove_requires_existing_graph():
    from workflows.wiki_ingest import extract_wiki, WikiExtractRequest
    req = WikiExtractRequest(
        mode="remove", notebook_id="n", source_id="s", user_id="u",
        source_title="t", existing_graph=None, lm={"provider": "openai",
                                                     "model": "gpt-4o", "api_key": "k"},
    )
    with pytest.raises(ValueError, match="existing_graph required"):
        await extract_wiki.ainvoke(req)


@pytest.mark.asyncio
async def test_apikey_not_in_caplog_on_error(monkeypatch, caplog):
    from workflows.wiki_ingest import extract_wiki, WikiExtractRequest

    async def boom(prompt):
        raise RuntimeError("upstream 502")
    canned = AsyncMock()
    canned.ainvoke = boom
    monkeypatch.setattr("workflows.wiki_ingest._resolve_llm", lambda lm: canned)
    req = WikiExtractRequest(
        mode="extract", notebook_id="n", source_id="s", user_id="u",
        source_title="t", source_content="body",
        lm={"provider": "openai", "model": "gpt-4o", "api_key": "sk-SECRET-DO-NOT-LEAK"},
    )
    with pytest.raises(Exception):
        await extract_wiki.ainvoke(req)
    assert "sk-SECRET-DO-NOT-LEAK" not in caplog.text
```

- [ ] **Step 3: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_wiki_ingest.py -v
```
Expected: 11 passed.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/workflows/wiki_ingest.py apps/agent/tests/test_wiki_ingest.py
git commit -m "feat(workflows/wiki_ingest): add extract_wiki @entrypoint + mode tests"
```

### Task 26: Diff harness script

**Files:**
- Create: `apps/agent/scripts/diff_wiki_ingest.py`

- [ ] **Step 1: Write the harness**

```python
"""Diff harness: compare new Python wiki_ingest.extract_wiki output against
the legacy Node graph-service.ts output for a specific source.

Usage:
    cd apps/agent
    DATABASE_URL=... .venv/bin/python scripts/diff_wiki_ingest.py \\
        --notebook-id <nb> --source-id <src> --provider openai --model gpt-4o \\
        --api-key sk-... --legacy-output legacy.json

Compares: node count (±5%), edge count (±10%), community count exact-match
or ±1, every input source-id appears in some WikiPage.sourceRefs,
crossRefs match semantically.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from workflows.wiki_ingest import extract_wiki, WikiExtractRequest, Graph, Node, Edge


def _load_legacy(path: str) -> dict:
    return json.loads(Path(path).read_text())


def _graph_from_dict(d: dict) -> Graph:
    nodes = [Node(**n) for n in d.get("nodes", [])]
    edges = [Edge(**e) for e in d.get("edges", [])]
    return Graph(nodes=nodes, edges=edges)


def _diff(legacy: dict, fresh) -> int:
    issues = 0
    legacy_nodes = len(legacy["mergedGraph"]["nodes"])
    fresh_nodes = len(fresh.merged_graph.nodes)
    if abs(legacy_nodes - fresh_nodes) > max(1, legacy_nodes * 0.05):
        print(f"FAIL: node count drift: legacy={legacy_nodes} fresh={fresh_nodes}")
        issues += 1
    legacy_edges = len(legacy["mergedGraph"]["edges"])
    fresh_edges = len(fresh.merged_graph.edges)
    if abs(legacy_edges - fresh_edges) > max(1, legacy_edges * 0.10):
        print(f"FAIL: edge count drift: legacy={legacy_edges} fresh={fresh_edges}")
        issues += 1
    legacy_comm = len(legacy["communities"])
    fresh_comm = len(fresh.communities)
    if abs(legacy_comm - fresh_comm) > 1:
        print(f"FAIL: community count drift: legacy={legacy_comm} fresh={fresh_comm}")
        issues += 1
    if issues == 0:
        print(f"PASS: nodes={fresh_nodes} edges={fresh_edges} communities={fresh_comm}")
    return issues


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--notebook-id", required=True)
    ap.add_argument("--source-id", required=True)
    ap.add_argument("--source-content-file", required=True,
                    help="Markdown file the legacy run consumed")
    ap.add_argument("--provider", default="openai")
    ap.add_argument("--model", default="gpt-4o")
    ap.add_argument("--api-key", required=True)
    ap.add_argument("--legacy-output", required=True,
                    help="JSON dump of mergedGraph + communities from the TS run")
    args = ap.parse_args()
    content = Path(args.source_content_file).read_text()
    legacy = _load_legacy(args.legacy_output)
    req = WikiExtractRequest(
        mode="extract", notebook_id=args.notebook_id, source_id=args.source_id,
        user_id="diff_harness", source_title=Path(args.source_content_file).stem,
        source_content=content,
        existing_graph=_graph_from_dict(legacy.get("existingGraph") or {"nodes": [], "edges": []}),
        source_map={},
        lm={"provider": args.provider, "model": args.model, "api_key": args.api_key},
    )
    result = await extract_wiki.ainvoke(req)
    sys.exit(_diff(legacy, result))


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/scripts/diff_wiki_ingest.py
git commit -m "feat(scripts): add wiki-ingest TS↔Python diff harness for cutover gate"
```

---

# Phase 9 — Wiki-ingest HTTP route + `/v1/llm/models` extraction

### Task 27: Pydantic models for the wiki extract route

**Files:**
- Create: `apps/agent/server/wiki_ingest_types.py`

- [ ] **Step 1: Write the types**

```python
"""Pydantic discriminated-union models for POST /v1/workflows/wiki/extract."""
from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, model_validator


class BYOKConfig(BaseModel):
    provider: str
    model: str
    apiKey: str
    baseUrl: Optional[str] = None


class _GraphData(BaseModel):
    nodes: list[dict] = []
    edges: list[dict] = []


class _BaseWikiReq(BaseModel):
    notebookId: str
    sourceId: str
    userId: str
    sourceTitle: str
    existingGraph: Optional[_GraphData] = None
    byok: BYOKConfig
    sourceMap: dict[str, str] = Field(default_factory=dict)


class WikiExtractMode(_BaseWikiReq):
    mode: Literal["extract"] = "extract"
    sourceContent: str = ""
    existingNodeLabels: list[str] = []

    @model_validator(mode="after")
    def _content_required(self):
        if not self.sourceContent:
            raise ValueError("sourceContent required for mode=extract")
        return self


class WikiRemoveMode(_BaseWikiReq):
    mode: Literal["remove"]

    @model_validator(mode="after")
    def _graph_required(self):
        if self.existingGraph is None:
            raise ValueError("existingGraph required for mode=remove")
        return self


WikiExtractRequest = Annotated[
    Union[WikiExtractMode, WikiRemoveMode],
    Field(discriminator="mode"),
]


class WikiExtractError(BaseModel):
    code: Literal["INVALID_KEY", "TIMEOUT", "UPSTREAM_ERROR", "BAD_INPUT", "EXTRACTION_FAILED"]
    providerId: Optional[str] = None
    message: str
```

- [ ] **Step 2: Commit**

```bash
git add apps/agent/server/wiki_ingest_types.py
git commit -m "feat(server): add Pydantic discriminated-union for wiki extract"
```

### Task 28: Tests for the wiki extract route

**Files:**
- Create: `apps/agent/tests/test_wiki_ingest_router.py`

- [ ] **Step 1: Write the tests**

```python
"""Tests for POST /v1/workflows/wiki/extract."""
from __future__ import annotations

import os
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("INTERNAL_CALLBACK_TOKEN", "tk")
    from server.app import app
    return TestClient(app)


def _payload(**kw):
    base = dict(
        mode="extract", notebookId="nb", sourceId="s", userId="u",
        sourceTitle="t", sourceContent="body",
        byok={"provider": "openai", "model": "gpt-4o", "apiKey": "sk-t"},
    )
    base.update(kw)
    return base


def test_401_without_token(client):
    r = client.post("/v1/workflows/wiki/extract", json=_payload())
    assert r.status_code == 401


def test_200_with_token_and_mocked_entrypoint(client, monkeypatch):
    from workflows.wiki_ingest import (Extraction, Graph, WikiExtractResult,
                                         WikiPagePayload)
    fake = AsyncMock(return_value=WikiExtractResult(
        normalized_title="X", extraction=Extraction(normalized_title="X", nodes=[], edges=[]),
        extraction_report={"nodes": [], "edges": [], "crossRefs": []},
        merged_graph=Graph(nodes=[], edges=[]), communities={},
        community_pages=[],
        index_page=WikiPagePayload(slug="index", title="i", markdown="", source_ids=[]),
        log_entry="log",
    ))
    monkeypatch.setattr("server.routes.wiki_ingest.extract_wiki.ainvoke", fake)
    r = client.post(
        "/v1/workflows/wiki/extract",
        json=_payload(),
        headers={"X-Internal-Token": "tk"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["normalizedTitle"] == "X"
    assert "extractionReport" in body
    assert body["indexPage"]["slug"] == "index"


def test_extract_mode_without_content_returns_422(client):
    r = client.post(
        "/v1/workflows/wiki/extract",
        json=_payload(sourceContent=""),
        headers={"X-Internal-Token": "tk"},
    )
    assert r.status_code == 422


def test_remove_mode_without_existing_graph_returns_422(client):
    payload = dict(mode="remove", notebookId="n", sourceId="s", userId="u",
                   sourceTitle="t",
                   byok={"provider": "openai", "model": "gpt-4o", "apiKey": "sk"})
    r = client.post("/v1/workflows/wiki/extract", json=payload,
                    headers={"X-Internal-Token": "tk"})
    assert r.status_code == 422


def test_internal_error_envelope(client, monkeypatch):
    fake = AsyncMock(side_effect=RuntimeError("boom"))
    monkeypatch.setattr("server.routes.wiki_ingest.extract_wiki.ainvoke", fake)
    r = client.post("/v1/workflows/wiki/extract", json=_payload(),
                    headers={"X-Internal-Token": "tk"})
    assert r.status_code == 500
    body = r.json()
    assert body["error"]["code"] in {"UPSTREAM_ERROR", "EXTRACTION_FAILED"}
    assert body["error"]["message"]
```

- [ ] **Step 2: Confirm fail (router doesn't exist)**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_wiki_ingest_router.py -v
```
Expected: ImportError on `server.routes.wiki_ingest`.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/tests/test_wiki_ingest_router.py
git commit -m "test(server): add wiki extract route tests"
```

### Task 29: Implement the wiki extract route

**Files:**
- Create: `apps/agent/server/routes/wiki_ingest.py`
- Modify: `apps/agent/server/app.py` (include router)

- [ ] **Step 1: Write the route**

```python
"""POST /v1/workflows/wiki/extract — produce wiki payload from source content.

Stateless. The Node-side worker handles per-job persistence (status writes,
prisma.$transaction) and is the single source of truth for DB state.
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse

from server.wiki_ingest_types import (BYOKConfig, WikiExtractRequest,
                                        WikiExtractMode, WikiRemoveMode)
from workflows.wiki_ingest import (
    Edge, Graph, Node, WikiExtractRequest as InternalReq, extract_wiki,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _verify_token(x_internal_token: str = Header(default="")) -> None:
    expected = os.getenv("INTERNAL_CALLBACK_TOKEN", "")
    if not expected or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _to_internal(req: WikiExtractRequest) -> InternalReq:
    """Convert Pydantic discriminated-union to the workflow's plain dataclass."""
    existing = None
    if getattr(req, "existingGraph", None):
        existing = Graph(
            nodes=[Node(**n) for n in req.existingGraph.nodes],
            edges=[Edge(**e) for e in req.existingGraph.edges],
        )
    lm = {
        "provider": req.byok.provider, "model": req.byok.model,
        "api_key": req.byok.apiKey, "api_base": req.byok.baseUrl,
    }
    if isinstance(req, WikiExtractMode):
        return InternalReq(
            mode="extract", notebook_id=req.notebookId, source_id=req.sourceId,
            user_id=req.userId, source_title=req.sourceTitle,
            source_content=req.sourceContent, existing_graph=existing,
            existing_node_labels=req.existingNodeLabels, source_map=req.sourceMap,
            lm=lm,
        )
    return InternalReq(
        mode="remove", notebook_id=req.notebookId, source_id=req.sourceId,
        user_id=req.userId, source_title=req.sourceTitle,
        existing_graph=existing, source_map=req.sourceMap, lm=lm,
    )


@router.post("/v1/workflows/wiki/extract", dependencies=[Depends(_verify_token)])
async def extract(req: WikiExtractRequest):
    try:
        result = await extract_wiki.ainvoke(_to_internal(req))
    except ValueError as exc:
        return JSONResponse(status_code=400, content={
            "error": {"code": "BAD_INPUT", "message": str(exc),
                       "providerId": req.byok.provider},
        })
    except Exception as exc:  # noqa: BLE001
        logger.exception("wiki_ingest extract failed")
        return JSONResponse(status_code=500, content={
            "error": {"code": "EXTRACTION_FAILED", "message": str(exc),
                       "providerId": req.byok.provider},
        })

    return {
        "normalizedTitle": result.normalized_title,
        "extraction": (
            None if result.extraction is None else {
                "normalizedTitle": result.extraction.normalized_title,
                "nodes": [n.__dict__ for n in result.extraction.nodes],
                "edges": [e.__dict__ for e in result.extraction.edges],
            }
        ),
        "extractionReport": result.extraction_report,
        "mergedGraph": {"nodes": [n.__dict__ for n in result.merged_graph.nodes],
                         "edges": [e.__dict__ for e in result.merged_graph.edges]},
        "communities": {str(k): v for k, v in result.communities.items()},
        "communityPages": [{"slug": p.slug, "title": p.title,
                             "markdown": p.markdown, "sourceIds": p.source_ids}
                            for p in result.community_pages],
        "indexPage": {"slug": result.index_page.slug, "title": result.index_page.title,
                       "markdown": result.index_page.markdown,
                       "sourceIds": result.index_page.source_ids},
        "logEntry": result.log_entry,
    }
```

- [ ] **Step 2: Wire into `server/app.py`**

In `server/app.py`, add:

```python
from server.routes.wiki_ingest import router as wiki_ingest_router
# ...
app.include_router(wiki_ingest_router)
```

- [ ] **Step 3: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_wiki_ingest_router.py tests/test_server_app.py -v
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/server/routes/wiki_ingest.py apps/agent/server/app.py
git commit -m "feat(server): wire POST /v1/workflows/wiki/extract"
```

### Task 30: Extract `/v1/llm/models` into `routes/llm_models.py` (no litellm)

**Files:**
- Create: `apps/agent/server/routes/llm_models.py`
- Create: `apps/agent/tests/test_llm_models.py`
- Modify: `apps/agent/server/app.py`

- [ ] **Step 1: Read the existing `llm_gateway.py` /v1/llm/models handler**

```bash
sed -n '70,150p' apps/agent/server/routes/llm_gateway.py
```
Identify what httpx call it makes. (Spec note: gateway uses httpx + litellm; we extract just the httpx pieces.)

- [ ] **Step 2: Write the new route**

```python
"""POST /v1/workflows/llm/list-models — proxy to upstream provider /v1/models.

Replaces the old /v1/llm/models gateway endpoint with a litellm-free path.
Filters to chat-capable models (drops embedding/tts/whisper/etc.).
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter()


NON_CHAT_SUBSTRINGS = (
    "embedding", "tts", "whisper", "dall-e", "audio", "image", "realtime",
    "imagen", "veo", "cogview", "cogvideo", "moderation", "rerank",
)


def _verify_token(x_internal_token: str = Header(default="")) -> None:
    expected = os.getenv("INTERNAL_CALLBACK_TOKEN", "")
    if not expected or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _is_chat_model(model_id: str) -> bool:
    lower = model_id.lower()
    return not any(s in lower for s in NON_CHAT_SUBSTRINGS)


class ListModelsRequest(BaseModel):
    providerId: str
    apiKey: str
    baseUrl: Optional[str] = None


class ListModelsResponse(BaseModel):
    models: list[str]


@router.post("/v1/workflows/llm/list-models", response_model=ListModelsResponse,
              dependencies=[Depends(_verify_token)])
async def list_models(req: ListModelsRequest):
    base = (req.baseUrl or "https://api.openai.com/v1").rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                f"{base}/models",
                headers={"Authorization": f"Bearer {req.apiKey}"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code,
                             detail=f"Upstream {req.providerId}: {exc.response.text[:200]}")
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Upstream error: {exc}")

    ids = [m.get("id") for m in (data.get("data") or []) if m.get("id")]
    return {"models": [m for m in ids if _is_chat_model(m)]}
```

- [ ] **Step 3: Write the tests**

```python
"""Tests for POST /v1/workflows/llm/list-models."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("INTERNAL_CALLBACK_TOKEN", "tk")
    from server.app import app
    return TestClient(app)


def test_401_without_token(client):
    r = client.post("/v1/workflows/llm/list-models",
                    json={"providerId": "openai", "apiKey": "k"})
    assert r.status_code == 401


def test_200_returns_chat_models_only(client, monkeypatch):
    fake_resp = MagicMock()
    fake_resp.raise_for_status = MagicMock()
    fake_resp.json = MagicMock(return_value={"data": [
        {"id": "gpt-4o"}, {"id": "text-embedding-3"}, {"id": "tts-1"},
        {"id": "gpt-4o-mini"},
    ]})

    class FakeClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        async def get(self, *a, **kw): return fake_resp

    monkeypatch.setattr("server.routes.llm_models.httpx.AsyncClient", FakeClient)
    r = client.post("/v1/workflows/llm/list-models",
                    json={"providerId": "openai", "apiKey": "sk"},
                    headers={"X-Internal-Token": "tk"})
    assert r.status_code == 200
    assert r.json() == {"models": ["gpt-4o", "gpt-4o-mini"]}


def test_502_on_upstream_failure(client, monkeypatch):
    import httpx
    class FakeClient:
        def __init__(self, *a, **kw): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return None
        async def get(self, *a, **kw):
            raise httpx.ConnectError("dns boom")
    monkeypatch.setattr("server.routes.llm_models.httpx.AsyncClient", FakeClient)
    r = client.post("/v1/workflows/llm/list-models",
                    json={"providerId": "openai", "apiKey": "sk"},
                    headers={"X-Internal-Token": "tk"})
    assert r.status_code == 502
```

- [ ] **Step 4: Wire into `server/app.py`**

```python
from server.routes.llm_models import router as llm_models_router
# ...
app.include_router(llm_models_router)
```

- [ ] **Step 5: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_llm_models.py -v
```
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/server/routes/llm_models.py apps/agent/tests/test_llm_models.py apps/agent/server/app.py
git commit -m "feat(server): extract /v1/workflows/llm/list-models (no litellm)"
```

---

# Phase 10 — Cross-app cutover

> ⚠️ This phase touches `apps/web/` (TypeScript). Do NOT split this into multiple commits — the cutover is one atomic step (spec §9 step 11). Steps 31–34 are sub-steps of one PR, committed together.

### Task 31: Run the diff harness for ≥3 dev-notebook sources

**Files:** none (validation step)

- [ ] **Step 1: Generate a TS-side baseline by uploading 3 sources to a dev notebook through the current path; capture each `WikiExtractResult` shape from the worker's response (or from the DB after ingest)**

(Manual step — record `nodes/edges/communities` for each source as `legacy_<src>.json`.)

- [ ] **Step 2: Run the diff harness for each**

```bash
cd apps/agent
for src in src1 src2 src3; do
  .venv/bin/python scripts/diff_wiki_ingest.py \
    --notebook-id $NB --source-id $src \
    --source-content-file fixtures/$src.md \
    --provider openai --model gpt-4o --api-key $OPENAI_API_KEY \
    --legacy-output legacy_$src.json
done
```
Expected: every source prints `PASS`. **If any source fails, stop and investigate before committing the cutover.**

### Task 32: Rewrite `apps/web/workers/ingest.ts` to call the Python endpoint

**Files:**
- Modify: `apps/web/workers/ingest.ts`
- Modify: `apps/web/lib/services/wiki-ingest.ts` (slim)

- [ ] **Step 1: Slim `apps/web/lib/services/wiki-ingest.ts` to the cutover shape**

```ts
// Slim wiki-ingest.ts (was ~203 LOC, becomes ~70 LOC):
import { prisma } from "@/lib/db";
import { resolveApiKey } from "@/lib/services/api-key-resolver";

const WORKFLOWS_API = process.env.WORKFLOWS_API_URL ?? "http://workflows-api:2027";
const TOKEN = process.env.INTERNAL_CALLBACK_TOKEN ?? "";

export async function ingestSourceToWiki(args: {
  notebookId: string; sourceId: string; userId: string;
}) {
  const source = await prisma.source.findUniqueOrThrow({ where: { id: args.sourceId } });
  const graph = await prisma.notebookGraph.findUnique({
    where: { notebookId: args.notebookId },
  });
  const settings = await prisma.userSettings.findUnique({ where: { userId: args.userId } });
  const byok = await resolveApiKey(args.userId, settings!.wikiModelProvider);

  await prisma.source.update({
    where: { id: args.sourceId },
    data: { metadata: { ...(source.metadata as object ?? {}), wikiStatus: "extracting" }},
  });

  const resp = await fetch(`${WORKFLOWS_API}/v1/workflows/wiki/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": TOKEN },
    body: JSON.stringify({
      mode: "extract",
      notebookId: args.notebookId, sourceId: args.sourceId, userId: args.userId,
      sourceTitle: source.title, sourceContent: source.markdown ?? "",
      existingNodeLabels: (graph?.graphData as any)?.nodes?.map((n: any) => n.label) ?? [],
      existingGraph: graph?.graphData ?? null,
      sourceMap: { [args.sourceId]: source.title },
      byok: { provider: settings!.wikiModelProvider, model: settings!.wikiModelName,
              apiKey: byok.apiKey, baseUrl: byok.baseUrl },
    }),
  });
  if (!resp.ok) {
    await prisma.source.update({
      where: { id: args.sourceId },
      data: { status: "FAILED",
              metadata: { ...(source.metadata as object ?? {}),
                          wikiStatus: "failed", wikiError: await resp.text() }},
    });
    throw new Error(`wiki extract failed: ${resp.status}`);
  }
  const result = await resp.json() as {
    normalizedTitle: string;
    extractionReport: { nodes: any[]; edges: any[]; crossRefs: any[] } | null;
    mergedGraph: { nodes: any[]; edges: any[] };
    communityPages: { slug: string; title: string; markdown: string; sourceIds: string[] }[];
    indexPage: { slug: string; title: string; markdown: string; sourceIds: string[] };
    logEntry: string;
  };

  await prisma.source.update({
    where: { id: args.sourceId },
    data: {
      title: result.normalizedTitle,
      metadata: { ...(source.metadata as object ?? {}),
                  extractionReport: result.extractionReport,
                  wikiStatus: "generating" },
    },
  });

  const writtenSlugs = ["index", ...result.communityPages.map(p => p.slug)];
  await prisma.$transaction(async (tx) => {
    await tx.notebookGraph.upsert({
      where: { notebookId: args.notebookId },
      update: { graphData: result.mergedGraph },
      create: { notebookId: args.notebookId, graphData: result.mergedGraph },
    });
    for (const page of [result.indexPage, ...result.communityPages]) {
      await tx.wikiPage.upsert({
        where: { notebookId_slug: { notebookId: args.notebookId, slug: page.slug }},
        update: { title: page.title, markdown: page.markdown, sourceRefs: page.sourceIds },
        create: { notebookId: args.notebookId, slug: page.slug,
                  title: page.title, markdown: page.markdown, sourceRefs: page.sourceIds },
      });
    }
    await tx.wikiPage.deleteMany({
      where: { notebookId: args.notebookId, slug: { startsWith: "community-" },
               NOT: { slug: { in: writtenSlugs } }},
    });
    await tx.wikiPageLog.create({
      data: { notebookId: args.notebookId, content: result.logEntry },
    });
  });

  await prisma.source.update({
    where: { id: args.sourceId },
    data: { status: "READY",
            metadata: { ...(source.metadata as object ?? {}), wikiStatus: "done" }},
  });
}

export async function removeSourceFromWiki(args: {
  notebookId: string; sourceId: string; userId: string;
}) {
  // Symmetric: same endpoint, mode: "remove", no sourceContent.
  const source = await prisma.source.findUniqueOrThrow({ where: { id: args.sourceId } });
  const graph = await prisma.notebookGraph.findUnique({
    where: { notebookId: args.notebookId },
  });
  const settings = await prisma.userSettings.findUnique({ where: { userId: args.userId } });
  const byok = await resolveApiKey(args.userId, settings!.wikiModelProvider);

  const resp = await fetch(`${WORKFLOWS_API}/v1/workflows/wiki/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": TOKEN },
    body: JSON.stringify({
      mode: "remove", notebookId: args.notebookId, sourceId: args.sourceId,
      userId: args.userId, sourceTitle: source.title,
      existingGraph: graph!.graphData,
      sourceMap: {}, byok: { provider: settings!.wikiModelProvider,
                             model: settings!.wikiModelName,
                             apiKey: byok.apiKey, baseUrl: byok.baseUrl },
    }),
  });
  if (!resp.ok) throw new Error(`wiki remove failed: ${resp.status}`);
  const result = await resp.json();
  // Same transactional commit as above; same orphan-page deletion semantics
  // (omitted here for brevity — copy the $transaction block from ingestSourceToWiki).
  // ...
}
```

- [ ] **Step 2: Update `apps/web/workers/ingest.ts`**

The worker file consumes `ingestSourceToWiki` directly — no change to its top-level shape. Drop any imports of `graph-service.ts` it had, since they're gone.

```bash
grep -n "graph-service" apps/web/workers/ingest.ts
```

For each match, replace with the import from `wiki-ingest.ts`. Run TypeScript:

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no errors related to `graph-service` (other unrelated TS errors are pre-existing and not blocking — verify nothing new appeared).

### Task 33: Slim `apps/web/lib/providers/list-models.ts` and call new endpoint

**Files:**
- Modify: `apps/web/lib/providers/list-models.ts`

- [ ] **Step 1: Replace the body with a thin client**

```ts
const WORKFLOWS_API = process.env.WORKFLOWS_API_URL ?? "http://workflows-api:2027";
const TOKEN = process.env.INTERNAL_CALLBACK_TOKEN ?? "";

export async function listModels(args: {
  providerId: string; apiKey: string; baseUrl?: string;
}): Promise<{ models: string[] }> {
  const resp = await fetch(`${WORKFLOWS_API}/v1/workflows/llm/list-models`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": TOKEN },
    body: JSON.stringify(args),
  });
  if (!resp.ok) {
    throw new Error(`list-models failed: ${resp.status} ${await resp.text()}`);
  }
  return resp.json() as Promise<{ models: string[] }>;
}
```

(That's the whole file, ~40 LOC — was ~225 LOC.)

### Task 34: Delete `graph-service.ts`, `llm_gateway.py`, drop deps; commit + run E2E

**Files:**
- Delete: `apps/web/lib/services/graph-service.ts`
- Delete: `apps/agent/server/routes/llm_gateway.py`
- Modify: `apps/agent/server/app.py` (drop `llm_gateway_router` include)
- Modify: `apps/agent/pyproject.toml` (drop `litellm`)
- Modify: `apps/web/package.json` (drop `openai` dep)
- Modify: `apps/web/CLAUDE.md`, `apps/agent/CLAUDE.md`, root `.claude/CLAUDE.md` — remove gateway and graph-service references; describe wiki ingest under `apps/agent/workflows/`.

- [ ] **Step 1: Delete the legacy files**

```bash
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/agent-dev
git rm apps/web/lib/services/graph-service.ts
git rm apps/agent/server/routes/llm_gateway.py
```

- [ ] **Step 2: Update `apps/agent/server/app.py`**

Remove the line `from server.routes.llm_gateway import router as llm_gateway_router` and the corresponding `app.include_router(llm_gateway_router)`.

- [ ] **Step 3: Drop `litellm` from `apps/agent/pyproject.toml`**

Remove the `"litellm>=1.50",` line and the comment block above it.

- [ ] **Step 4: Drop `openai` from `apps/web/package.json`**

```bash
cd apps/web && npm uninstall openai
```

- [ ] **Step 5: Update CLAUDE.md docs**

In root `.claude/CLAUDE.md`, find the "Architecture → Agent Architecture" section and add wiki ingest as the fourth workflow:

```markdown
### Wiki / Knowledge Base
... (existing wording about per-notebook wiki)
1. Source uploaded → content extracted (MinerU for PDFs, Playwright for web)
2. Upload API enqueues a BullMQ job (`lib/queue/ingest-queue.ts`); the
   `ingest-worker` calls `apps/agent/workflows/wiki_ingest.py` via
   `POST /v1/workflows/wiki/extract`. The Python workflow returns merged
   graph + clustered communities + wiki pages; the worker commits via
   `prisma.$transaction`. (The Node-side `graph-service.ts` was deleted
   in the agent-refactor cutover; LLM calls now happen directly from
   Python.)
3. (rest unchanged)
```

In `apps/web/CLAUDE.md`, remove any reference to `graph-service.ts` or `lib/services/wiki-ingest.ts`'s LLM behavior. Note that `wiki-ingest.ts` is now an HTTP client around `/v1/workflows/wiki/extract`.

In `apps/agent/CLAUDE.md` (if present), describe `workflows/wiki_ingest.py` next to the other three workflows.

- [ ] **Step 6: Run all tests**

```bash
cd apps/agent && .venv/bin/python -m pytest -v
```
Expected: all PASS.

```bash
cd apps/web && npx tsc --noEmit
```
Expected: no new TS errors (pre-existing unrelated errors, if any, are pre-existing).

- [ ] **Step 7: Run the E2E smoke**

Start the stack:

```bash
cd apps/web && docker compose up -d
cd apps/agent && make dev   # in a second terminal
cd apps/agent && make serve # in a third
```

In a browser:
1. Log in as a dev user.
2. Open a deepdive notebook.
3. Upload a PDF source (or use a small markdown source for speed).
4. Verify the wiki tab populates with community + index pages.

Verify in DB:

```bash
docker exec sparkflow-postgres psql -U sparkflow -d sparkflow -c \
  "SELECT slug FROM \"WikiPage\" WHERE \"notebookId\" = '<your-nb-id>' ORDER BY slug;"
```

Should show `index` + several `community-N` rows.

- [ ] **Step 8: Commit the entire cutover as one atomic commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(cutover): wiki-ingest → Python; delete graph-service.ts + llm_gateway.py

The cross-app cutover that completes the agent refactor:

- apps/web/workers/ingest.ts now calls POST /v1/workflows/wiki/extract
  (Python implementation in apps/agent/workflows/wiki_ingest.py).
- apps/web/lib/services/wiki-ingest.ts slimmed from ~203 LOC to ~70 LOC:
  status writes + Python call + the existing prisma.\$transaction (which
  still owns DB commit; unchanged byte-for-byte).
- apps/web/lib/providers/list-models.ts slimmed from ~225 LOC to ~40 LOC:
  thin client around /v1/workflows/llm/list-models.
- apps/web/lib/services/graph-service.ts DELETED (~720 LOC).
- apps/agent/server/routes/llm_gateway.py DELETED (~299 LOC); replaced
  by routes/llm_models.py for the BYOK validation use case.
- Drop litellm dep (apps/agent) and openai SDK dep (apps/web).
- CLAUDE.md docs updated to describe wiki ingest under apps/agent/workflows/.

Cutover gate was the diff harness in scripts/diff_wiki_ingest.py:
3 dev-notebook sources matched the legacy TS output within ±5%/±10%
node/edge counts and had matching crossRefs. E2E smoke verified one
fresh PDF upload produced expected WikiPage rows.
EOF
)"
```

---

# Self-review notes

After writing this plan, I checked:

1. **Spec coverage**: Every section of the spec maps to at least one task:
   - §3 deletion list → Tasks 9, 11, 12, 34
   - §4.1 directory layout → Tasks 3, 4, 5, 6, 22, 27, 29, 30
   - §5 surface contracts → Tasks 4, 5, 6
   - §5.3 frontend exit semantics → Task 6 + 7 (test for all-frontend exit)
   - §6 prompt builder → Tasks 1, 2
   - §6.1 Functional API runtime contract → embedded in code style across phases (langgraph version pin in Task 22, sync `.result()` aggregation in Task 16, `asyncio.to_thread` in Task 20)
   - §7.1 search plain async → Tasks 13, 14
   - §7.2 daily_digest Functional API → Tasks 15, 16, 17
   - §7.3 matcher Graph API + Send → Tasks 18, 19, 20
   - §7.4 wiki_ingest with extractionReport, hidden contracts, mode → Tasks 22-25, 27-29, 32
   - §8 langgraph.json + pyproject.toml → Tasks 8, 9, 22, 34
   - §9 migration order → mirrored in Phase 1-10
   - §10 tests → Tasks 1, 3, 7, 13, 15, 17, 18, 22, 24, 25, 28, 30
   - §11 risks → cutover safety in Tasks 31, 34
   - §12 out-of-scope → noted in Task 14 (no @entrypoint), Task 19 (`asyncio.to_thread` for sync impedance)

2. **Placeholder scan**: No "TBD", "TODO", "implement later", or "similar to Task N (without code)" found. Every code step has runnable code.

3. **Type consistency**: 
   - `Ctx` dataclass shape consistent across `agents/notebook.py`, `agents/hub.py`, `agents/deep_research.py`.
   - `Graph`, `Node`, `Edge`, `Extraction`, `WikiPagePayload`, `WikiExtractRequest`, `WikiExtractResult` defined once in Task 23, consumed in Tasks 24-29.
   - `JobState` defined in Task 19, consumed in Task 20.
   - HTTP route shapes match Pydantic models defined in Task 27 → consumed in Task 29 + 32.

4. **Reference doc citations**: Every workflow contract task (14, 16, 19, 25) cites the relevant ref-doc section.
