"""Process-wide ProcessPoolExecutor for semops rank.

Singleton — one pool per FastAPI process, shared across all rank requests.
Uses ``mp_context=spawn`` to avoid fork-inheriting torch/CUDA state from the
parent.

Pool-rebuild policy
-------------------
The pool is rebuilt ONLY when the executor itself is broken
(``BrokenProcessPool`` / ``BrokenExecutor``). Ordinary task exceptions —
including provider auth errors, rate limits, and ``ValueError`` for bad
candidates — are propagated to the caller without nuking the pool.

Why this matters: the pool is shared across tenants. Rebuilding on every
auth error means one tenant's bad BYOK key cancels every other in-flight
rank, which is a cross-tenant blast radius we cannot afford.

The per-request lotus reset in ``_lotus_worker.run_rank``'s ``finally``
block already ensures no cross-tenant LM leakage — there is nothing left
to "poison" for ordinary exceptions.
"""

from __future__ import annotations

import atexit
import logging
import multiprocessing
import os
import threading
from concurrent.futures import ProcessPoolExecutor
from concurrent.futures.process import BrokenProcessPool
from typing import Any, Callable, TypeVar

try:  # py3.8+: BrokenExecutor is the public base class
    from concurrent.futures import BrokenExecutor
except ImportError:  # pragma: no cover — defensive for older runtimes
    BrokenExecutor = BrokenProcessPool  # type: ignore[assignment,misc]

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

    Pool-rebuild trigger
    --------------------
    The pool is rebuilt ONLY when the executor itself is broken
    (``BrokenProcessPool`` / ``BrokenExecutor``). Every other exception is
    re-raised without touching the pool, because:

    1. Cross-tenant blast radius: rebuilding on a tenant's auth error would
       cancel every other tenant's in-flight rank. We pay that cost only
       when the executor genuinely cannot serve another request.
    2. State hygiene: ``_lotus_worker.run_rank``'s ``finally`` already
       resets ``lotus.settings.lm=None``, so ordinary exceptions leave the
       worker in a clean state — there is nothing to "poison".

    We catch ``Exception`` (NOT ``BaseException``): ``KeyboardInterrupt``
    and ``SystemExit`` should propagate untouched so process shutdown
    works.
    """
    pool = get_pool()
    future = pool.submit(fn, *args, **kwargs)
    try:
        return future.result()
    except (BrokenProcessPool, BrokenExecutor):
        # The executor itself is dead — subsequent submit() calls would
        # raise immediately. Rebuild before re-raising so the next caller
        # gets a working pool.
        logger.warning("semops rank pool is broken; rebuilding")
        shutdown_pool()
        raise
    except Exception:
        # Ordinary task failure (auth error, rate limit, ValueError, etc).
        # Pool stays intact so other tenants' requests are unaffected.
        raise


@atexit.register
def _shutdown_at_exit() -> None:
    shutdown_pool()
