# `apps/agent` Refactor — First-Principles Simplification

> **Date**: 2026-04-27
> **Branch**: `agent-dev`
> **Reference**: `docs/reference/langgraph-agent-and-workflow.md`
> **Supersedes** (operationally, not formally): the post-P1/P2 state of `docs/superpowers/specs/2026-04-22-hermes-harness-design.md`. Hermes was a real consolidation; the parts that scaled are preserved as flat helpers, the parts that ossified into placeholders are removed.

## 1. Goal

Strip `apps/agent` back to the patterns shown in the reference doc:
- **Tool-calling agent** (`StateGraph(MessagesState)` with `llm_call ↔ tool_node` + `should_continue`) per surface — built from primitives, not a prebuilt or a parameterized factory.
- **Functional API** (`@entrypoint` / `@task`) for the three workflows, using prompt-chaining, parallelization, and orchestrator-worker patterns where each fits naturally.

Drop everything that built abstraction without consumers: AST tool discovery, the 9-layer prompt builder, ContextRef placeholder classes, the unmounted skills subsystem, the unseeded memory subsystem, `extra_caller_system`, per-session prompt caching.

Net effect: `apps/agent` shrinks by an estimated 1,200+ LOC of harness, and the agent code reads paragraph-for-paragraph like the reference doc.

## 2. Non-goals

- **Not** changing the LangGraph runtime, checkpointer, dev/up CLI, or `langgraph.json` shape.
- **Not** changing CopilotKit integration on the frontend.
- **Not** changing the FastAPI workflow server's route surface (`/v1/workflows/*`, `/v1/llm/*`).
- **Not** changing the ARQ digest worker semantics or the BullMQ ingest worker on the web side.
- **Not** changing semops, MinerU, or the LLM gateway protocol.
- **Not** dropping Prisma `UserMemory` / `NotebookMemory` tables (we drop only the Python access layer; the tables remain so memory can be re-added later without a migration).

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
│   └── matcher/
│       ├── job.py          (was job_runner.py)
│       ├── lotus.py
│       ├── excel_processor.py
│       ├── query_optimizer.py
│       └── job_store.py
├── server/
│   ├── app.py
│   ├── matcher_types.py
│   └── routes/{llm_gateway.py,matcher_jobs.py}
├── prompt_builder.py
├── embeddings/
├── scripts/
├── langgraph.json
├── pyproject.toml
└── README.md
```

Deleted: `hermes/`, `graphs/`, `surfaces/`, `config/`, `tools/_echo.py`, `tools/skills.py`, `tools/memory.py`, `apps/agent/skills/`, `prompts/surfaces/echo_test.md`.

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

`agents/hub.py` includes both backend and frontend tools in `TOOLS` (so the LLM sees the schema and can emit calls), and the local `tool_node` skips dispatch when the call name is in `HUB_FRONTEND_TOOL_NAMES`. No `frontend=True` registry flag, no `ToolEntry` indirection.

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

## 7. Workflow contracts (Functional API)

### 7.1 `workflows/search.py` — chain (ref doc §Functional API)

```python
@task async def web_search(req: SearchRequest) -> list[dict]: ...
@task async def prefilter(source_type: str, query: str, limit: int) -> list[dict]: ...
@task async def semops_rank(candidates, query_text, top_k, lm_config) -> dict: ...

@entrypoint()
async def search(req: SearchRequest) -> SearchResponse:
    if req.source_type == "web":
        return SearchResponse(items=await web_search(req).result())
    candidates = await prefilter(req.source_type, req.query, PREFILTER_LIMIT).result()
    if not candidates:
        return SearchResponse(items=[])
    ranked = await semops_rank(candidates, req.query, req.top_k, _lm(req)).result()
    return SearchResponse(items=ranked.get("ranked", []), reasons=ranked.get("reasons") or {})
```

The HTTP route in `server/app.py` becomes `await search.ainvoke(req)`.

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
    futures = [prefilter_query(q["text"], req.subscribed_source_ids) for q in enabled]
    pool = await merge_pool([await f.result() for f in futures]).result()
    if not pool:
        await callback(req.section_id, "EMPTY", items=[]).result()
        return
    semops_candidates = _build_semops_candidates(pool)   # plain helper
    joint_query = " ".join(q["text"] for q in enabled)
    try:
        ranked = await semops_rank(semops_candidates, joint_query, req.top_n, _lm(req)).result()
    except Exception as exc:
        await callback(req.section_id, "FAILED", error=str(exc)).result()
        return
    items = _to_digest_items(pool, ranked)               # plain helper
    await callback(req.section_id, "COMPLETED", items=items, model_used=f"{req.model_provider}/{req.model_name}",
                   completed_at=datetime.now(tz=timezone.utc).isoformat()).result()
```

ARQ adapter (`workflows/digest_tasks.py:arq_generate_section`) calls `await generate_section.ainvoke(req)` instead of `await daily_digest.generate_section(req)`. Worker semantics unchanged.

### 7.3 `workflows/matcher/job.py` — orchestrator-worker (ref doc §Orchestrator-worker, Functional API)

The current `JobRunner.run_job` (337 LOC) collapses to:

