"""FastAPI server hosting apps/langgraph workflows.

Runs alongside ``langgraph dev`` (which handles agent surfaces). Workflow
routes are stateless; each request carries its own config + model settings.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Any

# Load apps/langgraph/.env at import time. Uvicorn does NOT auto-load
# .env files (unlike `langgraph dev`), so without this, env-dependent
# routes like /v1/workflows/llm/list-models reject every request with
# 401 "Unauthorized" because INTERNAL_CALLBACK_TOKEN comes back empty.
# python-dotenv is already a dependency.
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, HTTPException, Request

from arq import create_pool
from arq.connections import ArqRedis

from server.routes.llm_models import router as llm_models_router
from server.routes.matcher_jobs import router as matcher_jobs_router
from server.routes.wiki_ingest import router as wiki_ingest_router
from workflows.daily_digest import GenerateSectionRequest, generate_section as run_generate_section
from workflows.digest_worker import WorkerSettings
from workflows.search import SearchRequest, SearchResponse, search


@asynccontextmanager
async def _lifespan(app: FastAPI):
    """Open / close the ARQ Redis connection pool for digest jobs."""
    app.state.arq_pool = await create_pool(WorkerSettings.redis_settings)
    try:
        yield
    finally:
        await app.state.arq_pool.aclose()


app = FastAPI(title="SparkFlow Workflows", version="0.1.0", lifespan=_lifespan)

app.include_router(matcher_jobs_router, prefix="/v1/workflows/matcher")
# /v1/workflows/llm/list-models — BYOK validation (httpx, no litellm).
app.include_router(llm_models_router)
# /v1/workflows/wiki/extract — Python implementation, replaced graph-service.ts.
app.include_router(wiki_ingest_router)


@app.get("/v1/healthz")
async def healthz() -> dict[str, bool]:
    return {"ok": True}


@app.post("/v1/workflows/search", response_model=None)
async def search_route(req: SearchRequest) -> dict[str, Any]:
    result = await search(req)
    return {"items": result.items, "reasons": result.reasons}


@app.post("/v1/workflows/daily_digest/sections/{section_id}/generate", status_code=202)
async def daily_digest_generate(
    section_id: str,
    req: GenerateSectionRequest,
    request: Request,
):
    """Enqueue a daily-digest section generation job.

    Durable: survives this FastAPI process dying. ARQ retries up to
    max_tries before landing the job in the failed list.
    """
    if req.section_id != section_id:
        raise HTTPException(status_code=400, detail="section_id mismatch")

    pool: ArqRedis = request.app.state.arq_pool
    payload = asdict(req)

    job = await pool.enqueue_job(
        "arq_generate_section",
        payload,
        _job_id=f"digest:section:{section_id}",
    )
    if job is None:
        # enqueue_job returns None when a job with the same _job_id is already
        # in the queue. Treat as idempotent retry and return the known id.
        return {"accepted": True, "job_id": f"digest:section:{section_id}", "reused": True}
    return {"accepted": True, "job_id": job.job_id, "reused": False}


@app.get("/v1/workflows/daily_digest/jobs/{job_id}/status")
async def digest_job_status(job_id: str, request: Request):
    """Return ARQ job status for a digest section generation.

    Status values: `deferred`, `queued`, `in_progress`, `complete`, `not_found`.
    For `complete` jobs we include `result`; on failure, `error` holds the
    exception repr so the caller can surface it.
    """
    from arq.jobs import Job, JobStatus

    pool: ArqRedis = request.app.state.arq_pool
    job = Job(job_id, redis=pool)
    status = await job.status()
    response: dict = {
        "job_id": job_id,
        "status": status.value if isinstance(status, JobStatus) else str(status),
    }

    if status == JobStatus.complete:
        try:
            result = await job.result(timeout=0)
        except Exception as exc:  # noqa: BLE001
            response["error"] = repr(exc)
        else:
            response["result"] = result

    return response
