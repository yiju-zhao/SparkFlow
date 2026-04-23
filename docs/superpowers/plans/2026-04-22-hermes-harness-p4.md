# Hermes Harness — P4 (Search Workflow + Deep-Research Surface) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the legacy `graphs/search_agent.py` into two clean pieces per the spec's agent/workflow taxonomy:

1. **`workflows/search.py`** — deterministic internal-content search. Handles the existing `wechat` / `publication` / `web` source_types. Internal types use `pgvector` prefilter → `semops /operators/rank`; web type uses Tavily single-shot search. Exposed via a new HTTP endpoint (FastAPI sidecar or LangGraph-compatible module — see §4.2).
2. **`surfaces/deep_research.py`** — new agent surface for iterative web research (the "Perplexity-style" flow). Uses Tavily + url_fetch + wiki + memory tools in a multi-turn loop. Added to `langgraph.json` alongside `notebook` and `hub`.

Tear down the legacy `search` graph + its prompts/config module. Keep the Next.js `/api/notebooks/[id]/sources/search` route's public contract intact — only its upstream target changes.

**Architecture changes:**
- `apps/agent/workflows/search.py` (new) — pure Python module with a single async `run(req)` entry point; imported and called by a new FastAPI app.
- `apps/agent/server/app.py` (new) — minimal FastAPI exposing `POST /v1/workflows/search`. Runs on a new port (`2027`) alongside the existing `langgraph dev` on `2024`. Future workflows (matcher, daily_digest) register here.
- `apps/agent/surfaces/deep_research.py` (new) — `DEEP_RESEARCH` SurfaceConfig.
- `apps/agent/graphs/surface.py` (mod) — export `deep_research_graph`.
- `apps/agent/tools/web.py` (new) — `search_web` + `url_fetch` tools, self-registered under `toolset="web"`.
- `apps/agent/tools/search_tools.py` (delete after migration) — legacy location, replaced by `tools/web.py`.
- `apps/agent/prompts/surfaces/deep_research.md` (new).
- `apps/agent/langgraph.json` (mod) — remove `search` entry; add `deep_research` entry.
- `apps/agent/graphs/search_agent.py` (delete).
- `apps/agent/prompts/search_agent.py` (delete).
- `apps/agent/config/search_agent.py` (delete).
- `apps/web/app/api/notebooks/[id]/sources/search/route.ts` (mod) — call `POST /v1/workflows/search` instead of `langgraph /runs` with `assistant_id: "search"`.

**Tech Stack:** Python 3.12, FastAPI (already in `apps/semops` requirements; add to `apps/agent`), httpx, LangGraph, hermes harness from P1-P3. Frontend: Next.js, TypeScript.

**Spec:** `docs/superpowers/specs/2026-04-22-hermes-harness-design.md` §6, §7, §10 (P4 row).
**Preceding plans:** P1-P3 merged.

---

## Scope boundaries

**IN scope:**
- Backend Python: `workflows/search.py`, `tools/web.py`, `surfaces/deep_research.py`, `prompts/surfaces/deep_research.md`, `server/app.py` + FastAPI route, `graphs/surface.py` updates, `langgraph.json`, new `WORKFLOWS_API_URL` env var documentation.
- Frontend: update `/api/notebooks/[id]/sources/search/route.ts` to call new workflow endpoint. (Optional: add a dedicated `deep_research` entry point — if scoped separately in a later task.)
- Legacy cleanup: delete `graphs/search_agent.py`, `prompts/search_agent.py`, `config/search_agent.py`, `tools/search_tools.py`.
- Tests: psycopg-based search tests using stubs (semops HTTP mocked).

**OUT of scope:**
- Full new deep-research frontend UX (new button, new chat panel). P4 lands the surface + graph; frontend UX for it is a separate follow-up. For P4 verification, curl against `deep_research` graph is enough.
- `matcher` workflow migration (P5).
- `daily_digest` orchestrator relocation (P6).
- Rate limiting on the new FastAPI endpoint.
- semops migration bug from P3 — still blocks DB apply, but P4 doesn't touch memory.

**Rollback:** Each task ends with a commit. The legacy search graph stays until §5 (Task 10). Until then, the Next.js route can be rolled back to its P3 form trivially (one-line revert of the URL).

---

## Phase A — Search Workflow (Tasks 1-4)

### Task 1: FastAPI workflow server skeleton

