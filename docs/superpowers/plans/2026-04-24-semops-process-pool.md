# Semops LOTUS ProcessPoolExecutor (PR-B) Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the `_LOTUS_LOCK` process-wide lock that serializes every `/api/operators/rank` call. Replace it with a `ProcessPoolExecutor` (spawn context) so N rank requests run in parallel — each in its own subprocess with its own isolated `lotus.settings.lm` global.

**Architecture:** Module-level `ProcessPoolExecutor(max_workers=N, mp_context=get_context("spawn"))` created lazily on first rank call. Each rank task is a top-level function that configures LOTUS at entry, runs the pipeline, and resets config in `finally`. On any exception the pool is shut down and recreated (poisoned-worker recovery). FastAPI `lifespan` warms up the pool at startup to amortize torch/faiss imports.

**Tech Stack:** Python 3.10+, `concurrent.futures.ProcessPoolExecutor`, `multiprocessing.get_context("spawn")`, FastAPI, pytest + pytest-asyncio + pytest-mock.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/semops/services/_lotus_worker.py` | Create | Subprocess entry points — `init_worker()` (warm-up) and `run_rank(...)` (per-request work). Imports torch/lotus on subprocess startup; configures `lotus.settings.lm` per call with `finally` reset. |
| `apps/semops/services/_pool.py` | Create | Process-wide ProcessPoolExecutor singleton with lazy init, poisoned-worker recovery (pool rebuild on task exception), and graceful shutdown hooks. Reads `SEMOPS_RANK_POOL_SIZE` env. |
| `apps/semops/services/semantic_operators.py` | Modify | Delete `_LOTUS_LOCK`, `_LAST_LM_KEY`, `_configure_lotus_lm`. Rewrite `rank()` to submit the pipeline to the pool and block on the result. Keep the DI / test-bypass path untouched. |
| `apps/semops/api/main.py` | Modify | Wire pool lifecycle into FastAPI lifespan: warm-up at startup, graceful shutdown. |
| `apps/semops/tests/test_semantic_operators.py` | Modify | Add unit tests for the new worker function (`run_rank` calls configure→pipeline→reset) and for the pool helper (rebuild on exception). Existing tests must keep passing. |
| `apps/semops/.env.example` | Modify | Document `SEMOPS_RANK_POOL_SIZE`. |

---

## Task 1: Worker function with LOTUS config lifecycle

**Files:**
- Create: `apps/semops/services/_lotus_worker.py`
- Modify: `apps/semops/tests/test_semantic_operators.py`

- [ ] **Step 1: Write failing test**

Append to `apps/semops/tests/test_semantic_operators.py`:

```python
def test_run_rank_configures_lotus_and_resets(monkeypatch):
    """run_rank must configure lotus.settings.lm at entry and clear it in finally."""
    import sys
    from unittest.mock import MagicMock

    calls: list = []

    fake_settings = MagicMock()
    fake_settings.configure = MagicMock(side_effect=lambda **kw: calls.append(("configure", kw)))
    fake_lotus = MagicMock()
    fake_lotus.settings = fake_settings

    class FakeLM:
        def __init__(self, **kw):
            calls.append(("LM", kw))

    fake_models = MagicMock()
    fake_models.LM = FakeLM

    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    from services._lotus_worker import run_rank

    def fake_pipeline(candidates, query_text, top_k, search_k, include_reasons):
        calls.append(("pipeline", len(candidates), query_text))
        return [{"id": "x", "recommendation_reason": "ok"}]

    result = run_rank(
        lm_config={
            "provider": "openai",
            "model": "gpt-4o-mini",
            "api_key": "sk-test",
            "api_base": None,
        },
        candidates=[{"id": "a", "match_text": "x"}],
        query_text="q",
        top_k=5,
        search_k=20,
        include_reasons=True,
        pipeline_fn=fake_pipeline,
    )

    # 1. LM instantiated with the caller's config (model includes provider prefix).
    lm_calls = [c for c in calls if c[0] == "LM"]
    assert len(lm_calls) == 1
    assert lm_calls[0][1]["model"] == "openai/gpt-4o-mini"
    assert lm_calls[0][1]["api_key"] == "sk-test"

    # 2. configure invoked exactly twice: once with lm=LM(...), once with lm=None in finally.
    configure_calls = [c for c in calls if c[0] == "configure"]
    assert len(configure_calls) == 2
    assert configure_calls[0][1].get("lm") is not None
    assert configure_calls[1][1].get("lm") is None

    # 3. Pipeline ran between the two configures.
    pipeline_calls = [c for c in calls if c[0] == "pipeline"]
    assert len(pipeline_calls) == 1
    order = [c[0] for c in calls]
    assert order.index("configure") < order.index("pipeline") < order[::-1].index("configure") == 0


