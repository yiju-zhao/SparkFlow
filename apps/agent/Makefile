# Targets for working with the LangGraph CLI (verified against langgraph-cli 0.4.x).
# Reference: https://docs.langchain.com/langsmith/cli

IMAGE_TAG ?= sparkflow-agent:dev
PORT ?= 2024
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

.PHONY: dev serve up up-fresh build stop logs test clean help

help:
	@echo "Targets:"
	@echo "  dev       - In-process LangGraph dev server (no Docker, hot reload)"
	@echo "  serve     - FastAPI workflows server (matcher / digest / search)"
	@echo "  up        - Start postgres/redis + agent (auto-uses override if present)"
	@echo "  up-fresh  - --no-cache rebuild then start (after editing deps)"
	@echo "  build     - Standalone: build $(IMAGE_TAG), don't start"
	@echo "  stop      - Stop the langgraph compose stack"
	@echo "  logs      - Tail logs from the langgraph-api container"
	@echo "  test      - Run pytest"
	@echo "  clean     - Remove the prebuilt image"

dev:
	langgraph dev --host 0.0.0.0 --port $(PORT)

# FastAPI workflows server. Runs alongside `langgraph dev` (different port).
serve:
	uvicorn server.app:app --host 0.0.0.0 --port $(WORKFLOWS_PORT) --reload

up:
	langgraph up --port $(PORT) $(COMPOSE_FLAG)

up-fresh:
	langgraph build --no-cache -t $(IMAGE_TAG)
	langgraph up --image $(IMAGE_TAG) --port $(PORT) $(COMPOSE_FLAG)

build:
	langgraph build -t $(IMAGE_TAG)

# `langgraph` has no `down` subcommand. Stop containers via docker compose
# project label.
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