**Files:**
- Create: `apps/agent/server/__init__.py` (empty)
- Create: `apps/agent/server/app.py`
- Create: `apps/agent/tests/test_server_app.py`
- Modify: `apps/agent/pyproject.toml` + `requirements.txt` — add `fastapi>=0.109`, `uvicorn[standard]>=0.27`

Serve `/v1/healthz` first to prove the server boots. Workflow routes land in Task 3.

- [ ] **Step 1: Add fastapi + uvicorn to deps**

`pyproject.toml` `[project].dependencies`: append `"fastapi>=0.109"`, `"uvicorn[standard]>=0.27"`.

`requirements.txt`: append two lines under a new "Workflow server" section.

Install: `uv pip install --python apps/agent/.venv/bin/python fastapi 'uvicorn[standard]'`

- [ ] **Step 2: Write failing test**

`apps/agent/tests/test_server_app.py`:

```python
"""Tests for the apps/agent FastAPI workflow server."""

from fastapi.testclient import TestClient


def test_healthz_returns_ok():
    from server.app import app
    client = TestClient(app)
    resp = client.get("/v1/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
```

- [ ] **Step 3: Run failing**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_server_app.py -v 2>&1 | tail -5
```

Expected: ModuleNotFoundError for `server.app`.

- [ ] **Step 4: Implement**

`apps/agent/server/__init__.py`: empty.

`apps/agent/server/app.py`:

```python
"""FastAPI server hosting apps/agent workflows.

Runs alongside ``langgraph dev`` (which handles agent surfaces). Workflow
routes are stateless; each request carries its own config + model settings.
"""

from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(title="SparkFlow Workflows", version="0.1.0")


@app.get("/v1/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}
```

- [ ] **Step 5: Tests pass**

- [ ] **Step 6: Commit**

```bash
git add apps/agent/server/ apps/agent/tests/test_server_app.py apps/agent/pyproject.toml apps/agent/requirements.txt
git commit -m "feat(agent): add FastAPI workflow server skeleton"
```

---

### Task 2: `tools/web.py` — Tavily search + url_fetch

Move the legacy `search_web` tool from `tools/search_tools.py` to `tools/web.py`, add a new `url_fetch` tool for deep_research, and register both under `toolset="web"`.

**Files:**
- Create: `apps/agent/tools/web.py`
- Create: `apps/agent/tests/test_tools_web.py`

- [ ] **Step 1: Read existing `tools/search_tools.py`** for the `search_web` implementation to port.

- [ ] **Step 2: Write failing test**

```python
"""Tests for tools.web (search_web + url_fetch)."""

import json
from unittest.mock import MagicMock, patch

import pytest

from tools.web import search_web, url_fetch


def test_search_web_no_api_key_returns_error():
    with patch.dict("os.environ", {"TAVILY_API_KEY": ""}, clear=False):
        result = search_web.invoke({"query": "x"})
    parsed = json.loads(result)
    assert "error" in parsed


def test_search_web_success_returns_json(monkeypatch):
    fake_tavily = MagicMock()
    fake_tavily.search.return_value = {
        "results": [
            {"title": "A", "url": "https://a.test", "content": "body A"},
            {"title": "B", "url": "https://b.test", "content": "body B"},
        ]
    }
    import sys
    tavily_mod = MagicMock()
    tavily_mod.TavilyClient = MagicMock(return_value=fake_tavily)
    monkeypatch.setitem(sys.modules, "tavily", tavily_mod)
    monkeypatch.setenv("TAVILY_API_KEY", "fake_key")
    result = search_web.invoke({"query": "diffusion models"})
    parsed = json.loads(result)
    assert len(parsed) == 2
    assert parsed[0]["title"] == "A"


def test_url_fetch_success(monkeypatch):
    fake_resp = MagicMock()
    fake_resp.status_code = 200
    fake_resp.text = "<html><body>Hello</body></html>"
    fake_resp.raise_for_status = MagicMock()
    fake_client = MagicMock()
    fake_client.__enter__ = MagicMock(return_value=fake_client)
    fake_client.__exit__ = MagicMock(return_value=False)
    fake_client.get = MagicMock(return_value=fake_resp)
    with patch("tools.web.httpx.Client", return_value=fake_client):
        result = url_fetch.invoke({"url": "https://example.test"})
    assert "Hello" in result or "<body>" in result


def test_url_fetch_http_error_returns_json_error():
    with patch("tools.web.httpx.Client") as Client:
        Client.return_value.__enter__.return_value.get.side_effect = Exception("network down")
        result = url_fetch.invoke({"url": "https://example.test"})
    parsed = json.loads(result)
    assert "error" in parsed


def test_tools_are_registered():
    import tools.web  # noqa: F401
    from hermes.registry import registry
    names = {e.name for e in registry._tools.values() if e.toolset == "web"}
    assert {"search_web", "url_fetch"} <= names
```

- [ ] **Step 3: Implement `apps/agent/tools/web.py`**

Port `search_web` from the legacy location; add `url_fetch`. Both self-register.

```python
"""Web tools — Tavily search + URL fetch.

Used by the ``deep_research`` surface for open-web research. These tools
are also reachable from the ``search`` workflow's ``web`` source_type.
"""

from __future__ import annotations

import json
import os

import httpx
from langchain_core.tools import tool

from hermes.registry import registry


@tool
def search_web(query: str, domains: list[str] | None = None) -> str:
    """Search the web for relevant pages via Tavily.

    Args:
        query: Search keywords (reformulated for best results).
        domains: Optional list of domains to restrict search to
            (e.g. ["arxiv.org"]).
    """
    try:
        from tavily import TavilyClient  # type: ignore

        api_key = os.getenv("TAVILY_API_KEY", "")
        if not api_key:
            return json.dumps({"error": "TAVILY_API_KEY not configured"})

        client = TavilyClient(api_key=api_key)
        kwargs: dict = {
            "query": query,
            "max_results": 15,
            "search_depth": "advanced",
        }
        if domains:
            kwargs["include_domains"] = domains

        response = client.search(**kwargs)
        return json.dumps(
            [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                }
                for r in response.get("results", [])
            ],
            ensure_ascii=False,
        )
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"search_web failed: {exc}"})