def test_run_rank_resets_lotus_on_pipeline_exception(monkeypatch):
    """Even when the pipeline raises, the finally block must reset lotus.settings.lm=None."""
    import sys
    from unittest.mock import MagicMock

    configure_calls: list = []
    fake_settings = MagicMock()
    fake_settings.configure = MagicMock(side_effect=lambda **kw: configure_calls.append(kw))
    fake_lotus = MagicMock()
    fake_lotus.settings = fake_settings
    fake_models = MagicMock()
    fake_models.LM = MagicMock(return_value="FAKE_LM")

    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    from services._lotus_worker import run_rank

    def boom(**_kw):
        raise RuntimeError("pipeline explosion")

    import pytest
    with pytest.raises(RuntimeError, match="pipeline explosion"):
        run_rank(
            lm_config={
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "sk-test",
                "api_base": None,
            },
            candidates=[{"id": "a", "match_text": "x"}],
            query_text="q",
            top_k=5,
            search_k=20,
            include_reasons=True,
            pipeline_fn=lambda **_: boom(),
        )

    # Two calls — configure(lm=LM) then configure(lm=None) in finally.
    assert len(configure_calls) == 2
    assert configure_calls[0].get("lm") is not None
    assert configure_calls[1].get("lm") is None
```

- [ ] **Step 2: Run and confirm FAIL**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
.venv/bin/pytest tests/test_semantic_operators.py::test_run_rank_configures_lotus_and_resets -v
```
Expected: FAIL with `ModuleNotFoundError: services._lotus_worker` or similar.

- [ ] **Step 3: Implement `services/_lotus_worker.py`**

Create the file with:

```python
"""LOTUS worker — runs inside a ProcessPoolExecutor subprocess.

Each subprocess has its OWN copy of `lotus.settings.lm` (module-level global),
so per-request `settings.configure(lm=...)` at entry + reset in `finally` is
safe across concurrent requests: no cross-tenant BYOK leakage possible.

The pool uses `mp_context=spawn` so torch / sentence-transformers / faiss
imports happen fresh in each subprocess (not inherited via fork, which
breaks CUDA context on Linux).
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

# Type alias — pipeline function signature.
PipelineFn = Callable[..., list[dict]]


def init_worker() -> None:
    """Warm-up called once per subprocess at pool creation.

    Imports torch / lotus eagerly so the first real rank request doesn't
    pay the 2-5s cold-start cost. Safe to call repeatedly (idempotent
    imports).
    """
    try:
        import lotus  # noqa: F401  (torch, sentence-transformers pulled transitively)
        from lotus.models import LM  # noqa: F401
        logger.info("lotus worker warmed up (pid=%s)", __import__("os").getpid())
    except Exception as exc:  # noqa: BLE001
        # A failed warm-up must not crash the pool — the first real request
        # will hit the same ImportError and can surface it cleanly.
        logger.warning("lotus worker warm-up failed (pid=%s): %s", __import__("os").getpid(), exc)


def run_rank(
    *,
    lm_config: dict[str, Any],
    candidates: list[dict],
    query_text: str,
    top_k: int,
    search_k: int,
    include_reasons: bool,
    pipeline_fn: Optional[PipelineFn] = None,
) -> list[dict]:
    """Execute one rank request inside this subprocess.

    Configures `lotus.settings.lm` with the caller's BYOK at entry; resets
    it to None in `finally` so the slot leaves the subprocess in a clean
    state even if the pipeline raises.

    `pipeline_fn` is a test seam — production callers leave it None and the
    real `_default_pipeline` is invoked.
    """
    import lotus  # noqa: F401  (re-imports are cheap after warm-up)
    from lotus.models import LM  # type: ignore

    lm_kwargs: dict[str, Any] = {
        "model": f"{lm_config['provider']}/{lm_config['model']}",
        "api_key": lm_config["api_key"],
        "max_batch_size": 5,
        "max_tokens": 4096,
    }
    api_base = lm_config.get("api_base")
    if api_base:
        lm_kwargs["api_base"] = api_base

    lotus.settings.configure(lm=LM(**lm_kwargs))
    try:
        fn = pipeline_fn or _default_pipeline
        return fn(
            candidates=candidates,
            query_text=query_text,
            top_k=top_k,
            search_k=search_k,
            include_reasons=include_reasons,
        )
    finally:
        lotus.settings.configure(lm=None)


def _default_pipeline(
    *,
    candidates: list[dict],
    query_text: str,
    top_k: int,
    search_k: int,
    include_reasons: bool,
) -> list[dict]:
    """Production rank pipeline. Runs inside the worker subprocess.

    Mirrors ``SemanticOperators._run_pipeline`` but uses the subprocess's
    own `lotus.settings` rather than the parent's. Kept here (not imported
    from services.semantic_operators) so the subprocess doesn't import the
    SemanticOperators class and its test seams — keeps the worker thin.
    """
    import os
    import pandas as pd  # type: ignore

    index_dir = os.getenv("LOTUS_INDEX_DIR", "/tmp/lotus_index")
    os.makedirs(index_dir, exist_ok=True)

    df = pd.DataFrame(candidates)
    df = df.sem_index("match_text", index_dir)
    shortlist_df = df.sem_search("match_text", query_text, K=search_k)
    shortlist = shortlist_df.to_dict("records")[:search_k]

    topk_instruction = (
        f"Given the following query:\n{query_text}\n\n"
        f"Rank the items by relevance to this query. "
        f"An item is more relevant if its {{match_text}} directly addresses, "
        f"provides insights into, or offers solutions for the query's needs."
    )
    ranked_df = pd.DataFrame(shortlist).sem_topk(topk_instruction, K=top_k)
    ranked = ranked_df.to_dict("records")[:top_k]

    if include_reasons:
        map_instruction = (
            f"Given the query:\n{query_text}\n\n"
            f"For the item described by: {{match_text}}\n\n"
            f"请用中文写出2-3句简洁的推荐理由，说明为什么该条目与查询相关。要具体说明。"
        )
        mapped_df = pd.DataFrame(ranked).sem_map(map_instruction, suffix="recommendation_reason")
        ranked = mapped_df.to_dict("records")
        for item in ranked:
            if not isinstance(item.get("recommendation_reason"), str) or not item["recommendation_reason"].strip():
                item["recommendation_reason"] = "相关匹配。"
    else:
        for item in ranked:
            item.pop("recommendation_reason", None)

    return ranked
```

