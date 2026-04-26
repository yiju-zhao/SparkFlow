# Agent Service (LangGraph)

This directory hosts the LangGraph agent runtime and its supporting modules.

## Layout
- `graphs/`: LangGraph entrypoints (wired in `langgraph.json`)
- `prompts/`: System prompts used by graphs
- `tools/`: Tool implementations and MCP/Toolbox adapters
- `config/`: Shared configuration models/constants

## Graphs
- `agent`: DeepDive / RAG agent
- `hub`: Research Hub orchestration agent

The `hub` graph uses GenAI Toolbox for deterministic database querying and relies on CopilotKit-provided MCP Apps actions for workflow/presentation rendering.

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
`apps/agent/.env`. `make dev` does not need a LangSmith key.

The default port for `langgraph up` is `8123`; we override to `2024` in
the Makefile so it matches `langgraph dev` and `apps/web/.env`'s
`LANGGRAPH_API_URL=http://localhost:2024`. Set `PORT=...` to override:
```bash
make up PORT=8123
```

### Optional: pin the LangGraph API server version

Production deployments should pin `api_version` in `langgraph.json` to
avoid surprise breakage when LangChain ships a new server major. Verify
the running version with `docker logs langgraph-api-1 | head` (look for
`langgraph_api_version=…`), then add to `langgraph.json`:
```json
"api_version": "0.8"
```
Bump explicitly when ready to upgrade.

### External Postgres (skip the CLI's sibling postgres container)

On hosts where Docker's embedded DNS misbehaves and `langgraph-api`
can't resolve `langgraph-postgres`, point `langgraph up` at an existing
Postgres instead of letting the CLI run one for you:

```bash
# One-time: create a dedicated DB on the host postgres (port 5433)
PGPASSWORD=$POSTGRES_PASSWORD psql -h localhost -p 5433 -U postgres \
  -c "CREATE DATABASE langgraph;"

# Run langgraph against it
make up LANGGRAPH_POSTGRES_URI="postgresql://postgres:$POSTGRES_PASSWORD@host.docker.internal:5433/langgraph"
```

The `docker-compose.override.yml` adds `host.docker.internal:host-gateway`
so that hostname resolves on Linux (Docker Desktop on Mac/Win does it
automatically). No more sibling-DNS dependency on this path.

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
- `MCP_SERVER_URL`
- `HUB_MODEL_PROVIDER`
- `HUB_MODEL_NAME`
- `REDIS_URL` — shared with the web app (BullMQ + ARQ)
- `DIGEST_WORKER_CONCURRENCY` — ARQ digest worker concurrency (default 4)
- `INTERNAL_CALLBACK_TOKEN` — shared secret for Python → Node digest callbacks

BYOK is mandatory on all user-facing paths; there is no `OPENAI_API_KEY` env fallback for user requests.

## Daily Digest (ARQ worker)

User-triggered digest generation is durable: `POST /v1/workflows/daily_digest/sections/{id}/generate` enqueues an ARQ job and returns `{accepted, job_id, reused}` immediately. Poll `GET /v1/workflows/daily_digest/jobs/{job_id}/status` for `{status, result?, error?}`. The worker runs in its own process and must be started separately:

```bash
# From apps/agent
arq workflows.digest_worker.WorkerSettings
```

- `workflows/digest_tasks.py` — ARQ task adapter that deserializes the payload into `GenerateSectionRequest` and calls the existing `workflows.daily_digest.generate_section`.
- `workflows/digest_worker.py` — `WorkerSettings` (`max_jobs`, `max_tries=3`, `keep_result=24h`).
- FastAPI `lifespan` opens / closes the ARQ pool on the `/v1/workflows/daily_digest/*` handler side.

## Model Configuration
- DeepDive defaults: `config/rag_agent.py`
- Hub defaults: `config/hub_agent.py`

## Hermes Harness (P1)

`apps/agent/hermes/` is the shared primitives layer used by all agent surfaces
and workflows (see `docs/superpowers/specs/2026-04-22-hermes-harness-design.md`
for the architecture and `docs/superpowers/plans/2026-04-22-hermes-harness-p1.md`
for this phase's plan).

- `registry.py` — central tool registry + AST-based auto-discovery.
- `prompt_builder.py` — 9-layer system prompt assembly with per-session cache.
- `context/references.py` — context-ref injectors (wiki / sources / page / web).

### Running tests

```bash
cd apps/agent
uv pip install --python .venv/bin/python -e '.[dev]'   # first time only
.venv/bin/python -m pytest -v
```

### Current status

- P1 (2026-04-22): primitives skeleton — lands here. No surfaces refactored yet; the three legacy LangGraph graphs (`rag_agent`, `hub_agent`, `search_agent`) remain in production.
- P2: notebook + hub surfaces on shared harness.
- P3: memory + skills.
- P4: search workflow + deep-research surface.
- P5: matcher workflow out of apps/semops.
- P6: digest orchestrator from Node to Python.
