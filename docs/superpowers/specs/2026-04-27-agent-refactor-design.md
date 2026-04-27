# `apps/agent` Refactor — First-Principles Simplification + Wiki-Ingest Port

> **Date**: 2026-04-27
> **Branch**: `agent-dev`
> **Reference**: `docs/reference/langgraph-agent-and-workflow.md`
> **Supersedes** (operationally, not formally):
> - the post-P1/P2 state of `docs/superpowers/specs/2026-04-22-hermes-harness-design.md` — Hermes was a real consolidation; the parts that scaled are preserved as flat helpers, the parts that ossified into placeholders are removed.
> - `docs/superpowers/specs/2026-04-27-wiki-ingest-port-to-python-design.md` — that doc's "Phase 2" is folded in here as the fourth workflow (`workflows/wiki_ingest.py`). Doing it inside the refactor (rather than after) is correct because the new `workflows/` directory and Functional API conventions are the natural home; sequencing the port after the refactor is stable means writing `wiki_ingest.py` against the *new* shape from day one instead of porting twice.

## 1. Goal

Strip `apps/agent` back to the patterns shown in the reference doc, and adopt `apps/agent/workflows/` as the single home for every LLM-driven workflow in the repo:

- **Tool-calling agent** (`StateGraph(MessagesState)` with `llm_call ↔ tool_node` + `should_continue`) per surface — built from primitives, not a prebuilt or a parameterized factory.
- **Functional API** (`@entrypoint` / `@task`) for **four** workflows — `search`, `daily_digest`, `matcher`, and the newly-ported `wiki_ingest` — using prompt-chaining, parallelization, and orchestrator-worker patterns where each fits naturally.
- **Eliminate the Node→LLM path entirely**: porting wiki-ingest from `apps/web/lib/services/graph-service.ts` (~720 LOC TS) to Python lets us delete the only Node→LLM gateway (`apps/agent/server/routes/llm_gateway.py` ~299 LOC) and the `litellm` dep that exists solely to back it.

Drop everything that built abstraction without consumers: AST tool discovery, the 9-layer prompt builder, ContextRef placeholder classes, the unmounted skills subsystem, the unseeded memory subsystem, `extra_caller_system`, per-session prompt caching, the LLM gateway and its TS client.

Net effect: `apps/agent` harness shrinks by ~1,200 LOC; `apps/web` shrinks by ~900 LOC of TS; one new ~430-LOC Python workflow lands. Repo-wide: ~1,700 LOC net deletion. Agent code reads paragraph-for-paragraph like the reference doc; every LLM-bound pipeline lives in `apps/agent/workflows/`.

## 2. Non-goals

- **Not** changing the LangGraph runtime, checkpointer, dev/up CLI, or `langgraph.json` shape.
- **Not** changing CopilotKit integration on the frontend.
- **Not** changing the FastAPI workflow server's `/v1/workflows/*` route surface for existing endpoints. The `/v1/llm/*` gateway routes are deleted at the end of the wiki-ingest cutover (no external consumers — only `apps/web/lib/services/graph-service.ts` and `apps/web/lib/providers/list-models.ts`, both of which we own and rewrite as part of this work).
- **Not** changing the ARQ digest worker semantics or the BullMQ ingest worker process / queue / per-user fairness / per-notebook lock on the web side. Only the *body* of the per-job handler changes (it calls `POST /v1/workflows/wiki/extract` instead of running graph-service.ts inline).
- **Not** changing semops or MinerU.
- **Not** dropping Prisma `UserMemory` / `NotebookMemory` tables (we drop only the Python access layer; the tables remain so memory can be re-added later without a migration).
- **Not** dropping the existing `NotebookGraph` / `WikiPage` / `Source` tables or wiki UI components — wiki-ingest port preserves the public schema and the React components consume the same `WikiPage` rows.
- **Not** moving the `prisma.$transaction` commit (wiki upsert + WikiPage upsert + orphan delete + log append) into Python. That stays in Node; Python returns a payload, Node commits.
- **Not** streaming wiki extraction. (Future work; orthogonal.)
- **Not** switching wiki ingest off BullMQ onto ARQ. Queue boundary unchanged.

## 3. Current-state inventory & deletion verification

The deletion list below was verified by grep before this spec was written. Each "drop entirely" entry is justified by zero (or trivially few) production callers.

| Subsystem | Verified usage | Drop? |
|---|---|---|
| `hermes.registry` (incl. AST discovery) | 8 tool modules self-register; `graphs/common.py` reads it | Replace with explicit imports per surface |
| `hermes.prompt_builder.PromptBuilder` (9-layer + cache) | Called by `graphs/common.py:make_llm_call` | Replace with flat 30-LOC `build_system_prompt(...)` |
| `hermes.context.references` placeholders | `WikiContentRef`/`NotebookSourcesRef` render literal "(P1 placeholder)" text into the notebook prompt; `WebSearchContextRef` always returns ""; `PageContextRef` is the only working one | Drop the file; inline `PageContextRef` (4 lines) into `build_system_prompt` |
| `hermes.memory` + `tools/memory.py` | `grep userMemory\|notebookMemory\|user_memory\|notebook_memory apps/web` → **0 hits**. Web app neither reads nor writes the tables. LLM is the only writer. | Drop Python access layer; keep Prisma tables |
| `hermes.skills` + `tools/skills.py` + `apps/agent/skills/*.md` | `SkillsLoader` reads `~/.sparkflow/skills/`. **No docker-compose mounts that path.** Snippet always renders "" in production. | Drop entirely |
| `extra_caller_system` prompt layer | `grep extra_caller_system apps/web` → **0 hits**. No producer. | Drop |
| `tools/_echo.py` + `prompts/surfaces/echo_test.md` | Debug-only smoke surface | Drop |
| `deepagents` dependency in `pyproject.toml` | `grep deepagents apps/agent --include="*.py"` → **0 hits** | Drop |
| `graphs/`, `surfaces/`, `config/` directories | Each holds 1-2 files of glue around `build_graph(SurfaceConfig)` | Collapse into one `agents/<name>.py` file per surface |
| `apps/agent/server/routes/llm_gateway.py` (~299 LOC) | Two consumers: `apps/web/lib/services/graph-service.ts` (wiki ingest LLM calls — replaced by direct Python LLM calls in `workflows/wiki_ingest.py`) and `apps/web/lib/providers/list-models.ts` (BYOK validation — moved to a new `server/routes/llm_models.py`, plain httpx, no litellm). Both consumer rewrites land in step 11. | Drop in step 11 cutover |
| `litellm>=1.50` dep in `pyproject.toml` | `grep litellm apps/agent` → only `server/routes/llm_gateway.py` imports it. Every provider in PROVIDER_MAP is OpenAI-compatible (`f"openai/{model}"` at line 257) so litellm is dispatching through its openai adapter for every call — no value over `langchain-openai` which apps/agent already uses elsewhere. | Drop with the gateway |
| `apps/web/lib/services/graph-service.ts` (~720 LOC TS) | Knowledge-graph extraction + Louvain clustering + wiki-page assembly currently in Node. Verified ~70% is "LLM calls + pure graph algorithms + types" with zero Node/Prisma affinity. | Replace with `workflows/wiki_ingest.py`; delete TS file in step 11 |
| `apps/web/lib/providers/list-models.ts` (~225 LOC TS) | Wraps the `/v1/llm/models` gateway endpoint to power Settings → "Validate BYOK key" UX. | Slim to ~40-LOC client calling the new `POST /v1/workflows/llm/list-models` route (extracted from llm_gateway.py into a litellm-free `routes/llm_models.py`) |
| `openai` Node SDK in `apps/web/package.json` | Only consumer is graph-service.ts:19 (`const { default: OpenAI } = await import("openai")`). | Drop in step 11 along with graph-service.ts |