- [ ] **Step 4: Run tests and confirm PASS**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
.venv/bin/pytest tests/test_semantic_operators.py -v
```
Expected: new tests pass; all pre-existing tests still pass.

- [ ] **Step 5: Commit**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool
git add apps/semops/services/_lotus_worker.py apps/semops/tests/test_semantic_operators.py
git commit -m "feat(semops): add isolated LOTUS worker entrypoint with per-request configure/reset"
```

---

## Task 2: Process-pool singleton with poisoned-worker recovery

**Files:**
- Create: `apps/semops/services/_pool.py`
- Modify: `apps/semops/tests/test_semantic_operators.py`

- [ ] **Step 1: Write failing test**

Append to `apps/semops/tests/test_semantic_operators.py`:

```python
def test_pool_rebuilds_after_worker_exception(monkeypatch):
    """A task that raises must not poison the pool — subsequent tasks see a fresh executor."""
    from services import _pool

    # Force a fresh test pool, not tied to the real module singleton.
    _pool.shutdown_pool()

    def boom():
        raise RuntimeError("worker exploded")

    def peace():
        return "ok"

    monkeypatch.setenv("SEMOPS_RANK_POOL_SIZE", "2")

    import pytest
    with pytest.raises(RuntimeError, match="worker exploded"):
        _pool.run_in_pool(boom)

    # Pool should have been rebuilt by the shim; a follow-up task succeeds.
    assert _pool.run_in_pool(peace) == "ok"

    _pool.shutdown_pool()
```

