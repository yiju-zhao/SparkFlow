"""
Matcher job management routes.

Dispatches via the LangGraph + Send orchestrator-worker in
workflows.matcher.job. Background work runs through asyncio.to_thread so
the FastAPI event loop stays responsive while LOTUS / pandas blocks.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import pandas as pd
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from workflows.matcher.job import match_job_graph
from workflows.matcher.job_store import JobStore

from server.matcher_types import (
    CreateMatchJobRequest,
    JobProgressResponse,
    MatchJobResponse,
    MatchJobStatus,
    MatchTargetType,
)

logger = logging.getLogger(__name__)

router = APIRouter()


def get_job_store() -> JobStore:
    return JobStore()


async def _run_and_persist(job_id: str, req: CreateMatchJobRequest, target_data: list[dict]):
    """Run match_job_graph in a worker thread (LOTUS / pandas blocks the loop).

    Terminal-status invariant: this function GUARANTEES that the job ends in
    one of {COMPLETED, FAILED, CANCELLED} before returning. Without this, a
    SIGTERM mid-rank or an unexpected exception would leave the row stuck at
    PROCESSING forever in Postgres.

    asyncio.CancelledError does NOT inherit from Exception in Python 3.8+,
    so it has its own handler that marks the job FAILED with
    error_message="cancelled" and re-raises (must propagate to honour the
    cancellation contract).
    """
    store = JobStore()

    class _Lm:
        provider = req.model_provider
        model = req.model_name
        api_key = req.api_key
        api_base = req.api_base

    class _Req:
        queries = [q.model_dump() for q in req.queries]
        target_type = req.target_type.value
        top_k = req.top_k
        search_k = req.search_k
        include_reasons = req.include_reasons
        lm = _Lm()

    graph_req = _Req()
    target_df = pd.DataFrame(target_data)

    try:
        final = await asyncio.to_thread(
            match_job_graph.invoke,
            {"job_id": job_id, "target_df": target_df, "req": graph_req, "results_by_bu": {}},
        )
        store.update_job(
            job_id,
            status="COMPLETED",
            progress=100,
            result_data=final["excel_bytes"],
            match_count=final["total_matches"],
            completed_at=datetime.now(timezone.utc),
            error_message=None,
        )
    except asyncio.CancelledError:
        # Cancellation MUST propagate (asyncio contract), but we still need
        # to flush a terminal status to the row first. CancelledError doesn't
        # derive from Exception in 3.8+, so the broader except below misses it.
        logger.warning(f"Job {job_id} cancelled mid-run")
        store.update_job(
            job_id,
            status="FAILED",
            error_message="cancelled",
            completed_at=datetime.now(timezone.utc),
        )
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception(f"Job {job_id} failed: {exc}")
        store.update_job(
            job_id,
            status="FAILED",
            error_message=str(exc),
            completed_at=datetime.now(timezone.utc),
        )
    finally:
        # Belt-and-braces: if some path above failed to write a terminal
        # status (e.g. exception inside an exception handler, sync bug),
        # force one here so the row never lingers at PROCESSING.
        job = store.get_job(job_id)
        if job and job.get("status") not in {"COMPLETED", "FAILED", "CANCELLED"}:
            logger.warning(
                f"Job {job_id} exited with non-terminal status "
                f"{job.get('status')!r} — forcing FAILED"
            )
            store.update_job(
                job_id,
                status="FAILED",
                error_message=job.get("error_message") or "unknown error",
                completed_at=datetime.now(timezone.utc),
            )


@router.post("/jobs", response_model=MatchJobResponse)
async def create_job(
    req: CreateMatchJobRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    job_store: JobStore = Depends(get_job_store),
):
    if not req.queries:
        raise HTTPException(status_code=400, detail="No queries provided")
    if not req.target_data:
        raise HTTPException(status_code=400, detail="No target data provided")

    logger.info(
        f"Creating job with {len(req.queries)} queries and {len(req.target_data)} target items"
    )
    job_id = job_store.create_job(
        user_id=req.user_id,
        instance_id=req.instance_id,
        target_type=req.target_type.value,
        top_k=req.top_k,
        search_k=req.search_k,
        include_reasons=req.include_reasons,
        query_data=[q.model_dump() for q in req.queries],
        query_count=len(req.queries),
        target_data=req.target_data,
        model_provider=req.model_provider,
        model_name=req.model_name,
    )
    background_tasks.add_task(_run_and_persist, job_id, req, req.target_data)
    job = job_store.get_job(job_id)
    return _job_to_response(job)


@router.get("/jobs/{job_id}", response_model=MatchJobResponse)
async def get_job(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)


@router.get("/jobs/{job_id}/progress", response_model=JobProgressResponse)
async def get_job_progress(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobProgressResponse(
        id=job["id"],
        status=MatchJobStatus(job["status"]),
        progress=job["progress"],
        error_message=job.get("error_message"),
        query_count=job["query_count"],
        match_count=job["match_count"],
    )


@router.get("/jobs/{job_id}/stream")
async def stream_job_progress(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    """Stream job progress updates via SSE."""

    async def event_generator():
        last_progress = None
        # Emit an SSE comment heartbeat every HEARTBEAT_SECS even when
        # nothing changes. Without this, long rank stages (10+ min on CPU)
        # produce no bytes for minutes and any proxy in the path
        # (undici/Next.js, nginx, cloudflare) will kill the stream on its
        # body-timeout. SSE comments start with ":" and are silently
        # ignored by browser EventSource clients.
        HEARTBEAT_SECS = 15
        ticks_since_heartbeat = 0
        while True:
            job = job_store.get_job(job_id)
            if not job:
                yield f"event: error\ndata: {json.dumps({'error': 'Job not found'})}\n\n"
                break
            progress_data = {
                "id": job["id"],
                "status": job["status"],
                "progress": job["progress"],
                "error_message": job.get("error_message"),
                "query_count": job["query_count"],
                "match_count": job["match_count"],
            }
            if progress_data != last_progress:
                yield f"data: {json.dumps(progress_data)}\n\n"
                last_progress = progress_data
                ticks_since_heartbeat = 0
            else:
                ticks_since_heartbeat += 1
                if ticks_since_heartbeat >= HEARTBEAT_SECS:
                    yield ": heartbeat\n\n"
                    ticks_since_heartbeat = 0
            if job["status"] in ["COMPLETED", "FAILED", "CANCELLED"]:
                break
            await asyncio.sleep(1)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.delete("/jobs/{job_id}")
async def cancel_job(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] not in [MatchJobStatus.PENDING.value, MatchJobStatus.PROCESSING.value]:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")
    job_store.update_job(job_id, status=MatchJobStatus.CANCELLED.value)
    return {"message": "Job cancelled"}


@router.get("/jobs/{job_id}/download")
async def download_results(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] != MatchJobStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Job not completed")
    result_data = job_store.get_result_data(job_id)
    if not result_data:
        raise HTTPException(
            status_code=404, detail="Result data not available (may have been cleared)"
        )
    filename = f"match-results-{job_id}.xlsx"
    return Response(
        content=result_data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _job_to_response(job: dict) -> MatchJobResponse:
    return MatchJobResponse(
        id=job["id"],
        user_id=job["user_id"],
        instance_id=job["instance_id"],
        target_type=MatchTargetType(job["target_type"]),
        top_k=job["top_k"],
        search_k=job["search_k"],
        include_reasons=job["include_reasons"],
        query_data=job.get("query_data"),
        status=MatchJobStatus(job["status"]),
        progress=job["progress"],
        error_message=job.get("error_message"),
        query_count=job["query_count"],
        match_count=job["match_count"],
        created_at=job["created_at"],
        updated_at=job["updated_at"],
        started_at=job.get("started_at"),
        completed_at=job.get("completed_at"),
    )
