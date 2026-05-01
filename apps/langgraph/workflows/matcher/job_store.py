"""
Job Store

Simple in-memory storage for match jobs.
For production, consider using Redis or database.

When the in-memory `status` field of a job actually changes (transition or
terminal flip — not progress ticks), `update_job` fires a best-effort
callback to the Next.js side so Postgres mirrors the workflows-api state
without depending on the user holding open a stream. Callback failure is
logged but never raised; the matcher continues on its own.
"""

import json
import logging
import os
import threading
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

logger = logging.getLogger(__name__)


_CALLBACK_TIMEOUT_S = 5.0

# Module-level state. Previously wrapped in a JobStore singleton with
# __new__ + double-checked locking; the indirection added nothing because
# the data and lock were already module-scope. Replace with a plain dict +
# Lock — fewer lines, same semantics.
_jobs: dict[str, dict] = {}
_lock = threading.Lock()


def _post_status_callback(job_id: str, payload: dict[str, Any]) -> None:
    """POST a status update to the Next.js internal route.

    Synchronous urllib call — update_job is invoked from worker threads
    (asyncio.to_thread) and from inside the LangGraph node bodies, so we
    cannot rely on an event loop being available. urllib in stdlib avoids
    the httpx async/sync split entirely.

    Best-effort: any error logs a warning and returns. Callback failure
    must NOT fail the matcher.
    """
    base = os.getenv("SPARKFLOW_API_URL")
    token = os.getenv("INTERNAL_CALLBACK_TOKEN")
    if not base or not token:
        logger.debug(
            "[matcher callback] SPARKFLOW_API_URL or INTERNAL_CALLBACK_TOKEN unset — skipping"
        )
        return

    url = f"{base.rstrip('/')}/api/internal/matcher/jobs/{job_id}"
    body = json.dumps(_jsonify(payload)).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
            # Sent for compat with existing X-Internal-Token consumers.
            "X-Internal-Token": token,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=_CALLBACK_TIMEOUT_S) as resp:
            if resp.status >= 400:
                logger.warning(
                    "[matcher callback] %s → HTTP %s for job %s", url, resp.status, job_id
                )
    except urllib.error.HTTPError as exc:
        logger.warning(
            "[matcher callback] HTTP %s posting status for job %s: %s",
            exc.code,
            job_id,
            exc.reason,
        )
    except (urllib.error.URLError, OSError) as exc:
        logger.warning("[matcher callback] network error for job %s: %s", job_id, exc)
    except Exception as exc:  # noqa: BLE001 — must never bubble
        logger.warning(
            "[matcher callback] unexpected error for job %s: %s", job_id, exc, exc_info=True
        )


def _jsonify(payload: dict[str, Any]) -> dict[str, Any]:
    """Coerce datetimes etc. to JSON-friendly primitives."""
    out: dict[str, Any] = {}
    for k, v in payload.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def create_job(
    user_id: str,
    instance_id: str,
    target_type: str,
    top_k: int,
    search_k: int,
    include_reasons: bool,
    query_data: list[dict],
    query_count: int,
    target_data: list[dict] = None,
    model_provider: str = None,  # For query optimizer only
    model_name: str = None,  # For query optimizer only
) -> str:
    """Create a new job and return its ID."""
    job_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    with _lock:
        _jobs[job_id] = {
            "id": job_id,
            "user_id": user_id,
            "instance_id": instance_id,
            "target_type": target_type,
            "top_k": top_k,
            "search_k": search_k,
            "include_reasons": include_reasons,
            "query_data": query_data,
            "query_count": query_count,
            "target_data": target_data or [],
            "model_provider": model_provider or "google",
            "model_name": model_name or "gemini-2.5-flash",
            "status": "PENDING",
            "progress": 0,
            "match_count": 0,
            "error_message": None,
            "result_data": None,
            "created_at": now,
            "updated_at": now,
            "started_at": None,
            "completed_at": None,
        }

    logger.info(f"Created job {job_id}")
    return job_id


def get_job(job_id: str) -> Optional[dict]:
    """Get job by ID."""
    with _lock:
        return _jobs.get(job_id)


def update_job(job_id: str, **kwargs) -> None:
    """Update job fields.

    Side effect: when `status` is in the update and the value actually
    differs from the stored status (genuine transition, not idle re-set),
    fire a best-effort callback to Next.js so Postgres mirrors the new
    terminal/intermediate state. Progress-only ticks don't trigger the
    callback — too noisy and the SSE stream already covers them.
    """
    status_changed = False
    callback_payload: dict[str, Any] = {}

    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return

        new_status = kwargs.get("status")
        if new_status is not None and new_status != job.get("status"):
            status_changed = True

        job.update(kwargs)
        job["updated_at"] = datetime.now(timezone.utc)

        if status_changed:
            callback_payload = {
                "status": job["status"],
                "progress": job.get("progress", 0),
                "match_count": job.get("match_count", 0),
                "error_message": job.get("error_message"),
                "started_at": job.get("started_at"),
                "completed_at": job.get("completed_at"),
            }

    if status_changed:
        _post_status_callback(job_id, callback_payload)


def get_result_data(job_id: str) -> Optional[bytes]:
    """Get result Excel bytes for a job."""
    with _lock:
        job = _jobs.get(job_id)
        return job.get("result_data") if job else None


def get_target_data(job_id: str) -> Optional[list[dict]]:
    """Get target data for a job."""
    with _lock:
        job = _jobs.get(job_id)
        return job.get("target_data") if job else None
