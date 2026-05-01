"""Semantic operators: a thin wrapper around the LOTUS rank pipeline.

Exposes a single module-level ``rank()`` function that always dispatches the
real LOTUS pipeline (sem_search / sem_topk / sem_map) into the per-process
``ProcessPoolExecutor`` pool. Each subprocess owns its own
``lotus.settings.lm`` module global and configures it per-request from the
caller's BYOK ``lm_config`` — no cross-tenant leakage possible.

There is no in-process LOTUS path. The pool is the production path; tests
exercise it via ``services._lotus_worker._default_pipeline`` monkeypatching
or the FastAPI route directly.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)


def rank(
    *,
    candidates: list[dict],
    query_text: str,
    top_k: int = 50,
    search_k: int = 350,
    include_reasons: bool = True,
    lm_config: Optional[dict[str, Any]] = None,
) -> list[dict]:
    """Rank ``candidates`` by relevance to ``query_text``.

    Pipeline (runs inside a ProcessPoolExecutor subprocess):
        1. sem_search(candidates, query_text, K=search_k)  — embedding pre-filter
        2. sem_topk(shortlist, query_text, K=top_k)        — LLM rerank
        3. sem_map(topk, query_text)                       — optional reasons

    ``lm_config`` is the per-request LOTUS LM configuration dict with keys
    ``provider``, ``model``, ``api_key``, optional ``api_base``. Required —
    there is no admin/env fallback for user-facing calls.

    Returns up to ``top_k`` dicts, each preserving the input fields
    (``id``, ``match_text``, ...) and — when ``include_reasons`` — a
    non-empty ``recommendation_reason`` string. Empty ``candidates``
    raises ``ValueError``.
    """
    if not candidates:
        raise ValueError("candidates must be a non-empty list")

    if not lm_config:
        raise ValueError(
            "lm_config is required. "
            "Callers must pass {provider, model, api_key, api_base?}."
        )

    # Dispatch to the worker pool. Each subprocess has its own
    # lotus.settings.lm; no lock needed, no cross-tenant leakage.
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
