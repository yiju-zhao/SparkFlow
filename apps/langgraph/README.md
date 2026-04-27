# Agent Service (LangGraph)

This directory hosts the LangGraph agent runtime and its supporting modules.

## Layout
- `agents/`: One file per surface (`notebook.py`, `hub.py`, `deep_research.py`).
  Each is a `StateGraph(MessagesState)` built from `llm_call ↔ tool_node`
  primitives per LangGraph's "Agents → Graph API" pattern.
- `prompts/`: Markdown fragments concatenated by `prompt_builder.py`
  (base_identity, tool_use_enforcement, model_hints/{openai,gemini},
  surfaces/{notebook,hub,deep_research}).
- `tools/`: `@tool` functions; agents import them directly (no registry).
- `workflows/`: Functional API and Graph API workflows.
  - `search.py` — plain `async def` (single chain, no parallelism payoff)
  - `daily_digest.py` — Functional API, per-query parallelization via `asyncio.gather`
  - `matcher/job.py` — Graph API + `Send` orchestrator-worker
  - `wiki_ingest.py` — Functional API chain (added in Phase 8 of the refactor)
- `server/`: FastAPI shell at `:2027` for workflow HTTP endpoints
  (`/v1/workflows/{search,daily_digest,matcher,wiki/extract}`,
  `/v1/workflows/llm/list-models`).
- `prompt_builder.py`: 64-LOC flat function `build_system_prompt(...)` —
  replaces the old 9-layer `hermes/prompt_builder.PromptBuilder` class.

## Surfaces (LangGraph graphs registered in `langgraph.json`)
- `notebook`: DeepDive RAG over notebook sources (uses `tools/wiki.py`).
- `hub`: Research Hub assistant with generative UI (Conferences, Sessions,
  Publications, WeChat) — frontend tools are skipped server-side and rendered
  by CopilotKit on the client.
- `deep_research`: Open-web research via SearXNG / Tavily + URL fetch.

The `hub` surface uses GenAI Toolbox for deterministic database querying and
declares frontend tools (`show_table`, `show_chart`, etc.) which the LangGraph
SDK passes through to CopilotKit for rendering.

## Run Locally

First-time setup on a dev machine — install the LangGraph CLI plus
everything else `make dev`/`make up` needs:
```bash
pip install -e ".[dev]"
# Provides the `langgraph` command (cli + inmem server) and dev test deps.
# The CLI is NOT a runtime dep, so `langgraph build` will not bake it
# into the agent image.
```

In-process dev server (fastest, no Docker, hot reload):
```bash
make dev
# equivalent to: langgraph dev --host 0.0.0.0 --port 2024
```

The agent has **two independent server processes** that must both run for
the full feature set:

| Process | Port | What it serves | How to start |
|---------|------|----------------|--------------|
| LangGraph API | 2024 | Notebook / hub / deep-research surface graphs (`langgraph.json`) | `make dev` |
| Workflows API | 2027 | `/v1/workflows/matcher/jobs/*`, `/v1/workflows/daily_digest/*`, `/v1/workflows/search` (FastAPI in `server/app.py`) | `make serve` |
| Digest worker | — | ARQ consumer for daily-digest sections | `arq workflows.digest_worker.WorkerSettings` |

**Run all three in separate terminals during dev** (each is needed by
different `apps/web` routes — chat hits 2024, matcher/digest hits 2027,
digest jobs drain via the ARQ worker). If `make serve` isn't running,
`POST /api/digest/generate` and `POST /api/matcher/jobs` from the web
app will time out / 502.

