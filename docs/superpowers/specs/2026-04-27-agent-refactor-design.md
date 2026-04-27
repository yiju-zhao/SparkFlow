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
| `apps/agent/server/routes/llm_gateway.py` (~299 LOC) | Two consumers: `apps/web/lib/services/graph-service.ts` (wiki ingest LLM calls) and `apps/web/lib/providers/list-models.ts` (BYOK validation in Settings UI). Both are rewritten as part of this work. | Drop after wiki-ingest cutover (step 11) |
| `litellm>=1.50` dep in `pyproject.toml` | `grep litellm apps/agent` → only `server/routes/llm_gateway.py` imports it. Every provider in PROVIDER_MAP is OpenAI-compatible (`f"openai/{model}"` at line 257) so litellm is dispatching through its openai adapter for every call — no value over `langchain-openai` which apps/agent already uses elsewhere. | Drop with the gateway |
| `apps/web/lib/services/graph-service.ts` (~720 LOC TS) | Knowledge-graph extraction + Louvain clustering + wiki-page assembly currently in Node. Verified ~70% is "LLM calls + pure graph algorithms + types" with zero Node/Prisma affinity. | Replace with `workflows/wiki_ingest.py`; delete TS file at cutover |
| `apps/web/lib/providers/list-models.ts` (~225 LOC TS) | Wraps the `/v1/llm/models` gateway endpoint to power Settings → "Validate BYOK key" UX. | Replace with a slim ~40-LOC client calling a new `POST /v1/workflows/llm/list-models` (or fold validation into a tiny route inside `wiki_ingest.py`'s router) |
| `openai` Node SDK in `apps/web/package.json` | Only consumer is graph-service.ts. | Drop after graph-service.ts is deleted |

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
│   ├── wiki_ingest_types.py    (new — Pydantic request/response models for the wiki extract route)
│   └── routes/
│       ├── matcher_jobs.py
│       └── wiki_ingest.py      (new — POST /v1/workflows/wiki/extract; replaces deleted llm_gateway.py)
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
        extraction = await extract_graph(
            req.source_content, req.source_title, req.source_id,
            req.existing_node_labels, _lm(req)
        ).result()
        merged = _merge_graph(req.existing_graph, extraction)
    else:  # remove
        merged = _filter_source(req.existing_graph, req.source_id)
        extraction = None

    communities = _cluster_graph(merged)
    community_pages = await build_wiki_pages(
        merged, communities, _source_map_from(req), _lm(req)
    ).result()
    index_page = _build_index_page(merged, communities, community_pages)
    log_entry = _format_log(req.source_id, extraction, len(community_pages))

    return WikiExtractResult(
        normalized_title=req.source_title,
        extraction=extraction,
        merged_graph=merged,
        communities=communities,
        community_pages=community_pages,
        index_page=index_page,
        log_entry=log_entry,
    )
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
  "mergedGraph": {"nodes": [...], "edges": [...]},
  "communities": {"0": ["NodeA", "NodeB"], ...},
  "communityPages": [{"slug":"community-0","title":"...","markdown":"...","sourceIds":[...]}],
  "indexPage": {"slug":"index","title":"Wiki Index","markdown":"..."},
  "logEntry": "..."
}
```

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

  await prisma.$transaction(async (tx) => {
    await tx.notebookGraph.upsert({...});                                  // unchanged
    for (const page of [result.indexPage, ...result.communityPages]) {     // unchanged
      await tx.wikiPage.upsert({...});
    }
    await tx.wikiPage.deleteMany({ where: orphanFilter });                 // unchanged
    await tx.wikiPageLog.create({ data: { content: result.logEntry, ... }});
  });
  await prisma.source.update({ where: { id: sourceId }, data: { status: "READY" }});
}
```

The transactional commit is unchanged byte-for-byte; only the *production* of `result` moves. `removeSourceFromWiki` calls the same endpoint with `mode: "remove"` (the second branch in the entrypoint above), keeping surgical-remove behavior.

**Cutover safety**: a `WIKI_INGEST_BACKEND={node|python}` env var defaults to `node` (current Phase-1 path) for one release cycle, then defaults to `python`, then the flag and the Node code are deleted. Implementation detail in §9 (steps 9–11).

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

