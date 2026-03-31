---
phase: 01-foundation-data
plan: 05
subsystem: agent
tags: [langgraph, hub-agent, deepagents, postgresql, conference-discovery]
dependency_graph:
  requires: [04]
  provides: [hub-agent-runtime]
  affects: [langgraph-server]
tech_stack:
  added: []
  patterns: [deep-agents, langgraph-server-managed-persistence]
key_files:
  created:
    - apps/agent/graphs/hub_agent.py
  modified:
    - apps/agent/langgraph.json
    - apps/web/.env.example
    - apps/agent/.env.example
decisions:
  - LangGraph server manages PostgresSaver — no custom checkpointer in hub_agent.py (mirrors rag_agent.py pattern)
metrics:
  duration: 3min
  completed_date: 2026-03-05
  tasks_completed: 3
  files_changed: 4
requirements_satisfied:
  - INFRA-04
  - INFRA-05
---

# Phase 1 Plan 05: Hub Agent Assembly and Registration Summary

**One-liner:** Research Hub agent assembled using create_deep_agent with conference query tools and registered in LangGraph server as "hub" endpoint.

## What Was Built

- `apps/agent/graphs/hub_agent.py` — Hub agent entry point that wires together HUB_AGENT_CONFIG, HUB_AGENT_SYSTEM_PROMPT, and the four query tools (list_venues, list_instances, list_sessions, search_sessions)
- `apps/agent/langgraph.json` — Added "hub" graph entry pointing to hub_agent.py:hub_agent, enabling /runs/stream/hub endpoint
- `.env.example` files — Documented HUB_AGENT_MODEL_PROVIDER, HUB_AGENT_MODEL_NAME, and DATABASE_URL for hub agent configuration

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| No custom checkpointer in hub_agent.py | LangGraph server (langgraph dev/up) manages PostgresSaver automatically — matches rag_agent.py behavior and docstring convention |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Design Alignment] Removed custom PostgresSaver instantiation**
- **Found during:** Task 1
- **Issue:** Plan's code sample used `get_checkpointer()` with manual `ConnectionPool` + `PostgresSaver`, but the existing `rag_agent.py` explicitly documents that custom checkpointers should NOT be specified when running under LangGraph server
- **Fix:** Created hub_agent.py without custom checkpointer, matching the established rag_agent.py pattern; LangGraph server provides PostgresSaver automatically
- **Files modified:** apps/agent/graphs/hub_agent.py

## Verification

- [x] hub agent created at apps/agent/graphs/hub_agent.py with hub_agent export
- [x] langgraph.json contains "hub" key pointing to graphs/hub_agent.py:hub_agent
- [x] HUB_AGENT_ variables documented in apps/web/.env.example
- [x] Agent uses query tools from Plan 04 (list_venues, list_instances, list_sessions, search_sessions)
- [x] State persistence via LangGraph server PostgresSaver (INFRA-05)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | dc3ade8 | feat(01-05): create Research Hub agent with hub query tools |
| 2 | b6bdaa9 | feat(01-05): register hub agent in langgraph.json |
| 3 | 12ebf3e | feat(01-05): document Hub agent environment variables |

## Self-Check: PASSED

- apps/agent/graphs/hub_agent.py: FOUND
- apps/agent/langgraph.json contains "hub": FOUND (verified via python -c)
- apps/web/.env.example HUB_AGENT_ vars: FOUND (verified via grep)