@tool
def url_fetch(url: str, max_chars: int = 10_000) -> str:
    """Fetch the raw text of a URL. Truncates to ``max_chars`` characters.

    Args:
        url: Absolute URL to fetch.
        max_chars: Cap on returned text length.
    """
    try:
        with httpx.Client(follow_redirects=True, timeout=15) as client:
            resp = client.get(url, headers={"User-Agent": "SparkFlow/1.0"})
            resp.raise_for_status()
            text = resp.text or ""
            if len(text) > max_chars:
                text = text[:max_chars] + "\n\n[... truncated ...]"
            return text
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"url_fetch failed: {exc}"})


# --- hermes.registry self-registration (P4) -----------------------------
registry.register(
    name=search_web.name,
    toolset="web",
    tool=search_web,
    description="Search the web via Tavily; returns top results as JSON.",
)
registry.register(
    name=url_fetch.name,
    toolset="web",
    tool=url_fetch,
    description="Fetch a URL's raw text (truncated).",
)
```

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Verify registry discovery**

```bash
cd apps/agent && .venv/bin/python -c "
from hermes.registry import discover_builtin_tools, registry
imported = discover_builtin_tools()
assert 'tools.web' in imported
tools = registry.get_tools(toolset={'web'})
print('web tools:', sorted(t.name for t in tools))
"
```

Expected: `['search_web', 'url_fetch']`.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/tools/web.py apps/agent/tests/test_tools_web.py
git commit -m "feat(agent): add tools/web.py with search_web + url_fetch (Tavily)"
```

---

### Task 3: `workflows/search.py` + route

**Files:**
- Create: `apps/agent/workflows/__init__.py` (empty)
- Create: `apps/agent/workflows/search.py`
- Create: `apps/agent/tests/test_workflows_search.py`
- Modify: `apps/agent/server/app.py` — mount `/v1/workflows/search`

- [ ] **Step 1: Write failing tests**

