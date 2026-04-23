"""FastAPI server hosting apps/agent workflows.

Runs alongside ``langgraph dev`` (which handles agent surfaces). Workflow
routes are stateless; each request carries its own config + model settings.
"""

from __future__ import annotations

from fastapi import FastAPI

app = FastAPI(title="SparkFlow Workflows", version="0.1.0")


@app.get("/v1/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}