## 4. Target architecture

### 4.1 Directory layout

```
apps/agent/
├── agents/
│   ├── notebook.py
│   ├── hub.py
│   └── deep_research.py
├── prompts/
│   ├── base_identity.md
│   ├── tool_use_enforcement.md
│   ├── model_hints/{openai,gemini}.md
│   └── surfaces/{notebook,hub,deep_research}.md
├── tools/
│   ├── web.py
│   ├── wiki.py             (renamed from wiki_tools.py)
│   ├── hub_toolbox.py
│   ├── hub_ui.py           (renamed from hub_ui_tools.py; exports HUB_FRONTEND_TOOL_NAMES)
│   ├── hub_nav.py          (renamed from hub_nav_tools.py)
│   ├── hub_wechat.py       (renamed from hub_wechat_tools.py)
│   └── toolbox_client.py
├── workflows/
│   ├── search.py
│   ├── daily_digest.py
│   ├── digest_worker.py
│   ├── digest_tasks.py
│   ├── wiki_ingest.py      (new — port of apps/web/lib/services/graph-service.ts)
│   └── matcher/
│       ├── job.py          (was job_runner.py)
│       ├── lotus.py
│       ├── excel_processor.py
│       ├── query_optimizer.py
│       └── job_store.py
├── server/
│   ├── app.py
│   ├── matcher_types.py
│   ├── wiki_ingest_types.py    (new — Pydantic discriminated-union request models)
│   └── routes/
│       ├── matcher_jobs.py
│       ├── wiki_ingest.py      (new — POST /v1/workflows/wiki/extract)
│       └── llm_models.py       (new — POST /v1/workflows/llm/list-models, extracted from llm_gateway.py; httpx only, no litellm)
├── prompt_builder.py
├── embeddings/
├── scripts/
├── langgraph.json
├── pyproject.toml
└── README.md
```

Deleted: `hermes/`, `graphs/`, `surfaces/`, `config/`, `tools/_echo.py`, `tools/skills.py`, `tools/memory.py`, `apps/agent/skills/`, `prompts/surfaces/echo_test.md`, `server/routes/llm_gateway.py` (after wiki-ingest cutover).

Cross-app deletions / changes (apps/web):

```
apps/web/
├── lib/services/
│   ├── graph-service.ts          DELETED (~720 LOC)
│   └── wiki-ingest.ts            slimmed from ~203 LOC to ~60 LOC: only marks Source.status,
│                                 calls POST /v1/workflows/wiki/extract, and runs the
│                                 prisma.$transaction on the returned payload
├── lib/providers/
│   └── list-models.ts            slimmed from ~225 LOC to ~40 LOC (or deleted if Settings UI
│                                 calls a new tiny BYOK-validation endpoint directly)
├── workers/
│   └── ingest.ts                 body rewritten (~80 LOC) — same queue boundary, new HTTP call
└── package.json                  drop `openai` Node SDK dep after graph-service.ts is gone
```

### 4.2 Layering rules

1. `agents/<surface>.py` defines exactly one compiled LangGraph agent. The shape matches the reference doc's "Agents → Graph API" example: `StateGraph(MessagesState)` + `llm_call` + `tool_node` + `should_continue`.
2. `tools/*.py` defines plain `@tool` functions (LangChain `BaseTool` instances). No registry, no decorator chain. Frontend tools are exposed via a module-level set on the same module that defines them.
3. `prompts/*.md` is the only place prompt copy lives. Python concatenates fragments at request time.
4. `prompt_builder.py` is one function: `build_system_prompt(*, surface, surface_prompt, provider, model, session_id, page_context=None) -> str`.
5. `workflows/*.py` are LangGraph **Functional API** modules — `@entrypoint` for the public callable, `@task` for each unit that benefits from parallel/retry semantics.
6. `server/` is a thin FastAPI shell that maps HTTP endpoints to `entrypoint.ainvoke(req)` calls.

## 5. Per-surface contract

### 5.1 The `Ctx` dataclass

Every surface accepts the same per-request runtime context shape:

```python
@dataclass
class Ctx:
    model_provider: str          # BYOK provider identifier
    model_name: str              # BYOK model identifier
    api_key: str                 # BYOK key (required; no env fallback)
    user_id: str
    session_id: str
    notebook_id: str | None = None    # only notebook surface uses
    page_context: str | None = None   # hub / deep_research surfaces use
```

Notebook uses `notebook_id`; hub/deep_research use `page_context`; both ignore the other field. No surface-specific subclassing — the shared `Ctx` keeps the runtime injection point identical across surfaces and lets the prompt builder treat both as optional.

### 5.2 The agent module

Each `agents/<surface>.py` is structurally identical to the reference doc's "Agents → Graph API" code, plus three surface-specific bindings:

1. `TOOLS = [...]` — explicit list of `@tool` imports. (Hub adds `HUB_FRONTEND_TOOL_NAMES`.)
2. `SURFACE = "<name>"` and `PROMPT_PATH = "surfaces/<name>.md"` — used by `build_system_prompt`.
3. The `tool_node` for hub additionally `continue`s on `call["name"] in HUB_FRONTEND_TOOL_NAMES` — frontend tools are not server-executed; the SDK passes the raw `AIMessage` to CopilotKit.