```python
"""Tests for workflows.search."""

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from workflows.search import SearchRequest, run


@pytest.mark.asyncio
async def test_web_source_type_calls_tavily(monkeypatch):
    # Web path: Tavily single-shot, no semops
    from tools.web import search_web
    monkeypatch.setattr(
        "workflows.search._invoke_web_search",
        AsyncMock(return_value=[{"title": "A", "url": "https://a.test", "content": "a"}]),
    )
    req = SearchRequest(
        query="diffusion",
        source_type="web",
        notebook_id="nb_1",
        model_provider="openai",
        model_name="gpt-4o",
        top_k=10,
    )
    resp = await run(req)
    assert resp.items[0]["url"] == "https://a.test"


@pytest.mark.asyncio
async def test_wechat_source_type_calls_prefilter_then_semops(monkeypatch):
    monkeypatch.setattr(
        "workflows.search._prefilter",
        AsyncMock(return_value=[
            {"id": 1, "text": "Article 1 ..."},
            {"id": 2, "text": "Article 2 ..."},
        ]),
    )
    monkeypatch.setattr(
        "workflows.search._semops_rank",
        AsyncMock(return_value={"ranked": [{"id": 2, "text": "Article 2 ..."}],
                                 "reasons": {"2": "more relevant"}}),
    )
    req = SearchRequest(
        query="AI agents",
        source_type="wechat",
        notebook_id="nb_1",
        model_provider="openai",
        model_name="gpt-4o-mini",
        top_k=5,
    )
    resp = await run(req)
    assert len(resp.items) == 1
    assert resp.items[0]["id"] == 2


@pytest.mark.asyncio
async def test_unsupported_source_type_returns_error():
    req = SearchRequest(
        query="x",
        source_type="podcast",  # unsupported
        notebook_id="nb_1",
        model_provider="openai",
        model_name="gpt-4o",
        top_k=5,
    )
    with pytest.raises(ValueError):
        await run(req)
```

- [ ] **Step 2: Implement `workflows/search.py`**

```python
"""Search workflow.

Three source_types:
- ``web``: Tavily single-shot; returns top Tavily results as-is.
- ``wechat`` / ``publication``: pgvector prefilter (via Next.js /api/explore/search/<type>/prefilter)
  → semops /operators/rank for ranking + reasons.

Pure Python — HTTP orchestration only. No LLM calls in this file; the
LLM work happens inside ``semops /operators/rank``.
"""

from __future__ import annotations

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
    source_type: str                     # "web" | "wechat" | "publication"
    notebook_id: str | None = None
    domains: list[str] = field(default_factory=list)
    model_provider: str = "openai"
    model_name: str = "gpt-4o-mini"
    api_key: str | None = None
    top_k: int = DEFAULT_TOP_K


@dataclass
class SearchResponse:
    items: list[dict[str, Any]]
    reasons: dict[str, str] = field(default_factory=dict)


async def run(req: SearchRequest) -> SearchResponse:
    if req.source_type == "web":
        items = await _invoke_web_search(req)
        return SearchResponse(items=items)

    if req.source_type not in ("wechat", "publication"):
        raise ValueError(f"Unsupported source_type: {req.source_type!r}")

    candidates = await _prefilter(req.source_type, req.query, PREFILTER_LIMIT)
    if not candidates:
        return SearchResponse(items=[])

    ranked = await _semops_rank(
        candidates=candidates,
        query=req.query,
        top_k=req.top_k,
        provider=req.model_provider,
        model=req.model_name,
        api_key=req.api_key,
    )
    return SearchResponse(
        items=ranked.get("ranked", []),
        reasons=ranked.get("reasons") or {},
    )


async def _invoke_web_search(req: SearchRequest) -> list[dict[str, Any]]:
    """Run Tavily through the tools.web.search_web @tool (reuses the API key
    resolution in there). Returns list of {title, url, content} dicts.
    """
    from tools.web import search_web
    import json

    raw = search_web.invoke({"query": req.query, "domains": req.domains or None})
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
    *,
    candidates: list[dict[str, Any]],
    query: str,
    top_k: int,
    provider: str,
    model: str,
    api_key: str | None,
) -> dict[str, Any]:
    model_config: dict[str, Any] = {"provider": provider, "model": model}
    if api_key:
        model_config["api_key"] = api_key

    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{SEMOPS_API_URL}/api/operators/rank",
            json={
                "candidates": candidates,
                "text_field": "text",
                "query": query,
                "top_k": top_k,
                "include_reasons": True,
                "model_config": model_config,
            },
        )
        resp.raise_for_status()
        return resp.json()
```

- [ ] **Step 3: Mount workflow route in `server/app.py`**

Append:

```python
from workflows.search import SearchRequest, SearchResponse, run as run_search


@app.post("/v1/workflows/search", response_model=None)
async def search(req: SearchRequest) -> dict[str, Any]:
    result = await run_search(req)
    return {"items": result.items, "reasons": result.reasons}
```

Use FastAPI's Pydantic-friendly dataclass handling. If the dataclass decorator needs to be swapped for `pydantic.BaseModel` for the route, refactor accordingly.

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit**

```bash
git add apps/agent/workflows/ apps/agent/tests/test_workflows_search.py apps/agent/server/app.py
git commit -m "feat(agent): add workflows/search.py + /v1/workflows/search route"
```

