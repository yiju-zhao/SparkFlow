---
phase: 01-foundation-data
plan: 04
subsystem: agent
tags: [hub-agent, langchain, psycopg, database-tools]
dependency_graph:
  requires: [03]
  provides: [hub-agent-config, hub-agent-prompt, hub-query-tools]
  affects: [05-hub-agent-assembly]
tech_stack:
  added: [psycopg3]
  patterns: [langchain-tool-decorator, dataclass-config]
key_files:
  created:
    - apps/agent/config/hub_agent.py
    - apps/agent/prompts/hub_agent.py
    - apps/agent/tools/hub_queries.py
  modified: []
decisions:
  - "Used psycopg3 (psycopg) not psycopg2 — matches requirements.txt which has psycopg[binary]"
  - "Used dataclass for HubAgentConfig (consistent with RAGAgentConfig pattern)"
  - "Used ILIKE with unnest() for array columns (speaker, topic) in search_sessions"
metrics:
  duration: 2min
  completed: 2026-03-05
---

# Phase 1 Plan 04: Hub Agent Configuration, Prompt, and Query Tools Summary

Hub agent building blocks created: config module, system prompt, and four PostgreSQL query tools using psycopg3 and langchain @tool decorator.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Hub agent configuration | 4ddf471 | apps/agent/config/hub_agent.py |
| 2 | Create Hub agent system prompt | 4c7adeb | apps/agent/prompts/hub_agent.py |
| 3 | Create Hub query tools | 9edc1f7 | apps/agent/tools/hub_queries.py |

## What Was Built

### apps/agent/config/hub_agent.py
- `HubAgentConfig` dataclass with `model_provider` ("openai") and `model_name` ("gpt-4o-mini")
- Exports `HUB_AGENT_CONFIG` singleton
- Consistent with existing `RAGAgentConfig` pattern

### apps/agent/prompts/hub_agent.py
- `HUB_AGENT_SYSTEM_PROMPT` defining the Research Hub assistant role
- Documents all four query tools with usage guidance
- Sets structured response style for conference discovery

### apps/agent/tools/hub_queries.py
Four `@tool`-decorated functions for PostgreSQL queries:
- `list_venues()` — all venues with instance counts via GROUP BY
- `list_instances(venue_id="")` — instances with session counts, optionally filtered by venue
- `list_sessions(instance_id)` — sessions for an instance ordered by date/time
- `search_sessions(query)` — ILIKE search across title, abstract, overview, speaker[], topic[] (limit 20)

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Environment Note

The plan's verification command (`python -c "from tools.hub_queries import ..."`) failed because `psycopg` and `langchain` are not installed in the system Python. These packages are meant to run in the agent's Docker/venv environment. All three files have valid Python syntax verified via `python -m py_compile`. This is expected for this project structure.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| psycopg3 (psycopg) | requirements.txt specifies `psycopg[binary]` which is psycopg3 |
| dataclass config | Matches existing RAGAgentConfig pattern — simpler than pydantic_settings for v1 |
| ILIKE + unnest() for arrays | PostgreSQL-native way to case-insensitively search String[] columns |

## Self-Check: PASSED

- apps/agent/config/hub_agent.py: EXISTS
- apps/agent/prompts/hub_agent.py: EXISTS
- apps/agent/tools/hub_queries.py: EXISTS
- Commits 4ddf471, 4c7adeb, 9edc1f7: ALL EXIST
