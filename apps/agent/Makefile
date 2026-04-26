# Targets for working with the LangGraph CLI (verified against langgraph-cli 0.4.x).
# Reference: https://docs.langchain.com/langsmith/cli

IMAGE_TAG ?= sparkflow-agent:dev
PORT ?= 2024
WORKFLOWS_PORT ?= 2027

export DOCKER_BUILDKIT := 1
export COMPOSE_DOCKER_CLI_BUILD := 1

# Auto-attach docker-compose.override.yml if present on this host
# (mounts CA cert, sets SSL_CERT_FILE / REQUESTS_CA_BUNDLE / CURL_CA_BUNDLE
# and LANGGRAPH_API_HOST=0.0.0.0).
COMPOSE_OVERRIDE := $(wildcard docker-compose.override.yml)
ifneq ($(COMPOSE_OVERRIDE),)
COMPOSE_FLAG := -d $(COMPOSE_OVERRIDE)
else
COMPOSE_FLAG :=
endif

# Optional: point langgraph at an external Postgres instead of the
# CLI-managed sibling container. Set on hosts where Docker's embedded
# DNS can't resolve compose siblings (corp networks, deeply nested
# docker setups, etc.). Use the host postgres reachable via
# host.docker.internal — the override ensures that name resolves on Linux.
#   make up LANGGRAPH_POSTGRES_URI="postgresql://user:pass@host.docker.internal:5433/langgraph"
ifneq ($(LANGGRAPH_POSTGRES_URI),)
POSTGRES_FLAG := --postgres-uri "$(LANGGRAPH_POSTGRES_URI)"
else
POSTGRES_FLAG :=
endif

.PHONY: dev serve up up-fresh build build-from-scratch stop logs test clean help

help:
	@echo "Targets:"
	@echo "  dev                - In-process LangGraph dev server (no Docker, hot reload)"
	@echo "  serve              - FastAPI workflows server (matcher / digest / search)"
	@echo "  up                 - Start postgres/redis + agent (auto-uses override if present)"
	@echo "  up-fresh           - Rebuild image (deps changed) then start"
	@echo "  build              - Standalone: build $(IMAGE_TAG), don't start"
	@echo "  build-from-scratch - Full --no-cache --pull rebuild (escape hatch)"
	@echo "  stop               - Stop the langgraph compose stack"
	@echo "  logs               - Tail logs from the langgraph-api container"
	@echo "  test               - Run pytest"
	@echo "  clean              - Remove the prebuilt image"

# Fastest path: in-process, hot reload. Use this for daily development.
dev:
	langgraph dev --host 0.0.0.0 --port $(PORT)

# FastAPI workflows server. Runs alongside `langgraph dev` (different port).
# Hosts /v1/workflows/matcher/jobs, /v1/workflows/daily_digest/sections/*,
# and /v1/workflows/search — consumed by apps/web's API routes.
serve:
	uvicorn server.app:app --host 0.0.0.0 --port $(WORKFLOWS_PORT) --reload

# Daily Docker path. Lets the CLI build + run in one shot — Docker layer
# cache makes repeats fast.
up:
	langgraph up --port $(PORT) $(POSTGRES_FLAG) $(COMPOSE_FLAG)

# Rebuild after editing requirements/pyproject.toml. We do NOT pass
# `--no-cache` — Docker's content-addressed layer cache busts the deps
# layer automatically when pyproject.toml changes, and `--no-cache`
# combined with `langgraph build`'s default `--pull` re-fetches the
# wolfi base image, which has caused DNS misbehaviour after upstream
# bumps. Use `make build-from-scratch` if you genuinely want fresh base.
up-fresh:
	langgraph build -t $(IMAGE_TAG)
	langgraph up --image $(IMAGE_TAG) --port $(PORT) $(POSTGRES_FLAG) $(COMPOSE_FLAG)

# Standalone build — useful in CI, or to pre-warm the cache before `up`.
build:
	langgraph build -t $(IMAGE_TAG)

# Escape hatch: full --no-cache --pull rebuild. Only when you specifically
# want the latest upstream base image.
build-from-scratch:
	langgraph build --no-cache --pull -t $(IMAGE_TAG)

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