---

### Task 4: deep_research surface

**Files:**
- Create: `apps/agent/surfaces/deep_research.py`
- Create: `apps/agent/prompts/surfaces/deep_research.md`
- Modify: `apps/agent/graphs/surface.py` (add `deep_research_graph`)
- Modify: `apps/agent/langgraph.json` (add `deep_research` entry; remove `search` entry)

- [ ] **Step 1: Prompt**

`apps/agent/prompts/surfaces/deep_research.md`:

```markdown
You are SparkFlow's open-web research agent. Your job is to investigate
topics by iteratively searching the web, reading pages, and synthesizing
findings with inline citations.

Approach:

1. **Reformulate the query.** When the user gives a broad question,
   decompose it into 2-3 concrete search queries. Issue the first via
   ``search_web``.
2. **Skim the results.** Pick the 1-3 most promising URLs by title +
   snippet. Use ``url_fetch`` to read their full text.
3. **Iterate.** After reading, decide whether you have enough evidence.
   If not, run another ``search_web`` with a refined query. Aim for ≤ 5
   total search+fetch rounds.
4. **Synthesize.** Produce a structured answer with inline citations in
   the form ``[domain.tld]`` or ``[Name et al.]`` when the page gives an
   author. Every factual claim needs a source.
5. **End with follow-ups.** Suggest 1-2 deeper dives the user might want.

If ``memory_read(scope="user", category="preference")`` returns research
interests, bias your query reformulation accordingly.
```

- [ ] **Step 2: `surfaces/deep_research.py`**

```python
"""Deep research surface configuration (open-web multi-turn)."""

from config.surfaces import SurfaceConfig
from hermes.context.references import PageContextRef

DEEP_RESEARCH = SurfaceConfig(
    name="deep_research",
    surface_prompt_path="surfaces/deep_research.md",
    toolset={"web", "wiki", "memory", "skills"},
    context_refs=(PageContextRef,),
    memory_scope=("user",),
    max_iterations=40,
)
```

- [ ] **Step 3: Update `graphs/surface.py`**

Append:

```python
from surfaces.deep_research import DEEP_RESEARCH

deep_research_graph = build_graph(DEEP_RESEARCH)
```

- [ ] **Step 4: Update `langgraph.json`**

- Remove `"search": "./graphs/search_agent.py:agent"`.
- Add `"deep_research": "./graphs/surface.py:deep_research_graph"`.

Final:

```json
{
    "dependencies": ["."],
    "graphs": {
        "agent": "./graphs/rag_agent.py:agent",
        "hub": "./graphs/surface.py:hub_graph",
        "notebook": "./graphs/surface.py:notebook_graph",
        "deep_research": "./graphs/surface.py:deep_research_graph"
    },
    "env": ".env",
    "image_distro": "wolfi"
}
```