12 steps. Each lands as an independent commit; the system stays runnable after every step. Steps 1–8 are agent-internal. Steps 9–12 are the wiki-ingest port and gateway demolition (cross-app — `apps/web` + `apps/agent`).

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
| 9 | **Wiki-ingest spike (Python only).** Add `workflows/wiki_ingest.py` with `extract_graph` + `_merge_graph` + `_cluster_graph` + `build_wiki_pages` + `_build_index_page` + `extract_wiki` `@entrypoint`. Use the existing langchain-openai client pattern from `daily_digest.py`. Add `networkx>=3.0` to deps. No FastAPI route yet. Validate against a real source from a dev notebook: assert output shape and node/edge counts comparable to current TS output. | new workflows/wiki_ingest.py + tests | `pytest tests/test_wiki_ingest.py`; manual diff against TS output for one source |
| 10 | **Wiki-ingest route.** Add `server/routes/wiki_ingest.py` with `POST /v1/workflows/wiki/extract` + `INTERNAL_CALLBACK_TOKEN` auth + structured error envelope + Pydantic models in `server/wiki_ingest_types.py`. Wire into `server/app.py`. | new route + types | `pytest tests/test_wiki_ingest_router.py`; `curl` smoke from inside docker network |
| 11 | **Cutover behind feature flag.** Add `WIKI_INGEST_BACKEND={node|python}` env var to `apps/web/workers/ingest.ts`. When `python`, the worker calls `POST /v1/workflows/wiki/extract` and runs the existing `prisma.$transaction` on the result. When `node` (default), keep the old `graph-service.ts` path. Slim `apps/web/lib/services/wiki-ingest.ts` to ~60 LOC: status writes + Python call + transaction helper. Soak for ≥ 1 release with `python` available behind the flag. | apps/web/workers/ingest.ts + apps/web/lib/services/wiki-ingest.ts | E2E: upload a PDF, watch it complete; toggle the flag and re-run; diff `WikiPage` rows |
| 12 | **Demolition.** Flip flag default to `python`; verify ≥ 1 week of zero rollbacks. Then in a single commit: `git rm apps/web/lib/services/graph-service.ts`; `git rm apps/agent/server/routes/llm_gateway.py`; remove `app.include_router(llm_gateway_router)` from `server/app.py`; drop `litellm` from `pyproject.toml`; drop `openai` from `apps/web/package.json`; slim `apps/web/lib/providers/list-models.ts` to ~40 LOC (or delete and replace its callsite); remove the `WIKI_INGEST_BACKEND` flag. Update `apps/web/CLAUDE.md` and `apps/agent/CLAUDE.md` to describe wiki ingest under `apps/agent/workflows/`. | bulk deletes across apps/web + apps/agent | grep verifies zero references; full E2E green |

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
- `tests/test_wiki_ingest.py` — round-trip: feed a fixed sourceContent into `extract_wiki.ainvoke(req)` with `litellm.acompletion` (or whichever client we use) mocked to return canned graph extractions; assert the returned shape matches the data contract (§7.4), `community-*` slugs render correctly, the index page enumerates communities, and the `mode: "remove"` branch correctly drops a source's nodes from the graph and re-clusters. One test that triggers an upstream error and asserts the apiKey does NOT appear in `caplog`.
- `tests/test_wiki_ingest_router.py` — exercise `POST /v1/workflows/wiki/extract` with a TestClient: 401 without `X-Internal-Token`, 200 with a mocked `extract_wiki.ainvoke`, structured error envelope on internal exception.

Existing tests preserved as-is: `tests/test_smoke.py` (rewrites the single hermes import), `tests/test_server_app.py` (drops llm_gateway route assertions in step 12), `tests/test_tools_web.py`.

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
| **Louvain community-id stability** between TS (`graphology-communities-louvain`) and Python (`networkx.community.louvain_communities`) | IDs differ across implementations due to random tie-breaks, but `community-{id}` slugs are regenerated every ingest and the orphan-page deletion handles re-numbering atomically — so this isn't a bug as long as no UI code caches community IDs across requests. Pre-cutover (step 11), grep `apps/web/components/deepdive/wiki/` for any code that caches community IDs. If found, file a separate issue — don't bundle the fix in. |
| **BYOK key in transit** from Node→Python over HTTP | Stays inside docker compose network (workflows-api:2027), never on public internet. `INTERNAL_CALLBACK_TOKEN` already gates the entire `/v1/workflows/*` surface. Python side **never logs the request body at INFO**; only structured stages (e.g. `"extracted N nodes from sourceId=..."`) are logged. A pytest in `test_wiki_ingest.py` asserts the apiKey doesn't appear in `caplog` on error. Same threat model as the Phase-1 gateway (no new exposure). |
| **`removeSourceFromWiki` path** (surgical-remove vs. re-ingest) | Folded into the same Python entrypoint via `mode: "remove"` (§7.4). Adds ~80 LOC to wiki_ingest.py; deletes the corresponding TS path. Rejected fallback: dropping surgical-remove and forcing full re-ingest on next user action — worse UX, not recommended. |
| **Cutover regression** (Python output diverges from TS output for an edge-case source) | Step 11's feature flag is the safety net: flip back to `node` per-instance via env var. Soak ≥ 1 release with `python` opt-in, then ≥ 1 week with `python` default before deletion in step 12. |
| **Dual implementation drift during soak** (Phase-1 gateway and Phase-2 direct path running simultaneously) | The soak window is bounded; step 12 removes the gateway and the flag together. Don't add new features to graph-service.ts or llm_gateway.py during the soak — see Phase-1 spec §Appendix B. |

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
