# `apps/langgraph` — LangGraph runtime + workflows API + ARQ digest worker

This directory hosts:
- 3 LangGraph agent surfaces wired via `langgraph.json`
- A FastAPI workflows server on `:2027` (matcher / daily_digest / search / wiki extract / llm models)
- An ARQ worker for daily-digest jobs

All three live in the same Python package (`sparkflow-langgraph` in `pyproject.toml`) — one venv, one image base.

## Layout

```
agents/{notebook,hub,deep_research}.py   # StateGraph(MessagesState) per surface
prompts/                                 # System-prompt fragments
  base_identity.md, tool_use_enforcement.md
  model_hints/{openai,gemini}.md
  surfaces/{notebook,hub,deep_research}.md
prompt_builder.py                        # 64-LOC concatenator
tools/                                   # @tool functions
  web.py / wiki.py / hub_toolbox.py / hub_ui.py / hub_nav.py / hub_wechat.py
workflows/                               # Functional API + Graph API
  search.py            # plain async (no parallelism payoff)
  daily_digest.py      # @entrypoint + per-query parallel prefilter
  matcher/job.py       # Graph API + Send orchestrator-worker
  wiki_ingest.py       # @entrypoint chain (port of graph-service.ts)
  digest_worker.py     # ARQ WorkerSettings + adapter
server/                                  # FastAPI on :2027
  app.py
  routes/{matcher_jobs,wiki_ingest,llm_models}.py
embeddings/bge_m3.py                     # Optional offline backfill
scripts/backfill_*.py                    # One-shot embedding backfills
tests/                                   # 61 pytest, no docker dep
langgraph.json                           # 3 graphs registered for langgraph CLI
```

## Surfaces

| Graph | Module | Purpose |
|---|---|---|
| `notebook` | `agents/notebook.py:agent` | DeepDive RAG over notebook sources |
| `hub` | `agents/hub.py:agent` | Conference / publication / session discovery + generative UI |
| `deep_research` | `agents/deep_research.py:agent` | Open-web research via SearXNG / Tavily |

Each is built from `StateGraph(MessagesState)` with `llm_call ↔ tool_node` per the LangGraph reference doc's "Agents → Graph API" pattern. Tools are imported per-surface (no central registry). The `hub` surface skips `HUB_FRONTEND_TOOL_NAMES` in `tool_node` and routes `should_continue → END` when *all* tool_calls are frontend (otherwise the loop would repeat them — see `docs/superpowers/specs/2026-04-27-agent-refactor-design.md` §5.3).

## Workflows server (`:2027`)

FastAPI mounted by `server/app.py`:

| Route | Purpose | Auth |
|---|---|---|
| `GET /v1/healthz` | Liveness check | Public |
| `POST /v1/workflows/search` | Web / wechat / publication search | Public |
| `POST /v1/workflows/daily_digest/sections/{id}/generate` | Enqueue ARQ digest job | `INTERNAL_CALLBACK_TOKEN` |
| `GET /v1/workflows/daily_digest/jobs/{id}/status` | Poll ARQ job result | `INTERNAL_CALLBACK_TOKEN` |
| `POST /v1/workflows/matcher/jobs[/...]` | Excel BU ranking job control + SSE stream | Public (token in body) |
| `POST /v1/workflows/wiki/extract` | Knowledge-graph extract + cluster + page generation | `INTERNAL_CALLBACK_TOKEN` |
| `POST /v1/workflows/llm/list-models` | BYOK key validation (proxies provider `/v1/models`) | `INTERNAL_CALLBACK_TOKEN` |

`apps/langgraph/.env` is auto-loaded at startup (via `python-dotenv` in `server/app.py`) — uvicorn doesn't auto-load `.env` like `langgraph dev` does.

## Run locally

First-time setup:

```bash
python -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.example .env   # set INTERNAL_CALLBACK_TOKEN to match apps/web/.env
```

Then **two host processes**, each in its own terminal:

| Process | Port | Command |
|---|---|---|
| LangGraph dev server (the 3 agents) | 2024 | `make dev` |
| Workflows API (FastAPI) | 2027 | `make serve` |

The ARQ digest worker normally runs in docker (`docker compose up -d` in repo root). To iterate on digest code locally:

```bash
arq workflows.digest_worker.WorkerSettings
```

