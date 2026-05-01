"""
LOTUS Matcher Service (workflow layer)

Wraps LOTUS-based semantic matching by delegating the heavy operator work
(sem_search → sem_topk → sem_map) to the semops service via HTTP POST to
``${SEMOPS_API_URL}/api/operators/rank``.

Local responsibilities:
- Build the ``match_text`` column used as the semantic field.
- Serialise candidates to dicts and POST to semops.
- Deserialise the ranked results back to a DataFrame.

The ``configure`` / LM initialisation that was previously here now lives
entirely in the semops service — this module no longer imports lotus directly.
"""

import json
import logging
import os
from typing import Callable

import httpx
import pandas as pd

logger = logging.getLogger(__name__)

SEMOPS_API_URL = os.getenv("SEMOPS_API_URL", "http://localhost:2025")

# Each rank call inside semops runs sem_search + sem_topk (LM Quicksort) +
# sem_map (LM Mapping). On CPU with the Quicksort comparisons happening in
# multiple LM batches, a single rank takes ~30-60 s. Multiple BUs serialize
# through the ProcessPool, so a 3-BU job easily exceeds the previous 120 s
# httpx timeout. Default to 20 minutes; ops can extend via env var for
# very large candidate sets.
SEMOPS_RANK_TIMEOUT = float(os.getenv("SEMOPS_RANK_TIMEOUT", "1200"))


def build_text_column(
    df: pd.DataFrame,
    target_type: str,
) -> pd.DataFrame:
    """
    Build combined text column for semantic indexing.

    Args:
        df: DataFrame with session/publication data
        target_type: 'SESSION' or 'PUBLICATION'

    Returns:
        DataFrame with 'match_text' column added
    """
    if target_type == "SESSION":
        df = df.copy()
        df["match_text"] = df.apply(
            lambda r: (
                f"Title: {_safe_str(r.get('title'))} | "
                f"Type: {_safe_str(r.get('type'))} | "
                f"Abstract: {_truncate(_safe_str(r.get('abstract')), 500)} | "
                f"Topics: {_safe_str(r.get('topic'))} | "
                f"Speakers: {_safe_str(r.get('speaker'))} | "
                f"Affiliation: {_safe_str(r.get('affiliation'))} | "
                f"Technologies: {_safe_str(r.get('technology'))}"
            ),
            axis=1,
        )
    else:  # PUBLICATION
        df = df.copy()
        df["match_text"] = df.apply(
            lambda r: (
                f"Title: {_safe_str(r.get('title'))} | "
                f"Authors: {_safe_str(r.get('authors'))} | "
                f"Abstract: {_truncate(_safe_str(r.get('abstract')), 500)} | "
                f"Keywords: {_safe_str(r.get('keywords'))} | "
                f"Research Topic: {_safe_str(r.get('research_topic'))} | "
                f"Affiliations: {_safe_str(r.get('affiliations'))}"
            ),
            axis=1,
        )
    return df


def rank_via_semops(
    *,
    df: pd.DataFrame,
    query_text: str,
    query_name: str,
    top_k: int = 50,
    search_k: int = 350,
    include_reasons: bool = True,
    model_provider: str,
    model_name: str,
    api_key: str,
    api_base: str | None = None,
    progress_callback: Callable[[int, str], None] | None = None,
) -> pd.DataFrame:
    """
    Run the full LOTUS matching pipeline via the semops HTTP endpoint.

    Sends candidates (with ``match_text`` already built) to
    ``POST ${SEMOPS_API_URL}/api/operators/rank`` and returns the ranked
    results as a DataFrame.

    Args:
        df: DataFrame with target data (must already have 'match_text' column)
        query_text: Query text to match against
        query_name: Name of the query (for logging)
        top_k: Final number of matches to return
        search_k: Embedding pre-filter size passed to semops
        include_reasons: Whether to generate recommendation reasons
        progress_callback: Callback for progress updates (percent, message)

    Returns:
        DataFrame with top_k matches and optional recommendation_reason column
    """
    logger.info(f"Running pipeline for query: {query_name}")
    logger.info(f"  Input: {len(df)} items, search_k={search_k}, top_k={top_k}")

    if progress_callback:
        progress_callback(10, "Sending candidates to semops for ranking...")

    # Replace NaN with None before serialization. pandas keeps empty
    # cells as float('nan'); the stdlib json encoder used by httpx
    # rejects NaN (strict JSON), so the request never reaches semops
    # and dies in build_request with
    # "Out of range float values are not JSON compliant: nan".
    #
    # df.where(df.notna(), None) is unreliable across pandas versions
    # (in 3.x None gets coerced back to NaN on numeric/object columns).
    # pd.DataFrame.to_json natively converts NaN -> null, so round-
    # tripping through to_json + json.loads guarantees a clean payload.
    candidates = json.loads(df.to_json(orient="records"))

    ranked_records = _rank_via_semops(
        candidates=candidates,
        query_text=query_text,
        top_k=top_k,
        search_k=search_k,
        include_reasons=include_reasons,
        model_provider=model_provider,
        model_name=model_name,
        api_key=api_key,
        api_base=api_base,
    )

    if progress_callback:
        progress_callback(100, "Complete")

    return pd.DataFrame(ranked_records).reset_index(drop=True)


def _rank_via_semops(
    *,
    candidates: list[dict],
    query_text: str,
    top_k: int,
    search_k: int,
    include_reasons: bool,
    model_provider: str,
    model_name: str,
    api_key: str,
    api_base: str | None = None,
) -> list[dict]:
    """POST candidates to semops /api/operators/rank and return ranked results.

    ``api_key`` is required — semops has no admin/env fallback. The LM
    config is threaded through as ``lm_config`` on the request body and
    used per-request by semops to configure LOTUS.
    """
    lm_config: dict = {
        "provider": model_provider,
        "model": model_name,
        "api_key": api_key,
    }
    if api_base:
        lm_config["api_base"] = api_base

    with httpx.Client(timeout=SEMOPS_RANK_TIMEOUT) as client:
        resp = client.post(
            f"{SEMOPS_API_URL}/api/operators/rank",
            json={
                "candidates": candidates,
                "query_text": query_text,
                "top_k": top_k,
                "search_k": search_k,
                "include_reasons": include_reasons,
                "lm_config": lm_config,
            },
        )
        resp.raise_for_status()
        data = resp.json()
        # semops returns {"results": [...], "count": N}
        return data.get("results", [])


def _safe_str(val) -> str:
    """Convert value to string safely."""
    if val is None:
        return ""
    if isinstance(val, list):
        return ", ".join(str(v) for v in val)
    return str(val)


def _truncate(text: str, max_chars: int = 500) -> str:
    """Truncate text to max_chars."""
    text = text or ""
    return text[:max_chars] + "..." if len(text) > max_chars else text
