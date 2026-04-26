# Targets for working with the LangGraph CLI (verified against langgraph-cli 0.4.x).
# Reference: https://docs.langchain.com/langsmith/cli

IMAGE_TAG ?= sparkflow-agent:dev
PORT ?= 2024
WORKFLOWS_PORT ?= 2027

export DOCKER_BUILDKIT := 1
export COMPOSE_DOCKER_CLI_BUILD := 1

.PHONY: dev serve up up-fresh build stop logs test clean help

help:
	@echo "Targets:"
	@echo "  dev       - In-process LangGraph dev server (no Docker, hot reload)"
	@echo "  serve     - FastAPI workflows server (matcher / digest / search)"
	@echo "  up        - Start postgres/redis + agent (Docker layer cache keeps it fast)"
	@echo "  up-fresh  - Force --no-cache rebuild then start (after editing deps)"
	@echo "  build     - Standalone: build $(IMAGE_TAG), don't start"
	@echo "  stop      - Stop the langgraph compose stack"
	@echo "  logs      - Tail logs from the langgraph-api container"
	@echo "  test      - Run pytest"
	@echo "  clean     - Remove the prebuilt image"

# Fastest path: in-process, hot reload. Use this for daily development.
dev:
	langgraph dev --host 0.0.0.0 --port $(PORT)

# FastAPI workflows server. Runs alongside `langgraph dev` (different port).
# Hosts /v1/workflows/matcher/jobs, /v1/workflows/daily_digest/sections/*,
# and /v1/workflows/search — consumed by apps/web's API routes.
# --reload picks up edits to server/, workflows/, tools/, hermes/.
serve:
	uvicorn server.app:app --host 0.0.0.0 --port $(WORKFLOWS_PORT) --reload

# Daily Docker path. Lets the CLI build + run in one shot — Docker layer
# cache makes repeats fast, no risk of using a stale prebuilt tag.
up:
	langgraph up --port $(PORT)

# Force a rebuild (e.g. after editing requirements/pyproject). Tags the
# image so we can hand it to `langgraph up --image` and skip its rebuild.
up-fresh:
	langgraph build --no-cache -t $(IMAGE_TAG)
	langgraph up --image $(IMAGE_TAG) --port $(PORT)

# Standalone build — useful in CI, or to pre-warm the cache before `up`.
build:
	langgraph build -t $(IMAGE_TAG)

# `langgraph` has no `down` subcommand. Stop containers via docker compose
# project name. The CLI launches under the project named after the parent
# directory of langgraph.json (i.e. apps/agent → "agent").
stop:
	-docker ps --filter "label=com.docker.compose.project" --format '{{.Label "com.docker.compose.project"}}' \
		| sort -u | grep -i langgraph \
		| xargs -r -I{} docker compose -p {} down

logs:
	docker logs -f langgraph-api-1

test:
	pytest

clean:
	-docker image rm $(IMAGE_TAG)
