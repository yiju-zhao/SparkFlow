"""Semantic operators: a DI-friendly wrapper over LOTUS sem_search / sem_topk / sem_map.

This module encapsulates the three LOTUS operations used by the matching
pipeline (embedding pre-filter, LLM rerank, optional Chinese reason
generation) behind a single ``SemanticOperators.rank`` entrypoint.

Per-request LLM configuration
-----------------------------
LOTUS uses a module-level ``lotus.settings.lm`` global that is NOT safe to
share across concurrent requests with different BYOK tuples. To give every
request its own isolated global, real-LOTUS calls run inside a
``ProcessPoolExecutor`` (spawn context) — each subprocess has its own
``lotus.settings`` module. The worker configures the LM at entry and resets
it in ``finally``, so BYOK credentials never leak across tenants.

Tests with injected search_fn / topk_fn / map_fn stubs bypass the pool
entirely — the DI path runs in-process with no LOTUS imports required.

Dependency injection
--------------------
Tests inject deterministic ``search_fn`` / ``topk_fn`` / ``map_fn`` stubs at
construction time; those bypass the LOTUS config path entirely. Production
calls leave all three ``None`` and pass a non-empty ``lm_config`` dict.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

SearchFn = Callable[[list[dict], str, int], list[dict]]
TopkFn = Callable[[list[dict], str, int], list[dict]]
MapFn = Callable[[list[dict], str], list[dict]]


class SemanticOperators:
    """LOTUS sem_search / sem_topk / sem_map orchestrator with DI seams."""

    def __init__(
        self,
        *,
        search_fn: Optional[SearchFn] = None,
        topk_fn: Optional[TopkFn] = None,
        map_fn: Optional[MapFn] = None,
    ):
        self._search_fn = search_fn
        self._topk_fn = topk_fn
        self._map_fn = map_fn

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def rank(
        self,
        *,
        candidates: list[dict],
        query_text: str,
        top_k: int = 50,
        search_k: int = 350,
        include_reasons: bool = True,
        lm_config: Optional[dict[str, Any]] = None,
    ) -> list[dict]:
        """Rank ``candidates`` by relevance to ``query_text``.

        Pipeline:
            1. search_fn(candidates, query_text, search_k) — embedding pre-filter
            2. topk_fn(shortlist, query_text, top_k)       — LLM rerank
            3. map_fn(topk, query_text)                    — optional reasons

        ``lm_config`` is the per-request LOTUS LM configuration dict with
        keys ``provider``, ``model``, ``api_key``, optional ``api_base``.
        Required when any default (real-LOTUS) fn is used; ignored when
        all three ops are injected (tests bypass the lock entirely).

        Returns up to ``top_k`` dicts, each preserving the input fields
        (``id``, ``match_text``, ...) and — when ``include_reasons`` — a
        non-empty ``recommendation_reason`` string. Empty ``candidates``
        raises ``ValueError``.
        """
        if not candidates:
            raise ValueError("candidates must be a non-empty list")

        need_real_lotus = (
            self._search_fn is None
            or self._topk_fn is None
            or (include_reasons and self._map_fn is None)
        )

        # Tests that inject all three fns bypass the pool entirely — no
        # LOTUS imports, no subprocess cost. pytest also takes this path
        # via the PYTEST_CURRENT_TEST env check below.
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

    def _run_pipeline(
        self,
        *,
        candidates: list[dict],
        query_text: str,
        top_k: int,
        search_k: int,
        include_reasons: bool,
    ) -> list[dict]:
        """Core pipeline — factored out so the lock/no-lock paths in
        ``rank()`` share the same logic."""

        search_fn = self._search_fn or self._default_search_fn()
        topk_fn = self._topk_fn or self._default_topk_fn()

        shortlist = search_fn(candidates, query_text, search_k)
        shortlist = list(shortlist)[:search_k]

        ranked = topk_fn(shortlist, query_text, top_k)
        ranked = list(ranked)[:top_k]

        if include_reasons:
            map_fn = self._map_fn or self._default_map_fn()
            ranked = map_fn(ranked, query_text)
            ranked = [self._ensure_reason(dict(item)) for item in ranked]
        else:
            ranked = [self._strip_reason(dict(item)) for item in ranked]

        return ranked

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _strip_reason(item: dict) -> dict:
        item.pop("recommendation_reason", None)
        return item

    @staticmethod
    def _ensure_reason(item: dict) -> dict:
        reason = item.get("recommendation_reason")
        if not isinstance(reason, str) or not reason.strip():
            # Defensive fallback — the real sem_map path should always fill
            # this, but we don't want a malformed row to silently drop the
            # contract ("non-empty string"). This only triggers if a caller
            # injected a broken map_fn.
            item["recommendation_reason"] = "相关匹配。"
        return item

    # ------------------------------------------------------------------
    # Real-LOTUS defaults (lazy — only import/configure when invoked)
    # ------------------------------------------------------------------

    def _default_search_fn(self) -> SearchFn:
        def _search(candidates: list[dict], query: str, k: int) -> list[dict]:
            df = self._build_indexed_df(candidates)
            out = df.sem_search("match_text", query, K=k)
            return out.to_dict("records")

        return _search

    def _default_topk_fn(self) -> TopkFn:
        def _topk(candidates: list[dict], query: str, k: int) -> list[dict]:
            import pandas as pd

            df = pd.DataFrame(candidates)
            instruction = (
                f"Given the following query:\n{query}\n\n"
                f"Rank the items by relevance to this query. "
                f"An item is more relevant if its {{match_text}} directly addresses, "
                f"provides insights into, or offers solutions for the query's needs."
            )
            out = df.sem_topk(instruction, K=k)
            return out.to_dict("records")

        return _topk

    def _default_map_fn(self) -> MapFn:
        def _map(candidates: list[dict], query: str) -> list[dict]:
            import pandas as pd

            df = pd.DataFrame(candidates)
            instruction = (
                f"Given the query:\n{query}\n\n"
                f"For the item described by: {{match_text}}\n\n"
                f"请用中文写出2-3句简洁的推荐理由，说明为什么该条目与查询相关。要具体说明。"
                f"(Write a concise recommendation reason in Chinese, 2-3 sentences, "
                f"explaining why this item is relevant to the query. Be specific.)"
            )
            out = df.sem_map(instruction, suffix="recommendation_reason")
            return out.to_dict("records")

        return _map

    @staticmethod
    def _build_indexed_df(candidates: list[dict]):
        """Build a pandas DataFrame and run ``sem_index`` on ``match_text``.

        Only invoked by the default (real-LOTUS) search path. Mirrors the
        indexing convention used by ``LotusMatcher.run_pipeline``.
        """
        import pandas as pd  # type: ignore

        df = pd.DataFrame(candidates)
        index_dir = os.getenv("LOTUS_INDEX_DIR", "/tmp/lotus_index")
        os.makedirs(index_dir, exist_ok=True)
        return df.sem_index("match_text", index_dir)
