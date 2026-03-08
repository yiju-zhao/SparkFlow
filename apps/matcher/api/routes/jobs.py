"""
Job management routes for the matcher service.
"""

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import Response, StreamingResponse

from api.types import (
    CreateMatchJobRequest,
    JobProgressResponse,
    MatchJobResponse,
    MatchJobStatus,
    MatchTargetType,
)
from services.excel_processor import ExcelProcessor
from services.job_runner import JobRunner
from tools.job_store import JobStore

logger = logging.getLogger(__name__)

router = APIRouter()


def get_job_store() -> JobStore:
    return JobStore()


@router.post("", response_model=MatchJobResponse)
async def create_job(
    req: CreateMatchJobRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    job_store: JobStore = Depends(get_job_store),
):
    """
    Create a new match job.

    All data (queries and target_data) is passed directly from Next.js.
    No callbacks needed - matcher processes everything in one request.
    """
    queries = req.queries
    target_data = req.target_data

    if not queries:
        raise HTTPException(status_code=400, detail="No queries provided")

    if not target_data:
        raise HTTPException(status_code=400, detail="No target data provided")

    logger.info(f"Creating job with {len(queries)} queries and {len(target_data)} target items")

    # Create job record
    job_id = job_store.create_job(
        user_id=req.user_id,
        instance_id=req.instance_id,
        target_type=req.target_type.value,
        top_k=req.top_k,
        search_k=req.search_k,
        include_reasons=req.include_reasons,
        query_data=[q.model_dump() for q in queries],
        query_count=len(queries),
        target_data=target_data,
    )

    # Start background processing
    job_runner = JobRunner(
        matcher=request.app.state.matcher,
        excel_processor=ExcelProcessor(),
        job_store=job_store,
    )
    background_tasks.add_task(job_runner.run_job, job_id, target_data)

    # Return the created job
    job = job_store.get_job(job_id)
    return _job_to_response(job)


@router.get("/{job_id}", response_model=MatchJobResponse)
async def get_job(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    """Get full job details including parsed queries."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)


@router.get("/{job_id}/progress", response_model=JobProgressResponse)
async def get_job_progress(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    """Get job progress (single request - use /stream for real-time updates)."""
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


@router.get("/{job_id}/stream")
async def stream_job_progress(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    """Stream job progress updates via Server-Sent Events (SSE)."""

    async def event_generator():
        last_progress = None

        while True:
            job = job_store.get_job(job_id)
            if not job:
                yield f"event: error\ndata: {json.dumps({'error': 'Job not found'})}\n\n"
                break

            # Build progress data
            progress_data = {
                "id": job["id"],
                "status": job["status"],
                "progress": job["progress"],
                "error_message": job.get("error_message"),
                "query_count": job["query_count"],
                "match_count": job["match_count"],
            }

            # Only send if progress changed
            if progress_data != last_progress:
                yield f"data: {json.dumps(progress_data)}\n\n"
                last_progress = progress_data

            # Stop if job is complete
            if job["status"] in ["COMPLETED", "FAILED", "CANCELLED"]:
                break

            # Wait before next check
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


@router.delete("/{job_id}")
async def cancel_job(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    """Cancel a running job."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] not in [MatchJobStatus.PENDING.value, MatchJobStatus.PROCESSING.value]:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")

    job_store.update_job(job_id, status=MatchJobStatus.CANCELLED.value)
    return {"message": "Job cancelled"}


@router.get("/{job_id}/download")
async def download_results(
    job_id: str,
    job_store: JobStore = Depends(get_job_store),
):
    """Download the result Excel file from in-memory store."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != MatchJobStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Job not completed")

    result_data = job_store.get_result_data(job_id)
    if not result_data:
        raise HTTPException(status_code=404, detail="Result data not available (may have been cleared)")

    filename = f"match-results-{job_id}.xlsx"

    return Response(
        content=result_data,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _job_to_response(job: dict) -> MatchJobResponse:
    """Convert job dict to response model."""
    return MatchJobResponse(
        id=job["id"],
        user_id=job["user_id"],
        instance_id=job["instance_id"],
        target_type=MatchTargetType(job["target_type"]),
        top_k=job["top_k"],
        search_k=job["search_k"],
        include_reasons=job["include_reasons"],
        query_file_key=job.get("query_file_key"),
        query_data=job.get("query_data"),
        result_file_key=job.get("result_file_key"),
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
