"""
Job management routes for the matcher service.
"""

import logging
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

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


def get_excel_processor() -> ExcelProcessor:
    return ExcelProcessor()


def get_job_store() -> JobStore:
    return JobStore()


@router.post("", response_model=MatchJobResponse)
async def create_job(
    req: CreateMatchJobRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    excel_processor: ExcelProcessor = Depends(get_excel_processor),
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
        excel_processor=excel_processor,
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
    """Get job progress for polling (lightweight response)."""
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
    excel_processor: ExcelProcessor = Depends(get_excel_processor),
):
    """Download the result Excel file."""
    job = job_store.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != MatchJobStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Job not completed")

    if not job.get("result_file_key"):
        raise HTTPException(status_code=404, detail="Result file not found")

    # Stream the file from S3
    file_stream = excel_processor.get_result_file_stream(job["result_file_key"])
    filename = f"match-results-{job_id}.xlsx"

    return StreamingResponse(
        file_stream,
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
