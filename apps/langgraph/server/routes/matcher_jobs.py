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
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import Response, StreamingResponse
from workflows.matcher import job_store
from workflows.matcher.job import match_job_graph

from server.matcher_types import (
    CreateMatchJobRequest,
    JobProgressResponse,
    MatchJobResponse,
    MatchJobStatus,
    MatchTargetType,
)

logger = logging.getLogger(__name__)

router = APIRouter()


async def _run_and_persist(job_id: str, req: CreateMatchJobRequest, target_data: list[dict]):
    """Run match_job_graph in a worker thread (LOTUS / pandas blocks the loop).

    BYOK credentials (``api_key`` / ``api_base``) flow as a side-channel via
    ``RunnableConfig.configurable.lm_config``. They MUST NOT enter the
    JobState — putting them on the graph state leaks them into LangSmith
    traces and any checkpoint store. See issue #152.

    Terminal-status invariant: this function GUARANTEES that the job ends in
    one of {COMPLETED, FAILED, CANCELLED} before returning. Without this, a
    SIGTERM mid-rank or an unexpected exception would leave the row stuck at
    PROCESSING forever in Postgres. See issue #150.

    asyncio.CancelledError does NOT inherit from Exception in Python 3.8+,
    so it has its own handler that marks the job FAILED with
    error_message="cancelled" and re-raises (must propagate to honour the
    cancellation contract).
    """
    try:

        class _Req:
            """Non-secret, plain-data shim for graph state.

            Holds only fields safe to log / checkpoint / trace. The LM
            credentials live exclusively in the RunnableConfig below.
            """

            queries = [q.model_dump() for q in req.queries]
            target_type = req.target_type.value
            top_k = req.top_k
            search_k = req.search_k
            include_reasons = req.include_reasons

        graph_req = _Req()
        target_df = pd.DataFrame(target_data)
        lm_config: dict = {
            "provider": req.model_provider,
            "model": req.model_name,
            "api_key": req.api_key,
        }
        if req.api_base:
            lm_config["api_base"] = req.api_base
        run_config = {"configurable": {"lm_config": lm_config}}
        final = await asyncio.to_thread(
            match_job_graph.invoke,
            {"job_id": job_id, "target_df": target_df, "req": graph_req, "results_by_bu": {}},
            run_config,
        )
        job_store.update_job(
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
        job_store.update_job(
            job_id,
            status="FAILED",
            error_message="cancelled",
            completed_at=datetime.now(timezone.utc),
        )
        raise
    except Exception as exc:  # noqa: BLE001
        logger.exception(f"Job {job_id} failed: {exc}")
        job_store.update_job(
            job_id,
            status="FAILED",
            error_message=str(exc),
            completed_at=datetime.now(timezone.utc),
        )
    finally:
        # Belt-and-braces: if some path above failed to write a terminal
        # status (e.g. exception inside an exception handler, sync bug),
        # force one here so the row never lingers at PROCESSING.
        job = job_store.get_job(job_id)
        if job and job.get("status") not in {"COMPLETED", "FAILED", "CANCELLED"}:
            logger.warning(
                f"Job {job_id} exited with non-terminal status "
                f"{job.get('status')!r} — forcing FAILED"
            )
            job_store.update_job(
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
async def get_job(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)


@router.get("/jobs/{job_id}/progress", response_model=JobProgressResponse)
async def get_job_progress(job_id: str):
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
async def stream_job_progress(job_id: str):
    """Stream job progress updates via SSE.

    Event-driven: subscribes to a per-job ``asyncio.Event`` that
    ``job_store.update_job`` signals on every mutation. Sub-millisecond
    latency from a node writing progress to the browser seeing it, with
    no 1Hz polling under a Lock. The HEARTBEAT_SECS comment still fires
    on silence so proxies (undici/Next.js, nginx) don't kill long
    streams.
    """
    # HEARTBEAT_SECS: SSE comment ":" line emitted on prolonged silence.
    # Long rank stages (10+ min on CPU) produce no bytes for minutes and
    # any proxy in the path will kill the stream on its body-timeout.
    HEARTBEAT_SECS = 15

    async def event_generator():
        last_progress = None
        event = job_store.subscribe(job_id)
        try:
            while True:
                # Clear BEFORE reading state. If `update_job` fires between
                # the read and the wait, the event is set and `event.wait()`
                # returns immediately on the next iteration — no lost wakeup.
                event.clear()
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
                if job["status"] in ["COMPLETED", "FAILED", "CANCELLED"]:
                    break
                # Wait for the next mutation (event.set) OR HEARTBEAT_SECS
                # of silence. Heartbeat keeps proxies from body-timing-out
                # the stream during long rank stages.
                try:
                    await asyncio.wait_for(event.wait(), timeout=HEARTBEAT_SECS)
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            job_store.unsubscribe(job_id)

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
async def cancel_job(job_id: str):
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["status"] not in [MatchJobStatus.PENDING.value, MatchJobStatus.PROCESSING.value]:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")
    job_store.update_job(job_id, status=MatchJobStatus.CANCELLED.value)
    return {"message": "Job cancelled"}


@router.get("/jobs/{job_id}/download")
async def download_results(job_id: str):
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
