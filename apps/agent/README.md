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
```bash
langgraph dev --host 0.0.0.0 --port 2024
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