- [ ] **Step 2: Run and confirm FAIL**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
.venv/bin/pytest tests/test_semantic_operators.py::test_pool_rebuilds_after_worker_exception -v
```
Expected: FAIL (module `services._pool` doesn't exist yet).

- [ ] **Step 3: Implement `services/_pool.py`**

```python
"""Process-wide ProcessPoolExecutor for semops rank.

Singleton — one pool per FastAPI process, shared across all rank requests.
Uses `mp_context=spawn` to avoid fork-inheriting torch/CUDA state from the
parent. On any worker exception we shut down and rebuild the pool
(poisoned-worker recovery), because ProcessPoolExecutor does not evict a
worker that raised — the NEXT task would run in the same subprocess with
potentially corrupted `lotus.settings.lm`.
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
    # Import at use site to avoid a circular import if _lotus_worker ever
    # grows a dependency on _pool.
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
    """Submit `fn(*args, **kwargs)` to the pool and block on the result.

    On exception the pool is rebuilt before re-raising, so the next caller
    gets a fresh pool with no residual `lotus.settings.lm` state.
    """
    pool = get_pool()
    future = pool.submit(fn, *args, **kwargs)
    try:
        return future.result()
    except BaseException:
        # Poisoned-worker recovery: kill and rebuild the whole pool.
        # Losing a small number of in-flight futures is acceptable; leaving
        # a subprocess with stale `lotus.settings.lm` is not.
        logger.warning("semops rank task raised; rebuilding pool")
        shutdown_pool()
        raise


@atexit.register
def _shutdown_at_exit() -> None:
    shutdown_pool()
```

- [ ] **Step 4: Run tests and confirm PASS**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
.venv/bin/pytest tests/test_semantic_operators.py::test_pool_rebuilds_after_worker_exception -v
```
Expected: PASS. Running the full suite (`pytest -q`) must also be green.

- [ ] **Step 5: Commit**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool
git add apps/semops/services/_pool.py apps/semops/tests/test_semantic_operators.py
git commit -m "feat(semops): process-pool singleton with poisoned-worker recovery"
```

---

## Task 3: Rewire `SemanticOperators.rank` to use the pool; drop `_LOTUS_LOCK`

**Files:**
- Modify: `apps/semops/services/semantic_operators.py`

- [ ] **Step 1: Read the current file**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
wc -l services/semantic_operators.py
```
About 286 lines today.

- [ ] **Step 2: Apply edits**

Remove these blocks entirely:
- `import threading` (if no other usage)
- `_LOTUS_LOCK = threading.Lock()` and `_LAST_LM_KEY: Optional[tuple[str, ...]] = None`
- The entire `def _configure_lotus_lm(...)` function (now lives in `_lotus_worker.py`)

Change the module docstring's "Per-request LLM configuration" paragraph to describe the new architecture. Replace the old paragraph (lines ~7-20) with:

```
Per-request LLM configuration
-----------------------------
LOTUS uses a module-level ``lotus.settings.lm`` global that is NOT
safe to share across concurrent requests with different BYOK tuples. To
give every request its own isolated global, real-LOTUS calls run inside a
``ProcessPoolExecutor`` (spawn context) — each subprocess has its own
``lotus.settings`` module. The worker configures the LM at entry and
resets it in ``finally``, so BYOK credentials never leak across tenants.

Tests with injected search_fn / topk_fn / map_fn stubs bypass the pool
entirely — the DI path runs in-process with no LOTUS imports required.
```

Replace the entire `rank()` method body (the part that currently branches on `need_real_lotus and not os.getenv("PYTEST_CURRENT_TEST")` and uses `with _LOTUS_LOCK`) with:

```python
        if not candidates:
            raise ValueError("candidates must be a non-empty list")

        need_real_lotus = (
            self._search_fn is None
            or self._topk_fn is None
            or (include_reasons and self._map_fn is None)
        )

        # Tests that inject all three fns bypass the pool entirely — no
        # LOTUS imports, no subprocess cost. This is also the path pytest
        # takes automatically via the PYTEST_CURRENT_TEST env check below.
        if not need_real_lotus or os.getenv("PYTEST_CURRENT_TEST"):
            return self._run_pipeline(
                candidates=candidates,
                query_text=query_text,
                top_k=top_k,
                search_k=search_k,
                include_reasons=include_reasons,
            )

        if not lm_config:
            raise ValueError(
                "lm_config is required when real-LOTUS operators are used. "
                "Callers must pass {provider, model, api_key, api_base?}."
            )

        # Dispatch to the worker pool. Each subprocess has its own
        # `lotus.settings.lm`; no lock needed, no cross-tenant leakage.
        from services._lotus_worker import run_rank
        from services._pool import run_in_pool

        return run_in_pool(
            run_rank,
            lm_config=lm_config,
            candidates=candidates,
            query_text=query_text,
            top_k=top_k,
            search_k=search_k,
            include_reasons=include_reasons,
        )
```

Leave `_run_pipeline`, `_default_search_fn`, `_default_topk_fn`, `_default_map_fn`, `_build_indexed_df`, `_ensure_reason`, `_strip_reason` unchanged — they're still used by the DI / test path.

- [ ] **Step 3: Run all tests**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
.venv/bin/pytest -q
```
Expected: all tests pass. The pre-existing `test_semantic_operators.py` tests use injected fns → the new short-circuit path. No subprocess is spawned.

- [ ] **Step 4: Confirm dead code is actually gone**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
grep -n "_LOTUS_LOCK\|_LAST_LM_KEY\|_configure_lotus_lm" services/
```
Expected: no hits anywhere under `services/`.

- [ ] **Step 5: Commit**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool
git add apps/semops/services/semantic_operators.py
git commit -m "feat(semops): drop _LOTUS_LOCK; rank() dispatches to process pool"
```

---

## Task 4: FastAPI lifespan — warm up pool on startup, shut down on exit

**Files:**
- Modify: `apps/semops/api/main.py`
- Modify: `apps/semops/.env.example`

- [ ] **Step 1: Read current `api/main.py`**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
cat api/main.py
```

Take note of whether it already uses FastAPI's `lifespan` param on the `FastAPI(...)` constructor. If yes, append to the existing lifespan; if no, introduce one.

- [ ] **Step 2: Add lifespan hook**

At the top of `apps/semops/api/main.py`, add:

```python
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI  # (keep the existing import)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """Warm up the LOTUS rank pool at startup; shut it down cleanly at exit."""
    from services._pool import get_pool, shutdown_pool

    try:
        get_pool()  # Triggers init_worker() in each subprocess.
        logger.info("semops lifespan: rank pool warmed up")
    except Exception as exc:  # noqa: BLE001
        logger.warning("semops lifespan: pool warm-up failed: %s", exc)
    try:
        yield
    finally:
        shutdown_pool()
        logger.info("semops lifespan: rank pool shut down")
```

Then modify the `FastAPI(...)` constructor to accept `lifespan=_lifespan`. If the app already had a lifespan, merge both — run pool warm-up after any existing startup and pool shutdown before any existing teardown. Preserve all other constructor args (title, description, version, etc.).

Important: pytest's `TestClient` does NOT run the full lifespan by default (only with the right fixture), and the app-level import should not trigger a pool build. The `get_pool()` call is lazy — it won't build until the first real rank, which is what we want for test import time.

- [ ] **Step 3: Add the env var doc**

Append to `apps/semops/.env.example`:

```
# LOTUS rank worker pool.
# Number of subprocesses available to serve /api/operators/rank in parallel.
# Each subprocess imports torch/sentence-transformers/faiss at startup
# (~2-5s cold start), so set this at or below CPU count.
SEMOPS_RANK_POOL_SIZE=4
```

If the file doesn't exist, create it with at minimum the line above + a comment header.

- [ ] **Step 4: Run tests**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
.venv/bin/pytest -q
```
Expected: all pass. The API route tests use TestClient without lifespan → pool isn't spawned.

- [ ] **Step 5: Commit**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool
git add apps/semops/api/main.py apps/semops/.env.example
git commit -m "feat(semops): FastAPI lifespan warms up and tears down rank pool"
```

---

## Task 5: Final verification + PR

- [ ] **Step 1: Grep for residual lock references**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool
grep -rn "_LOTUS_LOCK\|_LAST_LM_KEY\|_configure_lotus_lm" apps/semops/
```
Expected: no hits.

- [ ] **Step 2: Full test run**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
.venv/bin/pytest -q
```
Expected: all green.

- [ ] **Step 3: Quick import smoke**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool/apps/semops
.venv/bin/python -c "from services._lotus_worker import run_rank, init_worker; from services._pool import get_pool, shutdown_pool, run_in_pool; print('imports ok')"
```
Expected: `imports ok` with no errors.

- [ ] **Step 4: Push + open PR**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/semops-process-pool
git push -u origin refactor/semops-process-pool
gh pr create --title "feat(semops): parallel rank via ProcessPoolExecutor (PR-B)" --body "..."
```
PR body should reference the spec at `docs/superpowers/specs/2026-04-24-task-parallelization-design.md` and explain:
- Removes `_LOTUS_LOCK` global serialization.
- N-way parallel `/api/operators/rank` via ProcessPoolExecutor (spawn context).
- Each subprocess owns its own `lotus.settings.lm` — no cross-tenant BYOK leakage.
- Poisoned-worker recovery rebuilds the pool on task exception.
- FastAPI lifespan warms up workers at startup.
- New env var: `SEMOPS_RANK_POOL_SIZE`.

---

## Out of scope (follow-ups)

- **Async rank API.** `SemanticOperators.rank()` is still sync; the FastAPI handler wraps `.submit().result()` under the hood. Converting to `asyncio.wrap_future` for non-blocking handlers is a separate PR.
- **Per-user semops queue / backpressure.** Runs under HTTP request lifecycle; if latency becomes a problem, add a BullMQ / ARQ layer upstream.
- **Warm-up at pool creation is best-effort** — a failed import in `init_worker` logs a warning but doesn't crash the pool. The first real rank will surface the error with full context.
