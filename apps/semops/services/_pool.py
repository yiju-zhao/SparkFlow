"""Process-wide ProcessPoolExecutor for semops rank.

Singleton — one pool per FastAPI process, shared across all rank requests.
Uses ``mp_context=spawn`` to avoid fork-inheriting torch/CUDA state from the
parent. On any worker exception we shut down and rebuild the pool
(poisoned-worker recovery), because ProcessPoolExecutor does not evict a
worker that raised — the NEXT task would run in the same subprocess with
potentially corrupted ``lotus.settings.lm``.
"""

from __future__ import annotations

import atexit
import logging
import multiprocessing
import os
import threading
from concurrent.futures import ProcessPoolExecutor
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

_T = TypeVar("_T")

_lock = threading.Lock()
_pool: ProcessPoolExecutor | None = None


def _pool_size() -> int:
    env = os.getenv("SEMOPS_RANK_POOL_SIZE")
    if env:
        try:
            n = int(env)
            if n > 0:
                return n
        except ValueError:
            logger.warning("invalid SEMOPS_RANK_POOL_SIZE=%r; falling back to default", env)
    return min(4, os.cpu_count() or 1)


def _build_pool() -> ProcessPoolExecutor:
    size = _pool_size()
    ctx = multiprocessing.get_context("spawn")
    # Import at use site to avoid a cycle if _lotus_worker ever grows a
    # dependency on _pool.
    from services._lotus_worker import init_worker

    pool = ProcessPoolExecutor(
        max_workers=size,
        mp_context=ctx,
        initializer=init_worker,
    )
    logger.info("semops rank pool created: size=%d context=spawn", size)
    return pool


def get_pool() -> ProcessPoolExecutor:
    """Return the process-wide pool, building it lazily if needed."""
    global _pool
    with _lock:
        if _pool is None:
            _pool = _build_pool()
        return _pool


def shutdown_pool() -> None:
    """Shut down the pool (cancel pending futures, kill workers).

    Safe to call multiple times; safe to call when no pool exists.
    """
    global _pool
    with _lock:
        if _pool is None:
            return
        old = _pool
        _pool = None
    try:
        old.shutdown(wait=False, cancel_futures=True)
    except Exception as exc:  # noqa: BLE001
        logger.warning("semops pool shutdown raised: %s", exc)
    else:
        logger.info("semops rank pool shut down")


def run_in_pool(fn: Callable[..., _T], /, *args: Any, **kwargs: Any) -> _T:
    """Submit ``fn(*args, **kwargs)`` to the pool and block on the result.

    On exception the pool is rebuilt before re-raising, so the next caller
    gets a fresh pool with no residual ``lotus.settings.lm`` state.
    """
    pool = get_pool()
    future = pool.submit(fn, *args, **kwargs)
    try:
        return future.result()
    except BaseException:
        logger.warning("semops rank task raised; rebuilding pool")
        shutdown_pool()
        raise


@atexit.register
def _shutdown_at_exit() -> None:
    shutdown_pool()
