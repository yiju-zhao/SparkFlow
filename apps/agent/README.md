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

### Production hosts: mounting a corporate CA bundle

`langgraph up` does NOT accept `-v` for volume mounts (the CLI only has
`--verbose`). To mount a CA bundle so the agent trusts a private cert
authority, use the official `-d <docker-compose.override.yml>` path:

```bash
# On the production host, inside apps/agent/:
cp docker-compose.override.yml.example docker-compose.override.yml
cp /path/to/your-ca.crt ./ca-certificates.crt
make up    # the Makefile auto-attaches the override
```

`docker-compose.override.yml` and `ca-certificates.crt` are gitignored;
the `.example` template stays in the repo so each host can opt in.

### Optional: BGE-M3 embeddings for offline backfill

`scripts/backfill_*.py` need BGE-M3 (pulls torch + transformers, ~800MB).
Not installed by default to keep the agent image lean. Install only on
machines that run those scripts:
```bash
pip install -r requirements-embeddings.txt
# or, if working from pyproject:
pip install -e ".[embeddings]"
```

## Key Environment Variables
- `OPENAI_API_KEY`
- `TOOLBOX_SERVER_URL`
- `MCP_SERVER_URL`
- `HUB_MODEL_PROVIDER`
- `HUB_MODEL_NAME`

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