**Note**: the `search` graph is removed HERE (before Task 10's frontend flip). This is safe because the Next.js route calls langgraph via HTTP — once the route switches to the FastAPI workflow endpoint in Task 6, langgraph's `search` graph becomes unused.

Actually — this creates a brief window where the Next.js route still calls `search` but the graph is gone. Reorder: **keep `search` in langgraph.json in this task; remove it in Task 10 after the frontend flip**.

Revised Task 4 langgraph.json change: **add `deep_research` only; leave `search` alone**.

- [ ] **Step 5: Verify compile**

```bash
cd apps/agent && .venv/bin/python -c "
from graphs.surface import notebook_graph, hub_graph, deep_research_graph
print('deep_research_graph:', type(deep_research_graph).__name__)
from hermes.registry import registry
print('web tools:', sorted(t.name for t in registry.get_tools(toolset={'web'})))
"
```

Expected: graph compiles; web tools visible.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/surfaces/deep_research.py apps/agent/prompts/surfaces/deep_research.md apps/agent/graphs/surface.py apps/agent/langgraph.json
git commit -m "feat(agent): add deep_research surface + register in langgraph.json"
```

---

## Phase B — Frontend wire-up (Tasks 5-6)

### Task 5: Update Next.js sources/search route to call new workflow endpoint

**File:** `apps/web/app/api/notebooks/[id]/sources/search/route.ts`

- [ ] **Step 1: Read current file** — find the fetch call to `${agentUrl}/runs` with `assistant_id: "search"`.

- [ ] **Step 2: Replace** with a POST to the workflow endpoint:

```typescript
const workflowsUrl = process.env.WORKFLOWS_API_URL || "http://localhost:2027";
const response = await fetch(`${workflowsUrl}/v1/workflows/search`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    query,
    source_type: sourceType,
    notebook_id: notebookId,
    domains,
    model_provider: modelProvider,
    model_name: modelName,
    top_k: 10,
  }),
});
```

Remove any reference to `assistant_id`, langgraph-specific envelope fields, `iteration: 0`, etc.

- [ ] **Step 3: Parse the response** — the workflow returns `{ items, reasons }`. Map to the existing `SearchResult` type if needed.

- [ ] **Step 4: Verify lint / typecheck**

```bash
cd apps/web && npm run lint 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/notebooks/[id]/sources/search/route.ts
git commit -m "feat(web): switch sources search to apps/agent workflows endpoint"
```

### Task 6: (deferred) Add deep_research entry point to frontend

Scope this out of P4 as a separate follow-up. Verification of the new surface happens via curl in Task 8.

---

## Phase C — Legacy teardown (Tasks 7-10)

### Task 7: Remove `tools/search_tools.py`

Only after `tools/web.py` + workflow proven. Delete the file. Verify no other module imports `search_web` from the old location.

```bash
grep -rn "from tools.search_tools\|import tools.search_tools" apps/agent/ --include="*.py"
```

Expected: no hits. If `graphs/search_agent.py` still imports it, leave the file until Task 10 deletes the graph itself.

- [ ] **Step 1-3**: Check dependents, delete file, run full test suite.
- [ ] **Step 4**: Commit.

### Task 8: Smoke curl the new workflow + deep_research

- [ ] Start FastAPI: `cd apps/agent && .venv/bin/python -m uvicorn server.app:app --port 2027 &`
- [ ] `curl localhost:2027/v1/healthz` → `{"ok": true}`
- [ ] Start langgraph dev on 2024 with the updated `langgraph.json` — verify `deep_research` graph compiles and serves.
- [ ] No commit (verification only).

### Task 9: Frontend smoke against new backend

- [ ] Run dev stack; open a notebook; trigger wechat/publication search; verify UI gets results.
- [ ] No commit (verification only).

### Task 10: Delete legacy search modules + langgraph.json entry

Only after Tasks 5, 8, 9 pass. Delete:

- `apps/agent/graphs/search_agent.py`
- `apps/agent/prompts/search_agent.py`
- `apps/agent/config/search_agent.py`

Remove `"search": "./graphs/search_agent.py:agent"` from `langgraph.json`.

- [ ] **Step 1-3**: Delete files, edit langgraph.json, verify remaining graphs still import.
- [ ] **Step 4**: Commit.

### Task 11: Verification gate

- [ ] Full agent pytest suite passes.
- [ ] `apps/agent/graphs/surface.py` exports notebook_graph, hub_graph, deep_research_graph.
- [ ] `apps/agent/tools/` has `web.py`, no `search_tools.py`.
- [ ] `apps/agent/graphs/` has `rag_agent.py`, `hub_agent.py`, `surface.py`, `common.py` — no `search_agent.py`.
- [ ] No commit.

---

## Self-review checklist

- [ ] FastAPI app at `apps/agent/server/app.py` serves `/v1/healthz` and `/v1/workflows/search`.
- [ ] `workflows/search.py` handles all 3 source_types; unsupported raises ValueError.
- [ ] `tools/web.py` self-registers `search_web` + `url_fetch` under toolset `"web"`.
- [ ] `surfaces/deep_research.py` uses `{web, wiki, memory, skills}` toolset and max_iterations=40.
- [ ] `langgraph.json` lists: agent (legacy), hub, notebook, deep_research. No `search`.
- [ ] All pytest tests pass.
- [ ] Legacy `search_agent.py` / `search_tools.py` / `prompts/search_agent.py` / `config/search_agent.py` deleted.
- [ ] Frontend `sources/search/route.ts` calls `${WORKFLOWS_API_URL}/v1/workflows/search`.
- [ ] New env vars documented in `.env.example`: `WORKFLOWS_API_URL`, `SEMOPS_API_URL`.

## What's NOT done after P4

- Frontend UX for deep_research (new entry point, chat panel). Lives behind P4; verification is backend-only.
- matcher workflow migration (P5).
- daily_digest orchestrator migration (P6).
- Production WORKFLOWS_API_URL env deployment in `.env.example` / CI — dev flow only.
