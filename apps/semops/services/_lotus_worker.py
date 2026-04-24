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

PipelineFn = Callable[..., list[dict]]


def init_worker() -> None:
    """Warm-up called once per subprocess at pool creation.

    Imports lotus (which pulls torch / sentence-transformers / faiss) eagerly
    so the first real rank request doesn't pay the 2-5s cold-start cost.
    Safe to call repeatedly (idempotent imports).
    """
    import os

    try:
        import lotus  # noqa: F401
        from lotus.models import LM  # noqa: F401
        logger.info("lotus worker warmed up (pid=%s)", os.getpid())
    except Exception as exc:  # noqa: BLE001
        # A failed warm-up must not crash the pool — the first real request
        # will hit the same ImportError and can surface it cleanly.
        logger.warning("lotus worker warm-up failed (pid=%s): %s", os.getpid(), exc)


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
    it to None in `finally` so the subprocess leaves in a clean state even
    if the pipeline raises.

    `pipeline_fn` is a test seam — production callers leave it None and the
    real `_default_pipeline` is invoked.
    """
    import lotus  # type: ignore
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
        # The reset itself can theoretically raise if lotus state is corrupt.
        # Swallow + log so the worker leaves in as clean a state as possible
        # and the original exception (if any) still propagates.
        try:
            lotus.settings.configure(lm=None)
        except Exception as reset_exc:  # noqa: BLE001
            import os as _os
            logger.error(
                "lotus.settings.configure(lm=None) raised during reset (pid=%s): %s",
                _os.getpid(),
                reset_exc,
            )


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
    from services.semantic_operators) so the subprocess stays thin.
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
