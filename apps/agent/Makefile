IMAGE_TAG ?= sparkflow-agent:dev
PORT ?= 2024

export DOCKER_BUILDKIT := 1
export COMPOSE_DOCKER_CLI_BUILD := 1

.PHONY: dev build up up-fresh down lint test clean help

help:
	@echo "Targets:"
	@echo "  dev       - In-process LangGraph dev server (fastest; no Docker)"
	@echo "  build     - Build the agent image once ($(IMAGE_TAG))"
	@echo "  up        - Start postgres/redis + agent, reusing the prebuilt image"
	@echo "  up-fresh  - Rebuild image and start (use after dependency changes)"
	@echo "  down      - Stop and remove the up stack"
	@echo "  test      - Run pytest"
	@echo "  clean     - Remove the prebuilt image"

# Fastest path: in-process, hot reload. Use this for daily development.
dev:
	langgraph dev --host 0.0.0.0 --port $(PORT)

# One-shot build. Re-run only when requirements.txt / pyproject.toml change.
build:
	langgraph build -t $(IMAGE_TAG)

# Start the stack against an already-built image — skips the build step.
up: build
	langgraph up --image $(IMAGE_TAG) --port $(PORT)

# Force a rebuild (e.g. after editing requirements).
up-fresh:
	langgraph build --no-cache -t $(IMAGE_TAG)
	langgraph up --image $(IMAGE_TAG) --port $(PORT)

down:
	langgraph down || true

test:
	pytest

clean:
	-docker image rm $(IMAGE_TAG)