Full Docker stack (postgres + redis + agent), per the
[langgraph CLI docs](https://docs.langchain.com/langsmith/cli):
```bash
make up          # daily — `langgraph up`, Docker layer cache keeps it fast
make up-fresh    # after editing pyproject.toml (--no-cache rebuild)
make stop        # stop the langgraph-* compose stack
make logs        # tail langgraph-api logs
```

`langgraph up` requires `LANGSMITH_API_KEY` for local testing (and a
`LANGGRAPH_CLOUD_LICENSE_KEY` in production). Make sure both live in
`apps/langgraph/.env`. `make dev` does not need a LangSmith key.

Ports follow the upstream LangGraph CLI convention so the two stacks can
run side-by-side without colliding:

- `make dev` → `:2024` (matches `apps/web/.env`'s `LANGGRAPH_API_URL` default,
  so daily dev "just works")
- `make up` / `up-recreate` / `up-fresh` → `:8123` (matches `langgraph up`'s
  upstream default; point `LANGGRAPH_API_URL` at it when validating with the
  Docker stack)

Override either port at the make invocation:
```bash
make dev DEV_PORT=2030
make up  UP_PORT=2024     # if you want it on 2024 instead
```

### Postgres port conflict with `apps/web`

`langgraph up` spins up its own `langgraph-postgres` sibling that wants
host port `5433`. `apps/web/docker-compose.yml` already maps host `5433`
to its own postgres, so running both at the same time fails with:

```
Bind for 0.0.0.0:5433 failed: port is already allocated
```

The fix is to point langgraph at the web's postgres instead of letting
the CLI start its own. Set `CHECKPOINT_DB_URL` in `apps/langgraph/.env`
(the Makefile passes it to `langgraph up` as `--postgres-uri`):

```bash
# One-time: create a dedicated DB so checkpoint churn doesn't fight Prisma
docker exec -it sparkflow-postgres psql -U sparkflow -c \
  "CREATE DATABASE sparkflow_checkpoints;"

# In apps/langgraph/.env:
CHECKPOINT_DB_URL=postgresql://sparkflow:sparkflow@host.docker.internal:5433/sparkflow_checkpoints
```

Requires `docker-compose.override.yml` to be active so
`host.docker.internal` resolves from inside the container (the override
adds it via `extra_hosts: host-gateway`).

### Optional: pin the LangGraph API server version

Production deployments should pin `api_version` in `langgraph.json` to
avoid surprise breakage when LangChain ships a new server major. Verify
the running version with `docker logs langgraph-api-1 | head` (look for
`langgraph_api_version=…`), then add to `langgraph.json`:
```json
"api_version": "0.8"
```
Bump explicitly when ready to upgrade.

### Corporate CA bundle (runtime mount, NOT baked)

The `langgraph-api` image is built by `langgraph build` from the upstream
`langchain/langgraph-api:wolfi` base — we don't modify it. Instead, the
CA cert is mounted at runtime via `docker-compose.override.yml`:

```bash
# On a host that needs a corp CA:
cp docker-compose.override.yml.example docker-compose.override.yml
cp /path/to/your-ca.crt ./ca-certificates.crt
make up    # the Makefile auto-attaches the override
```

The override mounts the cert at `/etc/ssl/certs/ca-certificates.crt`
and sets `SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE` / `CURL_CA_BUNDLE` —
covers Python `ssl`, `requests`, and libcurl. Both files are gitignored;
the `.example` template stays in the repo so each host can opt in.

> Why mount instead of baking (unlike apps/web)? `langgraph build` pulls
> the upstream wolfi base on every rebuild. Baking host-specific layers
> on top makes us hostage to upstream's network/DNS defaults — a base
> bump once broke DNS resolution for `langgraph-postgres` from inside
> `langgraph-api`. Mounting decouples the cert from image refreshes.

### Optional: BGE-M3 embeddings for offline backfill

`scripts/backfill_*.py` need BGE-M3 (pulls torch + transformers, ~800MB).
Not installed by default to keep the agent image lean. Install only on
machines that run those scripts:
```bash
pip install -e ".[embeddings]"
```

## Key Environment Variables
- `TOOLBOX_SERVER_URL`
- `HUB_MODEL_PROVIDER`
- `HUB_MODEL_NAME`
- `REDIS_URL` — shared with the web app (BullMQ + ARQ)
- `DIGEST_WORKER_CONCURRENCY` — ARQ digest worker concurrency (default 4)
- `INTERNAL_CALLBACK_TOKEN` — shared secret for Python → Node digest callbacks

BYOK is mandatory on all user-facing paths; there is no `OPENAI_API_KEY` env fallback for user requests.

## Daily Digest (ARQ worker)

User-triggered digest generation is durable: `POST /v1/workflows/daily_digest/sections/{id}/generate` enqueues an ARQ job and returns `{accepted, job_id, reused}` immediately. Poll `GET /v1/workflows/daily_digest/jobs/{job_id}/status` for `{status, result?, error?}`. The worker runs in its own process and must be started separately:

```bash
# From apps/langgraph
arq workflows.digest_worker.WorkerSettings
```

- `workflows/digest_tasks.py` — ARQ task adapter that deserializes the payload into `GenerateSectionRequest` and calls the existing `workflows.daily_digest.generate_section`.
- `workflows/digest_worker.py` — `WorkerSettings` (`max_jobs`, `max_tries=3`, `keep_result=24h`).
- FastAPI `lifespan` opens / closes the ARQ pool on the `/v1/workflows/daily_digest/*` handler side.

## Model Configuration

Per-user BYOK is mandatory. Each request carries `model_provider`, `model_name`,
and `api_key` in its runtime context (`Ctx` dataclass in each agent module);
no env-var fallback. The frontend's `/api/settings/resolve-key` route resolves
the user's encrypted key from `UserSettings.apiKeys` before each LangGraph call.

## Running tests

```bash
cd apps/langgraph
uv pip install --python .venv/bin/python -e '.[dev]'   # first time only
.venv/bin/python -m pytest -v
```

## Refactor history

This codebase was refactored in 2026-04-27 (`docs/superpowers/specs/2026-04-27-agent-refactor-design.md`)
to strip the previous `hermes/` harness and adopt LangGraph reference patterns:
- Tool-calling agents from `StateGraph(MessagesState)` primitives (one file per surface)
- Functional API (`@entrypoint`/`@task`) for `daily_digest` (parallelization)
  and `wiki_ingest` (chain)
- Graph API with `Send` for `matcher/job.py` (orchestrator-worker)
- `search.py` stays plain `async def` — single chain, no parallelism payoff
The 9-layer `PromptBuilder` collapsed to a 64-LOC `build_system_prompt(...)`;
AST-based tool discovery replaced with explicit imports per surface.