`llm_call` resolves the BYOK key from `runtime.context`, builds the system prompt, calls `init_chat_model("provider:model", api_key=...).bind_tools(TOOLS).invoke([SystemMessage(prompt), *state["messages"]])`. Async tool calls dispatch via `await tool.ainvoke(...)` when the tool exposes it, else `tool.invoke(...)`.

### 5.3 Frontend tools (hub only)

Hub's CopilotKit-rendered tools (`show_table`, `show_chart`, `show_stat_card`, `show_select`, `show_confirm`, `show_navigation`) are declared in `tools/hub_ui.py`:

```python
HUB_FRONTEND_TOOL_NAMES = {"show_stat_card","show_table","show_chart","show_select","show_confirm","show_navigation"}
HUB_FRONTEND_TOOLS = [show_stat_card, show_table, show_chart, show_select, show_confirm, show_navigation]
```

`agents/hub.py` includes both backend and frontend tools in `TOOLS` (so the LLM sees the schema and can emit calls). No `frontend=True` registry flag, no `ToolEntry` indirection.

**Loop-exit semantics**: hub's `_should_continue` MUST route to `END` when *every* tool_call on the last `AIMessage` is in `HUB_FRONTEND_TOOL_NAMES`. The current `graphs/common.py:tool_node` returns `[]` for an all-frontend turn, but `_should_continue` only checks `bool(tool_calls)` — so the loop re-enters `llm_call` with no `ToolMessage` answers, and the LLM either repeats the call (burning a turn) or hallucinates a follow-up. The new shape fixes this:

```python
def _should_continue(state: MessagesState):
    last = state["messages"][-1]
    tool_calls = getattr(last, "tool_calls", None) or []
    if not tool_calls:
        return END
    if all(tc["name"] in HUB_FRONTEND_TOOL_NAMES for tc in tool_calls):
        return END   # frontend renders these; nothing to dispatch server-side
    return "tool_node"
```

For mixed turns (one frontend + one backend), `_should_continue` routes to `tool_node`, which dispatches the backend tool and skips the frontend ones (same skip logic as today). The frontend `AIMessage` reaches the client via the SDK regardless of which branch we took.

Notebook and deep_research surfaces have no frontend tools — their `_should_continue` is the canonical `if last.tool_calls: "tool_node" else: END`.

## 6. `prompt_builder.py` contract

```python
def build_system_prompt(
    *,
    surface: str,
    surface_prompt: str,         # path under prompts/, e.g. "surfaces/notebook.md"
    provider: str,
    model: str,
    session_id: str,
    page_context: str | None = None,
) -> str:
    """
    Concatenate (in order):
      1. base_identity.md
      2. tool_use_enforcement.md
      3. model_hints/{openai|gemini}.md  (if provider matches; else skipped)
      4. <surface_prompt> contents
      5. page_context block (if provided)
      6. session metadata (session_id / surface / model / timestamp)
    """
```

No class. No cache. No memory. No skills. No ContextRef Protocol. Recomputed per turn (cheap — markdown fragments are small and the OS page-caches them).

The OpenAI-hint family list (openai/gpt/codex/deepseek/glm/zhipu/minimax/kimi/moonshot/custom) and Gemini-hint family list (google/gemini) move from `hermes.prompt_builder` to module-level constants in `prompt_builder.py`.

## 6.1 Functional API runtime contract

The Functional API (`@entrypoint`, `@task`) interacts with three runtimes in this codebase: FastAPI's anyio-backed BackgroundTasks, the ARQ async worker, and direct `await` from HTTP route handlers. Pin the runtime contract here so the implementation plan doesn't have to re-derive it.

**Library version pin** (added to `pyproject.toml`): `langgraph>=0.6,<0.7`. The Functional API stabilized in 0.5; pinning to 0.6.x keeps the API surface stable across the migration. Bump explicitly when upgrading; do not let a transitive upgrade move us off this line.

**`@task` invocation idiom** (per ref doc §Functional API parallelization and orchestrator-worker examples): tasks are kicked off without await, then aggregated with **sync `.result()`**, even inside `async def` entrypoints. The runtime resolves the futures whether the task wraps a sync `def` or `async def`. **Do not write `await fut.result()`** — it either fails on a SyncFuture or breaks the deterministic-replay contract on an AsyncFuture. The aggregator pattern across this spec is:

```python
futs = [task_func(x) for x in items]   # no await
results = [f.result() for f in futs]   # sync, runtime resolves
```

**Checkpointer**: entrypoints in this codebase do **not** declare a checkpointer. Each request is a fresh run; there is no resume-after-restart requirement (the matcher's persistence is handled by `JobStore`; the digest's by ARQ). Default in-memory checkpointer is acceptable. If a future feature wants Postgres-backed entrypoint replay, add it surface-by-surface.

**Cross-runtime safety**:
- **FastAPI BackgroundTasks**: the matcher entrypoint is Graph API (§7.3) and runs sync via `asyncio.to_thread(graph.invoke, ...)` — pandas + FAISS would block the event loop otherwise. Verified pattern.
- **ARQ workers**: the digest entrypoint runs via `await generate_section.ainvoke(req)` from `arq_generate_section`. ARQ owns the loop; the entrypoint must be loop-agnostic at module-import time (no `asyncio.get_event_loop()` at decoration) — the Functional API satisfies this since it doesn't bind to a loop until the entrypoint is invoked.
- **HTTP routes**: search is plain `async def` (§7.1). Wiki-ingest and digest's HTTP-triggered call sites use `await entrypoint.ainvoke(req)` directly — runtime is the FastAPI worker loop.

**Exception propagation**: `@task` exceptions surface via `fut.result()` raising. Inside `async def` entrypoints, wrap aggregator steps in try/except where the spec requires structured error envelopes (digest §7.2, wiki-ingest §7.4). The graph-API matcher catches at `_run_and_persist` boundary (§7.3).

## 7. Workflow contracts (Functional API + Graph API)

### 7.1 `workflows/search.py` — plain `async def` (NOT Functional API)

`search.py` does **not** use `@entrypoint`/`@task`. The chain is a single branch (`web` vs `wechat`/`publication`), each branch is 1–3 sequential awaited HTTP calls with no parallelism, no checkpoint replay value, and no streaming consumer. Wrapping in Functional API would add ceremony with zero payoff. **Search is the deliberate exception** to the "all workflows on Functional API" rule.

```python
async def search(req: SearchRequest) -> SearchResponse:
    if req.source_type == "web":
        return SearchResponse(items=await _web_search(req))
    if req.source_type not in ("wechat", "publication"):
        raise ValueError(f"Unsupported source_type: {req.source_type!r}")
    candidates = await _prefilter(req.source_type, req.query, PREFILTER_LIMIT)
    if not candidates:
        return SearchResponse(items=[])
    ranked = await _semops_rank(candidates, req.query, req.top_k, _lm(req))
    return SearchResponse(items=ranked.get("ranked", []), reasons=ranked.get("reasons") or {})
```