## Daily digest (ARQ worker)

User-triggered digest generation is durable: `POST /v1/workflows/daily_digest/sections/{id}/generate` enqueues an ARQ job and returns `{accepted, job_id, reused}` immediately. Poll `GET .../jobs/{job_id}/status` for `{status, result?, error?}`. The worker process is `docker compose`'s `digest-worker` service; locally you can run it directly.

- `workflows/digest_tasks.py` — ARQ task adapter (deserializes payload → `GenerateSectionRequest` → `await generate_section.ainvoke(req)`).
- `workflows/digest_worker.py` — `WorkerSettings` (`max_jobs=4`, `max_tries=3`, `keep_result=24h`).
- FastAPI `lifespan` opens / closes the ARQ Redis pool for the `/v1/workflows/daily_digest/*` handlers.

## Model configuration

Per-user BYOK is mandatory. Each request carries `model_provider`, `model_name`, and `api_key` in its runtime context (`Ctx` dataclass in each agent module); no env-var fallback for user-facing calls. The frontend's `/api/settings/resolve-key` route resolves the user's encrypted key from `UserSettings.apiKeys` before each LangGraph invocation.

Supported provider families (per `prompt_builder.py`): `openai`, `gpt`, `codex`, `deepseek`, `glm`, `zhipu`, `minimax`, `kimi`, `moonshot`, `custom` (use the OpenAI hint), `google`, `gemini` (use the Gemini hint).

## Functional API runtime contract

Pinned to `langgraph>=0.6,<2.0` (currently 1.1.x in venv). Inside `async def @entrypoint`s, `@task`s are awaited normally — `await task_func(...)`; for parallelism, use `asyncio.gather(*[task_func(x) for x in xs])`. The reference-doc's sync `.result()` pattern only works for sync `@entrypoint def`. The matcher uses **Graph API + `Send`** instead of Functional API to unlock per-worker streaming + dynamic dispatch (`workflows/matcher/job.py`).

## Tests

```bash
cd apps/langgraph
.venv/bin/python -m pytest -v       # 61 tests, no docker dep
```

## Environment variables

See `apps/langgraph/.env.example` and `.env.production.example` for the full list. Key ones:

| Variable | Required | Note |
|---|---|---|
| `INTERNAL_CALLBACK_TOKEN` | Yes | Must match `apps/web/.env` |
| `SPARKFLOW_API_URL` | Yes | Node callback (digest completion, source content fetch) |
| `SEMOPS_API_URL` | — | Default `http://semops:2025` (compose) |
| `SEARXNG_URL` | — | Default `http://searxng:8080` (compose) |
| `REDIS_URL` | — | Default `redis://redis:6379` (compose) |
| `DATABASE_URL` | Yes for backfill scripts | Otherwise unused by the runtime |
| `DIGEST_WORKER_CONCURRENCY` | — | Default 4 |
| `LANGSMITH_*` | — | Optional tracing |

BYOK is mandatory on all user-facing paths; no `OPENAI_API_KEY` env fallback.

## Optional: BGE-M3 embeddings for offline backfill

`scripts/backfill_*.py` need BGE-M3 (pulls torch + transformers, ~800MB). Not installed by default to keep the agent image lean:

```bash
pip install -e '.[embeddings]'
```

## Refactor history

This package was refactored 2026-04-27 (commits `0c1e1a6..1df45a7`, see `docs/superpowers/specs/2026-04-27-agent-refactor-design.md`):

- Renamed `apps/agent` → `apps/langgraph`; package name `sparkflow-langgraph`.
- Stripped the previous `hermes/` harness (registry, 9-layer PromptBuilder, ContextRefs, skills, memory). Replaced with explicit imports + flat `prompt_builder.py`.
- Adopted LangGraph reference patterns: tool-calling agents from `StateGraph` primitives (one file per surface), `@entrypoint`/`@task` for daily_digest, Graph API + `Send` for matcher, plain `async def` for search.
- Ported wiki ingest from Node (`apps/web/lib/services/graph-service.ts`, ~720 LOC) to `workflows/wiki_ingest.py`. Deleted the Node→Python LLM gateway (`server/routes/llm_gateway.py`) along with the `litellm` and `openai` Node SDK deps.
- See `docs/superpowers/plans/2026-04-27-agent-refactor.md` for the implementation plan.
