# SparkFlow Toolbox

GenAI Toolbox is the database-facing MCP service for the Research Hub.

## Run locally

1. Install `toolbox` from the official GenAI Toolbox release or package manager.
2. Export the database environment variables used in `tools.yaml`.
3. Start the service:

```bash
toolbox --tools-file apps/toolbox/tools.yaml
```

Default local URL: `http://127.0.0.1:5000`

## Purpose

- Read-only, deterministic PostgreSQL query tools for hub exploration
- Schema/value probing for ambiguous user requests
- Structured list/count/aggregate results for the hub agent

This service does **not** render MCP Apps. Rendering stays in `apps/mcp-server`.
