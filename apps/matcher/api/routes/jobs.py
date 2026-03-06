"""
Job management routes for the matcher service.
"""

import asyncio
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
    ParsedQueriesResponse,
    ParseFileRequest,
)
from services.excel_processor import ExcelProcessor
from services.job_runner import JobRunner
from tools.data_loader import DataLoader

logger = logging.getLogger(__name__)

router = APIRouter()


def get_data_loader(request: Request) -> DataLoader:
    return request.app.state.data_loader


def get_excel_processor() -> ExcelProcessor:
    return ExcelProcessor()


@router.post("/parse", response_model=ParsedQueriesResponse)
async def parse_file(
    req: ParseFileRequest,
    excel_processor: ExcelProcessor = Depends(get_excel_processor),
):
    """Parse queries from an uploaded Excel file for preview."""
    try:
        queries = excel_processor.parse_queries(req.file_key)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {e}")

    return ParsedQueriesResponse(
        queries=queries,
        total_count=len(queries),
    )


@router.post("", response_model=MatchJobResponse)
async def create_job(
    req: CreateMatchJobRequest,
    background_tasks: BackgroundTasks,
    request: Request,
    data_loader: DataLoader = Depends(get_data_loader),
    excel_processor: ExcelProcessor = Depends(get_excel_processor),
):
    """
    Create a new match job.

    Accepts either:
    - queries: Pre-parsed queries from frontend (preferred)
    - query_file_key: S3 key to parse queries from file

    The job runs in the background.
    """
    # Verify instance exists
    instance = data_loader.get_instance(req.instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Instance not found")

    # Get queries - either from request or by parsing file
    if req.queries:
        queries = req.queries
        logger.info(f"Using {len(queries)} queries from request")
    elif req.query_file_key:
        try:
            queries = excel_processor.parse_queries(req.query_file_key)
            logger.info(f"Parsed {len(queries)} queries from file {req.query_file_key}")
        except Exception as e:
            logger.error(f"Failed to parse queries: {e}")
            raise HTTPException(status_code=400, detail=f"Failed to parse query file: {e}")
    else:
        raise HTTPException(status_code=400, detail="Either queries or query_file_key must be provided")

    # Create job record in database
    job_id = data_loader.create_match_job(
        user_id=req.user_id,
        instance_id=req.instance_id,
        target_type=req.target_type.value,
        top_k=req.top_k,
        search_k=req.search_k,
        include_reasons=req.include_reasons,
        query_file_key=req.query_file_key or "",
        query_data=[q.model_dump() for q in queries],
        query_count=len(queries),
    )

    # Start background processing
    job_runner = JobRunner(
        matcher=request.app.state.matcher,
        data_loader=data_loader,
        excel_processor=excel_processor,
    )
    background_tasks.add_task(job_runner.run_job, job_id)

    # Return the created job
    job = data_loader.get_match_job(job_id)
    return _job_to_response(job)


@router.get("/{job_id}", response_model=MatchJobResponse)
async def get_job(
    job_id: str,
    data_loader: DataLoader = Depends(get_data_loader),
):
    """Get full job details including parsed queries."""
    job = data_loader.get_match_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return _job_to_response(job)


@router.get("/{job_id}/progress", response_model=JobProgressResponse)
async def get_job_progress(
    job_id: str,
    data_loader: DataLoader = Depends(get_data_loader),
):
    """Get job progress for polling (lightweight response)."""
    job = data_loader.get_match_job(job_id)
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
    data_loader: DataLoader = Depends(get_data_loader),
):
    """Cancel a running job."""
    job = data_loader.get_match_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] not in [MatchJobStatus.PENDING.value, MatchJobStatus.PROCESSING.value]:
        raise HTTPException(status_code=400, detail="Job cannot be cancelled")

    data_loader.update_match_job(job_id, status=MatchJobStatus.CANCELLED.value)
    return {"message": "Job cancelled"}


@router.get("/{job_id}/download")
async def download_results(
    job_id: str,
    data_loader: DataLoader = Depends(get_data_loader),
    excel_processor: ExcelProcessor = Depends(get_excel_processor),
):
    """Download the result Excel file."""
    job = data_loader.get_match_job(job_id)
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
    """Convert database row to response model."""
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
