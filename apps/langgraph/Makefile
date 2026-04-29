# Targets for working with the LangGraph CLI (verified against langgraph-cli 0.4.x).
# Reference: https://docs.langchain.com/langsmith/cli

IMAGE_TAG ?= sparkflow-agent:dev
# `langgraph dev` defaults to 2024 (lightweight, in-process); `langgraph up`
# defaults to 8123 (production-like Docker stack). Same convention as the
# upstream LangGraph CLI docs — keeps the two stacks runnable side-by-side
# without port collisions.
DEV_PORT ?= 2024
UP_PORT ?= 8123
WORKFLOWS_PORT ?= 2027

export DOCKER_BUILDKIT := 1
export COMPOSE_DOCKER_CLI_BUILD := 1

# Auto-attach docker-compose.override.yml if present on this host
# (mounts CA cert + sets corp-network env vars).
COMPOSE_OVERRIDE := $(wildcard docker-compose.override.yml)
ifneq ($(COMPOSE_OVERRIDE),)
COMPOSE_FLAG := -d $(COMPOSE_OVERRIDE)
else
COMPOSE_FLAG :=
endif

# Auto-load .env so CHECKPOINT_DB_URL, DATABASE_URL, etc. are visible to
# Make. langgraph CLI loads .env into the agent process via `env: .env` in
# langgraph.json, but Make runs *before* the CLI — without this include, Make
# sees CHECKPOINT_DB_URL as empty and `--postgres-uri` is never passed, so
# `langgraph up` falls back to its sibling postgres (which fails to resolve
# on corp-network hosts where embedded Docker DNS is broken). `-include` so a
# missing .env doesn't error; values stay Make-local (no `export`) to keep
# secrets like LANGSMITH_API_KEY out of recipe sub-shells.
-include .env

# Optional: point langgraph at an external Postgres for the checkpointer
# instead of letting `langgraph up` spin up its own `langgraph-postgres`
# sibling. Two scenarios where this is needed:
#   1. Host port 5433 is already taken by `apps/web`'s postgres → langgraph's
#      sibling fails to bind ("port is already allocated"). Reuse web's
#      postgres via host.docker.internal:5433.
#   2. You want checkpoints to persist across `make stop` / image rebuilds
#      (langgraph's sibling lives in a CLI-managed volume that's easy to
#      blow away accidentally).
# When set, this is passed as `--postgres-uri` to `langgraph up`.
#
# CHECKPOINT_DB_URL in .env uses `@localhost:5433` so `make dev` (host-side
# `langgraph dev`) can reach apps/web's postgres directly. `make up` runs
# the same agent inside a container where `localhost` is the container, not
# the host — so we rewrite `@localhost:` → `@host.docker.internal:` only
# when constructing POSTGRES_FLAG. Containers see the right address; .env
# stays single-source-of-truth.
ifneq ($(CHECKPOINT_DB_URL),)
DOCKER_CHECKPOINT_DB_URL := $(subst @localhost:,@host.docker.internal:,$(CHECKPOINT_DB_URL))
POSTGRES_FLAG := --postgres-uri "$(DOCKER_CHECKPOINT_DB_URL)"
else
POSTGRES_FLAG :=
endif

# LangGraph CLI workflow (per docs.langchain.com/langsmith/local-dev-testing):
#   develop daily with `dev` → periodically validate with `up` → pre-deploy
#   check with `up-recreate`. `dev` runs in-process (no Docker), `up` runs the
#   full postgres/redis/agent stack in containers. On corp-network hosts where
#   Docker's embedded DNS struggles with sibling resolution, prefer `dev`.
.PHONY: dev serve up up-recreate up-fresh build stop logs test clean help

help:
	@echo "Targets:"
	@echo "  dev          - In-process LangGraph dev server on :$(DEV_PORT) (no Docker, hot reload, in-memory state)"
	@echo "  serve        - FastAPI workflows server on :$(WORKFLOWS_PORT) (matcher / digest / search)"
	@echo "  up           - Production-like Docker stack on :$(UP_PORT): postgres + redis + agent (auto-uses override if present)"
	@echo "  up-recreate  - up + --recreate: force fresh container recreation (pre-deploy / fix stale containers)"
	@echo "  up-fresh     - --no-cache image rebuild then start (after editing deps)"
	@echo "  build        - Standalone: build $(IMAGE_TAG), don't start"
	@echo "  stop         - Stop the langgraph compose stack"
	@echo "  logs         - Tail logs from the langgraph-api container"
	@echo "  test         - Run pytest"
	@echo "  clean        - Remove the prebuilt image"

dev:
	langgraph dev --host 0.0.0.0 --port $(DEV_PORT)

# FastAPI workflows server. Runs alongside `langgraph dev` (different port).
serve:
	uvicorn server.app:app --host 0.0.0.0 --port $(WORKFLOWS_PORT) --reload

up:
	langgraph up --port $(UP_PORT) $(POSTGRES_FLAG) $(COMPOSE_FLAG)

# Pre-deployment validation per LangGraph docs: forces fresh container
# recreation. Use this when a previous compose run left stale postgres /
# redis containers around — symptom is `langgraph-postgres` resolving to
# the wrong container or `psycopg_pool.PoolTimeout` at startup.
up-recreate:
	langgraph up --recreate --port $(UP_PORT) $(POSTGRES_FLAG) $(COMPOSE_FLAG)

up-fresh:
	langgraph build --no-cache -t $(IMAGE_TAG)
	langgraph up --image $(IMAGE_TAG) --port $(UP_PORT) $(POSTGRES_FLAG) $(COMPOSE_FLAG)

build:
	langgraph build -t $(IMAGE_TAG)

# `langgraph` has no `down` subcommand. Stop containers via docker compose
# project label. `--remove-orphans` is critical when toggling --postgres-uri:
# the cli omits the postgres sibling when --postgres-uri is set, so the
# previously-created `langgraph-postgres` container becomes an orphan and
# any subsequent `up`/`up-recreate` trips on its stale `langgraph-data`
# volume reference ("error response from daemon: get langgraph-data:
# no such volume"). Removing orphans on stop keeps the project clean.
stop:
	-docker ps --filter "label=com.docker.compose.project" --format '{{.Label "com.docker.compose.project"}}' \
		| sort -u | grep -i langgraph \
		| xargs -r -I{} docker compose -p {} down --remove-orphans

logs:
	docker logs -f langgraph-api-1

test:
	pytest

clean:
	-docker image rm $(IMAGE_TAG)
