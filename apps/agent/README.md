# Agent Service (LangGraph)

This directory hosts the LangGraph agent runtime and its supporting modules.

## Layout
- `graphs/`: LangGraph entrypoints (wired in `langgraph.json`)
- `prompts/`: System prompts used by graphs
- `tools/`: Tool implementations (RAGFlow retrieval, helpers)
- `config/`: Shared configuration models/constants

## Entry Point
The default graph is defined at `graphs/rag_agent.py:agent` and referenced in
`langgraph.json`.

## Run Locally
```bash
langgraph dev --host 0.0.0.0 --port 2024
```

## Key Environment Variables
- `OPENAI_API_KEY`
- `RAGFLOW_BASE_URL`
- `RAGFLOW_API_KEY`

## Model Configuration
Edit `config/rag_agent.py` to change the model provider or model name.
