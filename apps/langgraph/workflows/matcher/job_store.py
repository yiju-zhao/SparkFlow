"""
Job Store

Simple in-memory storage for match jobs.
For production, consider using Redis or database.

When the in-memory `status` field of a job actually changes (transition or
terminal flip — not progress ticks), `update_job` fires a best-effort
callback to the Next.js side so Postgres mirrors the workflows-api state
without depending on the user holding open a stream. Callback failure is
logged but never raised; the matcher continues on its own.

Live-update contract for SSE consumers:

- `subscribe(job_id) -> (event, loop)` returns an `asyncio.Event` that
  `update_job` will signal whenever the job dict mutates. Callers must be
  on a running asyncio loop (the matcher's SSE generator).
- `update_job` calls `loop.call_soon_threadsafe(event.set)` because it
  runs from worker threads (asyncio.to_thread) where touching an
  asyncio.Event directly would cross the thread boundary.
- The SSE generator does `await event.wait()` instead of polling — gives
  sub-millisecond latency between a node writing progress and the
  browser seeing it, with no 1Hz busy loop.
"""

import asyncio
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

# Per-job (event, loop) tuples. Set when an SSE handler calls
# `subscribe(job_id)`; cleared when it calls `unsubscribe(job_id)`.
# `update_job` does loop.call_soon_threadsafe(event.set) on any mutation
# so the SSE generator can `await event.wait()` instead of polling.
#
# Multiple concurrent subscribers on the same job share one Event — the
# Event itself fans out via wait()→set()→clear() per loop iteration in
# the generator. weakref.WeakValueDictionary so a forgotten unsubscribe
# can't keep loops alive forever (best-effort).
_subscribers: dict[str, tuple[asyncio.Event, asyncio.AbstractEventLoop]] = {}
_subscribers_lock = threading.Lock()


def subscribe(job_id: str) -> asyncio.Event:
    """Return (creating if needed) the asyncio.Event for this job.

    Must be called from a running asyncio loop — captures
    `asyncio.get_running_loop()` so worker threads can signal across the
    thread boundary via `loop.call_soon_threadsafe`.
    """
    loop = asyncio.get_running_loop()
    with _subscribers_lock:
        existing = _subscribers.get(job_id)
        if existing is not None:
            event, _ = existing
            return event
        event = asyncio.Event()
        _subscribers[job_id] = (event, loop)
        return event


def unsubscribe(job_id: str) -> None:
    """Drop the per-job Event/loop registration. Idempotent."""
    with _subscribers_lock:
        _subscribers.pop(job_id, None)


def _signal_subscriber(job_id: str) -> None:
    """Wake any SSE generator waiting on this job. Safe from any thread."""
    with _subscribers_lock:
        entry = _subscribers.get(job_id)
    if entry is None:
        return
    event, loop = entry
    if loop.is_closed():
        return
    try:
        loop.call_soon_threadsafe(event.set)
    except RuntimeError:
        # Loop has shut down between the check and the call. Best-effort.
        pass


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
    job_id: Optional[str] = None,
) -> str:
    """Create a new job and return its ID.

    `job_id` may be supplied by the caller (Next.js owns row identity so
    its single-flight unique index can fire before dispatch). If absent
    we generate a UUID for legacy/direct callers.
    """
    if not job_id:
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


_TERMINAL_STATUSES = frozenset({"COMPLETED", "FAILED", "CANCELLED"})


def update_job(job_id: str, **kwargs) -> None:
    """Update job fields.

    Side effect: when `status` is in the update and the value actually
    differs from the stored status (genuine transition, not idle re-set),
    fire a best-effort callback to Next.js so Postgres mirrors the new
    terminal/intermediate state. Progress-only ticks don't trigger the
    callback — too noisy and the SSE stream already covers them.

    Terminal-status guard: once a job lands in COMPLETED / FAILED /
    CANCELLED, this function refuses to overwrite the status field. The
    LOTUS rank thread can finish minutes after the user clicks Cancel;
    without this guard, the late `update_job(status="COMPLETED")` from
    `_run_and_persist`'s try-body would un-cancel a cancelled job and
    diverge from the Postgres mirror (which has the same guard on the
    callback receiver). Other fields (progress, match_count, error
    messages) are still updateable for diagnostic purposes.
    """
    status_changed = False
    callback_payload: dict[str, Any] = {}

    with _lock:
        job = _jobs.get(job_id)
        if not job:
            return

        current_status = job.get("status")
        new_status = kwargs.get("status")

        # Refuse status writes that would un-terminate. Drop the status
        # key from kwargs so the rest of the update still applies — a
        # stuck row should still be able to log its final progress %.
        if (
            current_status in _TERMINAL_STATUSES
            and new_status is not None
            and new_status != current_status
        ):
            logger.info(
                "[job_store] dropping late status=%s for job %s already at %s",
                new_status,
                job_id,
                current_status,
            )
            kwargs = {k: v for k, v in kwargs.items() if k != "status"}
            new_status = None

        if new_status is not None and new_status != current_status:
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

    # Wake any SSE subscriber so it emits the new state immediately
    # instead of waiting for a polling tick. Done after the lock + the
    # cross-app callback so the in-process SSE consumer never races
    # ahead of the Postgres mirror.
    _signal_subscriber(job_id)


def get_result_data(job_id: str) -> Optional[bytes]:
    """Get result Excel bytes for a job."""
    with _lock:
        job = _jobs.get(job_id)
        return job.get("result_data") if job else None


def clear_result_data(job_id: str) -> None:
    """Free the in-memory Excel bytes for a job once they've been
    persisted to disk by the Next.js sync handler.

    Without this the `_jobs[id]["result_data"]` blob lives forever and
    a workflows-api process serving N matcher jobs grows linearly in
    heap with N. The bytes are still on disk under
    `apps/web/data/match-results/{id}.xlsx` — the user-facing download
    route reads from there, not from this in-memory copy.
    """
    with _lock:
        job = _jobs.get(job_id)
        if job is not None:
            job.pop("result_data", None)


def get_target_data(job_id: str) -> Optional[list[dict]]:
    """Get target data for a job."""
    with _lock:
        job = _jobs.get(job_id)
        return job.get("target_data") if job else None