The HTTP route in `server/app.py` calls `await search(req)` directly. Helpers stay module-private.

### 7.2 `workflows/daily_digest.py` — parallelization + chain (ref doc §Parallelization, Functional API)

Per-query prefilter calls run in parallel via `[task(q) for q in enabled]` then `merge_pool`. Pure-Python steps (assemble candidate text, transform to DigestItem) stay as in-line helpers — they don't need `@task`. The terminal `_complete_section` HTTP callback becomes a `@task` so retries reuse it.

```python
@task async def prefilter_query(query_text: str, source_ids: list[int]) -> list[dict]: ...
@task async def merge_pool(per_query: list[list[dict]]) -> list[dict]: ...
@task async def semops_rank(candidates, query_text, top_k, lm_config) -> dict: ...
@task async def callback(section_id: str, status: str, **kw) -> None: ...

@entrypoint()
async def generate_section(req: GenerateSectionRequest) -> None:
    enabled = [q for q in req.queries if q.get("enabled")]
    # Per ref doc §Parallelization Functional API: tasks are kicked off without await,
    # then aggregated with sync .result(). Even inside an async entrypoint, the canonical
    # aggregator shape is sync — runtime resolves the futures.
    futures = [prefilter_query(q["text"], req.subscribed_source_ids) for q in enabled]
    pool = merge_pool([f.result() for f in futures]).result()
    if not pool:
        callback(req.section_id, "EMPTY", items=[]).result()
        return
    semops_candidates = _build_semops_candidates(pool)   # plain helper
    joint_query = " ".join(q["text"] for q in enabled)
    try:
        ranked = semops_rank(semops_candidates, joint_query, req.top_n, _lm(req)).result()
    except Exception as exc:
        callback(req.section_id, "FAILED", error=str(exc)).result()
        return
    items = _to_digest_items(pool, ranked)               # plain helper
    callback(req.section_id, "COMPLETED", items=items, model_used=f"{req.model_provider}/{req.model_name}",
             completed_at=datetime.now(tz=timezone.utc).isoformat()).result()
```

ARQ adapter (`workflows/digest_tasks.py:arq_generate_section`) calls `await generate_section.ainvoke(req)` instead of `await daily_digest.generate_section(req)`. Worker semantics unchanged.

### 7.3 `workflows/matcher/job.py` — orchestrator-worker via **Graph API + `Send`** (ref doc §Creating workers in LangGraph)

The matcher fits the canonical `Send` shape exactly: BUs are unknown at graph-build time, dispatch is dynamic, results aggregate, and progress reporting is incremental. Graph API + `Send` (per ref doc §"Creating workers in LangGraph") is the right pattern — Functional API would force sync `.result()` blocking and re-implement aggregation manually. Bonus: per-BU updates land naturally in `astream(stream_mode="updates")`, unlocking the §12 SSE-from-stream follow-up for free.

```python
from typing import Annotated, TypedDict
import operator
from langgraph.graph import START, END, StateGraph
from langgraph.types import Send

class JobState(TypedDict):
    job_id: str
    target_df: pd.DataFrame
    queries_by_bu: dict[str, list[str]]
    optimized: dict[str, OptimizedQuery]
    results_by_bu: Annotated[dict[str, pd.DataFrame], _merge_dict]   # workers append here
    excel_bytes: bytes
    total_matches: int
    req: MatchJobRequest

class WorkerState(TypedDict):
    bu: str
    optimized: OptimizedQuery
    target_df: pd.DataFrame
    req: MatchJobRequest

def orchestrator(state: JobState) -> dict:
    """Group queries by BU, optimize each (LLM call per BU)."""
    job_store.update_job(state["job_id"], status="PROCESSING", started_at=datetime.utcnow())
    queries_by_bu = _group_by_bu(state["req"].queries)
    optimized = {
        bu: query_optimizer.optimize(bu, qs, state["req"].target_type, state["req"].lm)
        for bu, qs in queries_by_bu.items()
    }
    job_store.update_job(state["job_id"], progress=30,
                         query_data=_enriched(state["req"].queries, optimized))
    return {"queries_by_bu": queries_by_bu, "optimized": optimized}

def assign_workers(state: JobState) -> list[Send]:
    """Dispatch one rank_bu worker per BU. Mirrors ref doc §Creating workers in LangGraph."""
    return [
        Send("rank_bu", {"bu": bu, "optimized": opt, "target_df": state["target_df"],
                         "req": state["req"]})
        for bu, opt in state["optimized"].items()
    ]

def rank_bu(ws: WorkerState) -> dict:
    """Worker — runs LOTUS pipeline for one BU. Writes one entry into results_by_bu."""
    matches_df = LotusMatcher().run_pipeline(
        df=ws["target_df"], query_text=ws["optimized"].optimized_query_en,
        query_name=ws["bu"], top_k=ws["req"].top_k, search_k=ws["req"].search_k,
        include_reasons=ws["req"].include_reasons, index_dir=ws["req"].index_dir,
        model_provider=ws["req"].lm.provider, model_name=ws["req"].lm.model,
        api_key=ws["req"].lm.api_key, api_base=ws["req"].lm.api_base,
    )
    return {"results_by_bu": {ws["bu"]: matches_df}}

def synthesize(state: JobState) -> dict:
    """Aggregate per-BU DataFrames into the master Excel file."""
    job_store.update_job(state["job_id"], progress=85, error_message="Creating result file...")
    excel_bytes = ExcelProcessor().create_result_excel(
        results_by_query=state["results_by_bu"],
        master_df=_build_master(state["target_df"], state["results_by_bu"], state["req"].include_reasons),
    )
    return {"excel_bytes": excel_bytes,
            "total_matches": sum(len(df) for df in state["results_by_bu"].values())}

def _merge_dict(left: dict, right: dict) -> dict:
    return {**left, **right}

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

**JobStore writes stay as plain function calls inside nodes** — not wrapped in `@task`. JobStore is a process-local in-memory singleton; the SSE `/jobs/{id}/stream` reader polls it every 1s and expects strict ordering. Wrapping writes in `@task` would introduce checkpoint-materialization windows where the SSE shows stale progress.

`server/routes/matcher_jobs.py:create_job` calls:

```python
async def _run_and_persist(job_id: str, req: MatchJobRequest):
    try:
        # match_job_graph.invoke is sync (pandas-heavy LOTUS pipeline blocks the loop);
        # run it in a thread to keep FastAPI responsive.
        final_state = await asyncio.to_thread(match_job_graph.invoke,
                                              {"job_id": job_id, "target_df": pd.DataFrame(req.target_data),
                                               "req": req, "results_by_bu": {}})
        job_store.update_job(job_id, status="COMPLETED", progress=100,
                              result_data=final_state["excel_bytes"],
                              match_count=final_state["total_matches"],
                              completed_at=datetime.utcnow(), error_message=None)
    except Exception as exc:
        logger.exception(f"Job {job_id} failed: {exc}")
        job_store.update_job(job_id, status="FAILED", error_message=str(exc),
                              completed_at=datetime.utcnow())

