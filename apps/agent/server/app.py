"""FastAPI server hosting apps/agent workflows.

Runs alongside ``langgraph dev`` (which handles agent surfaces). Workflow
routes are stateless; each request carries its own config + model settings.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from workflows.search import SearchRequest, SearchResponse, run as run_search

app = FastAPI(title="SparkFlow Workflows", version="0.1.0")


@app.get("/v1/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/v1/workflows/search", response_model=None)
async def search(req: SearchRequest) -> dict[str, Any]:
    result = await run_search(req)
    return {"items": result.items, "reasons": result.reasons}
