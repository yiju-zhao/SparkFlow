"""ARQ worker configuration for daily-digest jobs.

Run the worker:
    cd apps/langgraph
    arq workflows.digest_worker.WorkerSettings

The worker connects to the same Redis instance used by the web app's
BullMQ queue (PR-A) — different keyspaces, no collision.
"""

from __future__ import annotations

import os

from arq.connections import RedisSettings

from workflows.digest_tasks import arq_generate_section


def _redis_settings() -> RedisSettings:
    """Parse REDIS_URL into ARQ's RedisSettings. Falls back to localhost:6379."""
    url = os.getenv("REDIS_URL", "redis://localhost:6379")
    return RedisSettings.from_dsn(url)


class WorkerSettings:
    """ARQ picks this up via `arq <module>.WorkerSettings`."""

    functions = [arq_generate_section]
    redis_settings = _redis_settings()
    # Concurrent digest sections per worker process. Each section issues
    # several LLM calls — 4 is a safe default; tune via env var.
    max_jobs = int(os.getenv("DIGEST_WORKER_CONCURRENCY", "4"))
    # Total attempts per job before landing in the failed list.
    max_tries = 3
    # Keep completed job results for 24h so status polling can read outcomes
    # after the job finishes.
    keep_result = 24 * 3600