# In the route:
background_tasks.add_task(_run_and_persist, job_id, req)
```

The `/jobs/{id}/stream` SSE endpoint reads `JobStore` exactly as before — the streaming contract is unchanged. (Future enhancement: replace polling with `match_job_graph.astream(stream_mode="updates")` per §12.)

### 7.4 `workflows/wiki_ingest.py` — chain pattern (ref doc §Functional API)

Port of `apps/web/lib/services/graph-service.ts`. Five logical steps; first and last are LLM-bound, the middle three are pure Python.

```python
@task async def extract_graph(content: str, title: str, source_id: str,
                              existing_labels: list[str], lm: LMConfig) -> Extraction: ...
@task async def build_wiki_pages(graph: Graph, communities: dict[int, list[str]],
                                  source_map: dict[str, SourceMeta], lm: LMConfig) -> list[WikiPagePayload]: ...

# Pure helpers — not @task; inlined into the entrypoint
def _merge_graph(existing: Graph | None, new: Extraction) -> Graph: ...
def _cluster_graph(merged: Graph) -> dict[int, list[str]]: ...   # networkx.community.louvain_communities
def _build_index_page(graph, communities, community_pages) -> WikiPagePayload: ...

@entrypoint()
async def extract_wiki(req: WikiExtractRequest) -> WikiExtractResult:
    # mode == "extract": new source ingest
    # mode == "remove": surgical source removal + re-cluster
    if req.mode == "extract":
        extraction = extract_graph(
            req.source_content, req.source_title, req.source_id,
            req.existing_node_labels, _lm(req)
        ).result()
        merged = _merge_graph(req.existing_graph, extraction)
        extraction_report = _build_extraction_report(req.existing_graph, extraction)
        normalized_title = extraction.normalized_title or req.source_title
    else:  # remove
        merged = _filter_source(req.existing_graph, req.source_id)
        extraction = None
        extraction_report = None
        normalized_title = req.source_title

    communities = _cluster_graph(merged)
    community_pages = build_wiki_pages(
        merged, communities, _source_map_from(req), _lm(req)
    ).result()
    index_page = _build_index_page(merged, communities, community_pages)
    log_entry = _format_log(req.source_id, extraction, len(community_pages))

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

**Pydantic request schema** uses a discriminated union to make the mode-conditional fields explicit:

```python
from typing import Annotated, Literal, Optional, Union
from pydantic import BaseModel, Field, model_validator

class _BaseWikiReq(BaseModel):
    notebook_id: str
    source_id: str
    user_id: str
    source_title: str
    existing_graph: Optional[dict] = None     # required when mode=remove; optional when extract
    byok: BYOKConfig

class WikiExtractMode(_BaseWikiReq):
    mode: Literal["extract"] = "extract"
    source_content: str                        # required
    existing_node_labels: list[str] = []

    @model_validator(mode="after")
    def _content_required(self):
        if not self.source_content:
            raise ValueError("source_content required for mode=extract")
        return self

class WikiRemoveMode(_BaseWikiReq):
    mode: Literal["remove"]

    @model_validator(mode="after")
    def _graph_required(self):
        if not self.existing_graph:
            raise ValueError("existing_graph required for mode=remove")
        return self

WikiExtractRequest = Annotated[
    Union[WikiExtractMode, WikiRemoveMode],
    Field(discriminator="mode"),
]
```

**HTTP contract** (`POST /v1/workflows/wiki/extract`, gated by `X-Internal-Token: ${INTERNAL_CALLBACK_TOKEN}`):

Request:
```json
{
  "mode": "extract" | "remove",
  "notebookId": "...",
  "sourceId": "...",
  "userId": "...",
  "sourceTitle": "...",
  "sourceContent": "<MinerU-extracted markdown>",
  "existingNodeLabels": ["..."],
  "existingGraph": { "nodes": [...], "edges": [...] } | null,
  "byok": {"provider": "...", "model": "...", "apiKey": "...", "baseUrl": "..."}
}
```

Response:
```json
{
  "normalizedTitle": "...",
  "extraction": {"nodes": [...], "edges": [...]} | null,
  "extractionReport": {                           // null on mode=remove; present on mode=extract
    "nodes": [...],                                // node projection for UI
    "edges": [...],                                // edge projection
    "crossRefs": [{"label":"...","existingSourceIds":["..."]}, ...]
  } | null,
  "mergedGraph": {"nodes": [...], "edges": [...]},
  "communities": {"0": ["NodeA", "NodeB"], ...},
  "communityPages": [{"slug":"community-0","title":"...","markdown":"...","sourceIds":[...]}],
  "indexPage": {"slug":"index","title":"Wiki Index","markdown":"..."},
  "logEntry": "..."
}
```

**Hidden contracts that the port MUST preserve** (these were not in the per-section feature list of the original wiki-ingest spec; verified by reading `apps/web/lib/services/graph-service.ts:610-625` and `apps/web/lib/services/wiki-ingest.ts:42-54`):

- `extractionReport.crossRefs` — synthesized in `_merge_graph` by comparing extracted nodes against the existing graph; consumed by the UI to surface "this concept already appears in source X" hints.
- `Source.title = result.normalized_title` — the worker must write this on `mode=extract` (it currently happens before the `prisma.$transaction` in graph-service.ts).
- `Source.metadata.extractionReport = result.extraction_report` — serialized into Source.metadata so the UI can render the cross-refs without re-running extraction.
- `Source.metadata.wikiStatus` transitions: `starting → extracting → merging → clustering → generating → done | failed`. Today the Node code writes these at specific milestones via `prisma.source.update`. The port must preserve this granularity. Two options: (a) the worker streams progress by hitting the workflow API multiple times — rejected (Python becomes stateful); (b) the worker writes `wikiStatus` at the same logical milestones it does today, treating the Python call as one big "extracting → generating" span and updating before/after — **accepted**. Document explicitly in the worker pseudo-code below.
- `Source.metadata.wikiError` — written on failure; preserved.

