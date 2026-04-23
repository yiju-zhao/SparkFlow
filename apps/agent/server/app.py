"""FastAPI server hosting apps/agent workflows.

Runs alongside ``langgraph dev`` (which handles agent surfaces). Workflow
routes are stateless; each request carries its own config + model settings.
"""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from server.routes.matcher_jobs import router as matcher_jobs_router
from workflows.search import SearchRequest, SearchResponse, run as run_search

app = FastAPI(title="SparkFlow Workflows", version="0.1.0")

app.include_router(matcher_jobs_router, prefix="/v1/workflows/matcher")


@app.get("/v1/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/v1/workflows/search", response_model=None)
async def search(req: SearchRequest) -> dict[str, Any]:
    result = await run_search(req)
    return {"items": result.items, "reasons": result.reasons}