```python
@task def optimize_bu(bu, queries, target_type, lm: LMConfig) -> OptimizedQuery: ...
@task def rank_bu(bu, optimized: OptimizedQuery, target_df, top_k, search_k,
                  include_reasons, index_dir, lm: LMConfig) -> pd.DataFrame: ...
@task def synthesize(target_df, results_by_bu, include_reasons) -> bytes: ...
@task def report_progress(job_id, **fields) -> None: ...   # JobStore writeback

@entrypoint()
def run_match_job(job_id: str, req: MatchJobRequest) -> JobResult:
    report_progress(job_id, status="PROCESSING", started_at=now()).result()
    queries_by_bu = _group_by_bu(req.queries)

    optimize_futs = {bu: optimize_bu(bu, qs, req.target_type, req.lm) for bu, qs in queries_by_bu.items()}
    optimized = {bu: f.result() for bu, f in optimize_futs.items()}
    report_progress(job_id, progress=30, query_data=_enriched(req.queries, optimized)).result()

    rank_futs = {bu: rank_bu(bu, opt, req.target_df, req.top_k, req.search_k,
                              req.include_reasons, req.index_dir, req.lm)
                  for bu, opt in optimized.items()}
    results_by_bu = {bu: f.result() for bu, f in rank_futs.items()}
    report_progress(job_id, progress=85, error_message="Creating result file...").result()

    excel_bytes = synthesize(req.target_df, results_by_bu, req.include_reasons).result()
    total_matches = sum(len(df) for df in results_by_bu.values())
    return JobResult(excel_bytes=excel_bytes, total_matches=total_matches)
```

`server/routes/matcher_jobs.py:create_job` previously called `BackgroundTasks.add_task(job_runner.run_job, ...)`. It will now `BackgroundTasks.add_task(_run_and_persist, job_id, req)` where `_run_and_persist` does:

```python
async def _run_and_persist(job_id, req):
    try:
        result = await run_match_job.ainvoke(job_id, req)
        job_store.update_job(job_id, status="COMPLETED", progress=100,
                              result_data=result.excel_bytes, match_count=result.total_matches,
                              completed_at=datetime.utcnow(), error_message=None)
    except Exception as exc:
        logger.exception(f"Job {job_id} failed: {exc}")
        job_store.update_job(job_id, status="FAILED", error_message=str(exc),
                              completed_at=datetime.utcnow())
```

The `/jobs/{id}/stream` SSE endpoint reads `JobStore` exactly as before — the streaming contract is unchanged.

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
- `[tool.hatch.build.targets.wheel].packages = ["agents", "tools", "prompts", "embeddings", "workflows"]` (drop `graphs`, `hermes`, `config`, `surfaces`; add `agents`).

## 9. Migration order

Each step lands as an independent commit; the system stays runnable after every step.

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
- `tests/test_agents.py` — for each surface, import the module-level `agent`, run `agent.invoke({"messages":[HumanMessage("ping")]}, context=Ctx(...))` against a fake LLM (langchain-core's `FakeListChatModel` or our own stub) that emits one tool call then a final answer. Assert the tool was dispatched (or skipped when frontend) and a final `AIMessage` was produced.

Existing tests preserved as-is: `tests/test_smoke.py` (rewrites the single hermes import), `tests/test_server_app.py`, `tests/test_tools_web.py`.

## 11. Risks

| Risk | Mitigation |
|---|---|
| Graph-name drift between `langgraph.json` and `apps/web` SDK calls | Already aligned (`notebook`/`hub`/`deep_research`). Audit `apps/web/lib/langgraph-*.ts` before step 2 to confirm. |
| Functional API cancellation behavior in FastAPI `BackgroundTasks` | Matcher's background-task pattern is unchanged at the FastAPI level; we only swap what the task awaits. ARQ digest worker similarly unchanged at the ARQ level. |
| Sync/async tool dispatch in the new `tool_node` | New `tool_node` keeps the dual-path: `await tool.ainvoke(args)` if the tool defines it, else `tool.invoke(args)`. Same as current `graphs/common.py`. |
| Prisma `UserMemory` / `NotebookMemory` rows orphaned | No migration; the tables remain. Note in README that the Python access layer is removed and can be re-added later. |
| Frontend tool rendering breaks during step 2 | Hub agent's local `tool_node` keeps the `name in HUB_FRONTEND_TOOL_NAMES` skip semantics. Manual hub smoke after step 2. |
| Tests reference `hermes.*` | Tests that test deleted subsystems are deleted, not adapted. The remaining tests (`test_smoke.py`, `test_server_app.py`, `test_tools_web.py`) only need import path fixups, which step 4 handles in the same commit as the bulk deletes. |
| Concurrent reviewers / branches | All changes are inside `apps/agent/`. The web app changes are zero (or one rename) so there's no cross-app coordination beyond the `langgraph.json` audit. |

## 12. Out-of-scope follow-ups (deliberate)

These come up naturally in the refactor and are deferred:

- **Re-introducing memory** with a real producer (web app writing user preferences). Out of scope; tables retained.
- **Routing pattern (ref doc §Routing)** — currently no surface needs to dispatch between sub-graphs. If `deep_research` later wants to choose between web-search and RAG paths via a structured-output classifier, that's a follow-up.
- **Evaluator-optimizer (ref doc §Evaluator-optimizer)** — currently no surface or workflow has a self-feedback loop.
- **Streaming progress for matcher via the Functional API's native stream** — the SSE endpoint stays read-from-JobStore; converting it to consume `entrypoint.stream(...)` is a follow-up.
- **Re-evaluating ContextRef-as-protocol if real wiki/source injection lands** — for now the placeholders are deleted; if/when wiki context becomes real (notebook surface needs it), a small `_render_wiki_context(notebook_id) -> str` helper is the minimum addition, not a Protocol hierarchy.