Error envelope (matches the existing `/v1/workflows/daily_digest/*` shape):

```json
{"error": {"code": "INVALID_KEY|TIMEOUT|UPSTREAM_ERROR|BAD_INPUT|EXTRACTION_FAILED",
           "providerId": "...", "message": "..."}}
```

**Worker side** (`apps/web/workers/ingest.ts`) becomes:

```ts
async function processJob(job) {
  const source = await prisma.source.findUniqueOrThrow({...});
  const graph  = await prisma.notebookGraph.findUnique({...});
  const byok   = await resolveApiKey(userId, settings.wikiModelProvider);

  await prisma.source.update({ where: { id: sourceId }, data: { status: "INGESTING" } });

  const result = await fetch(`${WORKFLOWS_API_URL}/v1/workflows/wiki/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": INTERNAL_CALLBACK_TOKEN },
    body: JSON.stringify({ mode: "extract", notebookId, sourceId, userId,
                            sourceTitle: source.title, sourceContent: source.markdown,
                            existingNodeLabels: graph?.graphData?.nodes.map(n => n.label) ?? [],
                            existingGraph: graph?.graphData ?? null,
                            byok: { provider: settings.wikiModelProvider,
                                    model: settings.wikiModelName, ...byok } }),
  }).then(r => r.json());

  // Hidden-contract writes that today happen in graph-service.ts before/around the txn:
  await prisma.source.update({ where: { id: sourceId },
    data: { title: result.normalizedTitle,
            metadata: { ...source.metadata, extractionReport: result.extractionReport,
                        wikiStatus: "generating" }}});

  await prisma.$transaction(async (tx) => {
    await tx.notebookGraph.upsert({...});                                  // unchanged
    for (const page of [result.indexPage, ...result.communityPages]) {     // unchanged
      await tx.wikiPage.upsert({...});
    }
    await tx.wikiPage.deleteMany({ where: orphanFilter });                 // unchanged
    await tx.wikiPageLog.create({ data: { content: result.logEntry, ... }});
  });
  await prisma.source.update({ where: { id: sourceId },
    data: { status: "READY",
            metadata: { ...source.metadata, wikiStatus: "done" }}});
}
```

The transactional commit body is unchanged byte-for-byte; what moves is the *production* of `result` (Python) and the addition of explicit `Source.title` / `Source.metadata.extractionReport` / `Source.metadata.wikiStatus` writes outside the txn (these existed in the TS code in scattered locations and are now consolidated). `removeSourceFromWiki` calls the same endpoint with `mode: "remove"` (the second branch in the entrypoint above), keeping surgical-remove behavior.

**Cutover safety**: there is no feature flag and no soak window. This is a 1-team internal-network deployment; the diff-test in step 9 (run identical input through both implementations and compare output) is the gate. If a regression appears post-cutover, the rollback is `git revert` of the cutover PR. The original Phase-1-style flag + multi-week soak proposal was rejected as ceremony exceeding the risk it mitigates.

## 8. `langgraph.json` & runtime config

```json
{
  "$schema": "https://langgra.ph/schema.json",
  "dependencies": ["."],
  "graphs": {
    "notebook": "./agents/notebook.py:agent",
    "hub": "./agents/hub.py:agent",
    "deep_research": "./agents/deep_research.py:agent"
  },
  "env": ".env",
  "image_distro": "wolfi"
}
```

`apps/web` references graph names in its LangGraph SDK calls. Before step 2 of the migration, audit `apps/web/lib/langgraph-*.ts` (and CopilotKit configuration) for any hardcoded `"agent"` graph name and rename to `"notebook"` in the same change. The current `langgraph.json` already exposes `notebook` / `hub` / `deep_research` — so this is already consistent and no web-side change is needed during this refactor.

`pyproject.toml` changes:
- Drop `deepagents` (unused).
- Drop `litellm` (only used by the about-to-be-deleted `llm_gateway.py`; verified zero other consumers).
- Add `networkx>=3.0` (replaces `graphology` + `graphology-communities-louvain` from the TS side). NetworkX 3+ ships `community.louvain_communities` built-in — no extra packages needed.
- `[tool.hatch.build.targets.wheel].packages = ["agents", "tools", "prompts", "embeddings", "workflows"]` (drop `graphs`, `hermes`, `config`, `surfaces`; add `agents`; `server` already present).

`apps/web/package.json` change (after wiki-ingest cutover, step 11):
- Drop `openai` Node SDK dep (verified only consumer is `graph-service.ts`).

## 9. Migration order

11 steps. Each lands as an independent commit; the system stays runnable after every step. Steps 1–8 are agent-internal. Steps 9–11 are the wiki-ingest port and gateway demolition (cross-app — `apps/web` + `apps/agent`). No feature flag, no multi-week soak — the step-9 diff harness is the cutover gate; `git revert` is the rollback.

| # | Step | Touch | Verification |
|---|---|---|---|
| 1 | Add `prompt_builder.py`. New `test_prompt_builder.py`. Hermes prompt builder still in use. | new file + test | unit tests green |
| 2 | Add `agents/{notebook,hub,deep_research}.py` using new `prompt_builder.py` and direct tool imports. Tools still self-register via hermes registry — that's fine, the imports also happen explicitly here. Update `langgraph.json` graph entries. Delete `graphs/`, `surfaces/`, `config/`. | new files; graph swap | `langgraph dev` smoke; chat in each surface |
| 3 | Drop `registry.register(...)` blocks from `tools/*.py`. Each module's tool list becomes the explicit `from tools.X import ...` in agents. Delete `hermes/registry.py`. | tools/ + hermes deletion | `pytest tests/test_smoke.py` plus surface smokes |
| 4 | Delete `hermes/` entirely (memory, skills, context, prompt_builder, registry). Delete `tools/memory.py`, `tools/skills.py`, `tools/_echo.py`, `apps/agent/skills/`, `prompts/surfaces/echo_test.md`. Drop the legacy tests they backed. Update `pyproject.toml`. | bulk deletes | `pytest` green; remaining tests cover surfaces + workflows + server |
| 5 | Convert `workflows/search.py` to Functional API. `server/app.py:search` route becomes `await search.ainvoke(req)`. | workflows/search.py + server/app.py | `pytest tests/test_workflows_search.py` (rewritten) |
| 6 | Convert `workflows/daily_digest.py` to Functional API; per-query prefilter parallelized. ARQ adapter switches to `generate_section.ainvoke(req)`. | workflows/daily_digest.py + workflows/digest_tasks.py | `pytest tests/test_workflows_daily_digest.py + test_workflows_digest_tasks.py` (rewritten) |
| 7 | Rename `workflows/matcher/job_runner.py` → `workflows/matcher/job.py`; convert to Functional API orchestrator-worker; update `server/routes/matcher_jobs.py`. | workflows/matcher/job.py + matcher_jobs.py | `pytest tests/test_matcher_workflow.py` (rewritten); manual `/v1/workflows/matcher/jobs` smoke |
| 8 | Update `apps/agent/README.md`. Update root `CLAUDE.md` if it references hermes/graphs/surfaces by path. | docs | grep clean |
| 9 | **Wiki-ingest spike (Python only).** Add `workflows/wiki_ingest.py` with `extract_graph` + `_merge_graph` (incl. `crossRefs` synthesis) + `_cluster_graph` + `build_wiki_pages` + `_build_index_page` + `_filter_source` + `extract_wiki` `@entrypoint`. Use langchain-openai (same client pattern as `daily_digest.py`). Add `networkx>=3.0` to deps. No FastAPI route yet. **Diff harness**: pick 3 sources from a dev notebook (one short, one long, one with code blocks); run both the current TS path and the new Python path against each; assert node count within ±5%, edge count within ±10%, community count exact-match-or-±1, every source-id from input appears in some `WikiPage.sourceRefs`, `extractionReport.crossRefs` matches semantically. | new workflows/wiki_ingest.py + tests + diff harness script | `pytest tests/test_wiki_ingest.py`; manual diff harness output |
| 10 | **Wiki-ingest route + `/v1/llm/models` extraction.** Add `server/routes/wiki_ingest.py` (`POST /v1/workflows/wiki/extract`, `INTERNAL_CALLBACK_TOKEN`, structured error envelope) + Pydantic discriminated-union models in `server/wiki_ingest_types.py`. Extract the `/v1/llm/models` route from `llm_gateway.py` into `server/routes/llm_models.py` using plain `httpx.AsyncClient` (no litellm) — preserves the BYOK validation contract Settings UI relies on. Wire both into `server/app.py`. | new routes + types | `pytest tests/test_wiki_ingest_router.py + test_llm_models.py`; `curl` smoke from inside docker network |
| 11 | **Cutover** (single PR). Rewrite `apps/web/workers/ingest.ts` to call `POST /v1/workflows/wiki/extract` and run the existing `prisma.$transaction` on the response. Slim `apps/web/lib/services/wiki-ingest.ts` from ~203 LOC to ~60 LOC (status writes + Python call + transaction helper). Slim `apps/web/lib/providers/list-models.ts` from ~225 LOC to ~40 LOC (thin client to the new Python `/v1/llm/models` route). Delete `apps/web/lib/services/graph-service.ts`. Delete `apps/agent/server/routes/llm_gateway.py`. Remove `app.include_router(llm_gateway_router)` from `server/app.py`. Drop `litellm` from `pyproject.toml`. Drop `openai` from `apps/web/package.json`. Update `apps/web/CLAUDE.md` and `apps/agent/CLAUDE.md` to describe wiki ingest under `apps/agent/workflows/`. **No feature flag, no soak window** — the diff harness in step 9 is the gate; `git revert` is the rollback. | cross-app cutover | full E2E (upload PDF → wait → see wiki rendered); grep verifies zero references to removed modules |

## 10. Tests

Drop:
- `tests/test_registry.py`
- `tests/test_discover.py`
- `tests/test_skills_index.py`
- `tests/test_skills_loader.py`
- `tests/test_memory_store.py`
- `tests/test_memory_tools.py`
- `tests/test_context_references.py`
- `tests/test_graphs_common.py`
- `tests/test_graphs_surface.py`
- `tests/fixtures/fake_tools/`

Rewrite:
- `tests/test_prompt_builder.py` — exercise `build_system_prompt(...)` with each provider class, with/without page_context, asserting the markdown fragments concatenate in the documented order.
- `tests/test_workflows_search.py` — call `await search.ainvoke(req)` with mocked httpx; assert one of the three branches per parametrize.
- `tests/test_workflows_daily_digest.py` + `tests/test_workflows_digest_tasks.py` — exercise the Functional API entrypoint; assert per-query prefilter parallelism via mocked counter.
- `tests/test_matcher_workflow.py` — exercise `await run_match_job.ainvoke(...)` with mocked semops + LotusMatcher; assert results-by-BU shape and Excel bytes are produced.

Add:
- `tests/test_agents.py` — for each surface, import the module-level `agent`, run `agent.invoke({"messages":[HumanMessage("ping")]}, context=Ctx(...))` against a fake LLM (langchain-core's `FakeListChatModel` or our own stub). Enumerate paths explicitly:
  - **notebook**: backend tool dispatched correctly; unknown-tool name produces structured `{"error":"unknown tool ..."}` ToolMessage; final AIMessage produced after tool returns.
  - **hub** — four paths required (regression-prone surface):
    1. all-backend tool_calls → tool_node dispatches, ToolMessages produced, loop continues.
    2. all-frontend tool_calls → `_should_continue` routes to END (no extra LLM turn, no repeated frontend call).
    3. mixed (one frontend + one backend) → tool_node dispatches the backend, skips the frontend, returns one ToolMessage; loop continues; final AIMessage produced.
    4. unknown-tool name → structured error ToolMessage; loop continues.
  - **deep_research**: backend dispatch + unknown-tool error path.
- `tests/test_wiki_ingest.py` — round-trip: feed fixed sourceContent into `extract_wiki.ainvoke(req)` with the langchain-openai client mocked to return canned graph extractions; assert the returned shape (incl. `extraction_report.crossRefs`), `community-*` slugs, index page content, source-id preservation. Test the `mode: "remove"` branch end-to-end (existing graph minus source → re-cluster → community pages don't reference removed source). Test the Pydantic discriminated-union: `mode=extract` without `source_content` raises ValidationError; `mode=remove` without `existing_graph` raises ValidationError. One test that triggers an upstream LLM error and asserts the apiKey does NOT appear in `caplog`.
- `tests/test_wiki_ingest_router.py` — `POST /v1/workflows/wiki/extract` with a TestClient: 401 without `X-Internal-Token`, 200 with a mocked `extract_wiki.ainvoke`, structured error envelope on internal exception.
- `tests/test_llm_models.py` — `POST /v1/workflows/llm/list-models` with mocked httpx upstream: 401 without token, 200 returns the upstream `/v1/models` payload filtered to chat models, error envelope on upstream failure.
- `tests/test_matcher_workflow.py` (rewritten for Graph API) — invoke `match_job_graph.invoke({"job_id":"...","target_df":...,"req":..., "results_by_bu":{}})` with mocked `LotusMatcher.run_pipeline` and `query_optimizer.optimize`; assert the `Send` dispatch fires N workers for N BUs, results aggregate via `_merge_dict`, `synthesize` produces excel bytes. Add a test that asserts `JobStore` writes happen at the documented progress milestones (5/30/85/100).

Existing tests preserved as-is: `tests/test_smoke.py` (rewrites the single hermes import), `tests/test_server_app.py` (loses llm_gateway route assertions in step 11; gains llm_models + wiki_ingest), `tests/test_tools_web.py`.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Graph-name drift between `langgraph.json` and `apps/web` SDK calls | Already aligned (`notebook`/`hub`/`deep_research`). Audit `apps/web/lib/langgraph-*.ts` before step 2 to confirm. |
| Functional API cancellation behavior in FastAPI `BackgroundTasks` | Matcher's background-task pattern is unchanged at the FastAPI level; we only swap what the task awaits. ARQ digest worker similarly unchanged at the ARQ level. |
| Sync/async tool dispatch in the new `tool_node` | New `tool_node` keeps the dual-path: `await tool.ainvoke(args)` if the tool defines it, else `tool.invoke(args)`. Same as current `graphs/common.py`. |
| Prisma `UserMemory` / `NotebookMemory` rows orphaned | No migration; the tables remain. Note in README that the Python access layer is removed and can be re-added later. |
| Frontend tool rendering breaks during step 2 | Hub agent's local `tool_node` keeps the `name in HUB_FRONTEND_TOOL_NAMES` skip semantics. Manual hub smoke after step 2. |
| Tests reference `hermes.*` | Tests that test deleted subsystems are deleted, not adapted. The remaining tests (`test_smoke.py`, `test_server_app.py`, `test_tools_web.py`) only need import path fixups, which step 4 handles in the same commit as the bulk deletes. |
| Concurrent reviewers / branches | Steps 1–8 are inside `apps/agent/`. Steps 9–12 touch `apps/web` (workers, lib/services, lib/providers, package.json). All changes funnel through this single spec. |
| **Louvain community-id stability** between TS (`graphology-communities-louvain`) and Python (`networkx.community.louvain_communities`) | IDs differ across implementations due to random tie-breaks. `community-{id}` slugs are regenerated every ingest and the worker's `wikiPage.deleteMany({where: {NOT IN writtenSlugs}})` orphan-page filter handles re-numbering atomically. Slug collisions across runs cause content overwrite via `upsert`, which is the desired behavior — the orphan-delete clause guarantees no stale community pages survive. **Pre-cutover (step 11)**: grep `apps/web/components/deepdive/wiki/` for any code that caches community IDs across requests. If found, file a separate issue — do not bundle the fix in. |
| **BYOK key in transit** from Node→Python over HTTP | Same threat model as the existing `/v1/workflows/*` surface — gated by `INTERNAL_CALLBACK_TOKEN` and intended to be reachable only from `apps/web` and browsers via `NEXT_PUBLIC_WORKFLOWS_API_URL`. Production deployments are responsible for not exposing port 2027 publicly (the existing `/v1/workflows/daily_digest/*` surface already has this exposure today, so wiki-ingest does not expand attack surface). Python side **never logs the request body at INFO**; only structured stages are logged. `tests/test_wiki_ingest.py` asserts apiKey doesn't appear in `caplog` on error. |
| **`removeSourceFromWiki` path** (surgical-remove vs. re-ingest) | Folded into the same Python entrypoint via `mode: "remove"` (§7.4). Pydantic discriminated-union enforces the schema split; `_filter_source` mirrors the TS `removeSourceFromGraph` rule (drop nodes whose only sourceRef is this source; drop edges touching removed nodes; preserve nodes co-referenced by other sources by removing only this sourceId from their `sourceRefs`). Rejected fallback: dropping surgical-remove and forcing full re-ingest — worse UX. |
| **Cutover regression** (Python output diverges from TS output for an edge-case source) | The step-9 diff harness is the gate (3-source comparison; node count ±5%, edge count ±10%, communities exact-match-or-±1, no missing source-IDs in WikiPage.sourceRefs, semantic crossRefs match). If a regression appears post-cutover, `git revert` of step 11 is the rollback. No multi-week soak; the hazard of maintaining two implementations exceeds the hazard of relying on diff-test + revert for a 1-team internal-network deployment. |
| **`@task` checkpointer + cross-runtime safety** | Pinned to `langgraph>=0.6,<0.7`. Functional API entrypoints don't declare a checkpointer (default in-memory is acceptable; per-request fresh runs). `@entrypoint` doesn't bind to an event loop at decoration; safe to call from FastAPI BackgroundTasks (matcher uses `asyncio.to_thread(graph.invoke, ...)` since LOTUS blocks) and from ARQ workers (digest uses `await generate_section.ainvoke(req)`). See §6.1 for the full runtime contract. |

## 12. Out-of-scope follow-ups (deliberate)

These come up naturally in the refactor and are deferred:

- **Re-introducing memory** with a real producer (web app writing user preferences). Out of scope; tables retained.
- **Routing pattern (ref doc §Routing)** — currently no surface needs to dispatch between sub-graphs. If `deep_research` later wants to choose between web-search and RAG paths via a structured-output classifier, that's a follow-up.
- **Evaluator-optimizer (ref doc §Evaluator-optimizer)** — currently no surface or workflow has a self-feedback loop.
- **Streaming progress for matcher via the Functional API's native stream** — the SSE endpoint stays read-from-JobStore; converting it to consume `entrypoint.stream(...)` is a follow-up.
- **Streaming wiki extraction** — wiki ingest stays request/response; LLM calls happen in sequence inside Python. Streaming chunked extraction back to the worker is a future enhancement.
- **Switching wiki ingest off BullMQ to ARQ** — the queue boundary stays where it is; the migration is about *what runs inside the worker*, not where the queue lives.
- **LangSmith tracing for wiki ingest** — once the work runs in Python, LangSmith tracing comes along with langchain-openai for free; adopt in a follow-up.
- **Refactoring `apps/web/lib/services/wiki-ingest.ts` further** (e.g., moving the transactional commit into a Prisma extension) — keep the slim version minimal in step 11.
- **Re-evaluating ContextRef-as-protocol if real wiki/source injection lands inside the agent surface** — for now the placeholders are deleted; if/when the *notebook agent's* system prompt needs to inject wiki text from `NotebookGraph` (separate concern from the wiki *ingest* workflow above), a small `_render_wiki_context(notebook_id) -> str` helper is the minimum addition, not a Protocol hierarchy.
