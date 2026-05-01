"""
Query optimization service for matcher jobs.

Uses Gemini by default to merge overlapping queries within the same BU and
rewrite vague requests into clearer, more matchable search text.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

from google import genai

from workflows.matcher.translation import translate_to_english

logger = logging.getLogger(__name__)

# Default per-call timeout (seconds) for the Gemini optimizer. A stuck
# Gemini round-trip used to block its BU's optimize_bu worker indefinitely;
# now a worker that exceeds OPTIMIZER_GEMINI_TIMEOUT bails to the
# deterministic merge fallback instead of hanging the whole job.
_OPTIMIZER_GEMINI_TIMEOUT_DEFAULT = 60.0


def _gemini_timeout() -> float:
    """Read the per-call Gemini timeout from env, with a 60s default.

    Read at call time (not import time) so tests can monkeypatch the env
    var per-test without re-importing the module.
    """
    raw = os.getenv("OPTIMIZER_GEMINI_TIMEOUT")
    if not raw:
        return _OPTIMIZER_GEMINI_TIMEOUT_DEFAULT
    try:
        value = float(raw)
        if value <= 0:
            raise ValueError
        return value
    except (TypeError, ValueError):
        logger.warning(
            "Invalid OPTIMIZER_GEMINI_TIMEOUT=%r — falling back to %ss default.",
            raw,
            _OPTIMIZER_GEMINI_TIMEOUT_DEFAULT,
        )
        return _OPTIMIZER_GEMINI_TIMEOUT_DEFAULT

OPTIMIZER_SYSTEM_PROMPT = """
You optimize search queries for semantic matching.

Rewrite the input so it is clearer, less redundant, and easier to match.
Keep the original meaning unchanged.
If multiple query lines overlap, merge them naturally into a coherent query.
Return only the optimized query text with no explanation.
"""

OPTIMIZER_USER_PROMPT_TEMPLATE = """
Target type: {target_type}

Original queries:
{queries}

Optimize the query for matching while preserving the original intent.
"""


@dataclass(slots=True)
class QueryOptimizationResult:
    """Normalized optimization output for one BU."""

    optimized_query_native: str
    optimized_query_en: str
    source_queries: list[str]
    focuses: list[str] = field(default_factory=list)
    used_llm: bool = False


def optimize_queries(
    *,
    bu: str,
    queries: list[str],
    target_type: str,
    model_provider: str = "google",
    model_name: str = "gemini-2.5-flash",
    api_key: str | None = None,
    api_base: str | None = None,
) -> QueryOptimizationResult:
    """Optimize all queries for one BU into a single clearer query.

    Returns a deterministic-merge fallback if the BYOK key is missing or the
    provider is unsupported (only Google Gemini is currently wired up for
    LLM-based optimization).
    """
    normalized_queries = _dedupe_queries(queries)
    fallback_native = _build_fallback_query(normalized_queries)

    if not normalized_queries:
        return QueryOptimizationResult(
            optimized_query_native="",
            optimized_query_en="",
            source_queries=[],
        )

    # BYOK only — no env fallback. Non-Google providers are not supported
    # for LLM-based optimization yet; fall back to deterministic merge.
    effective_api_key: str | None = api_key
    if model_provider != "google":
        if api_key:
            logger.warning(
                "Query optimizer only supports Google Gemini. "
                f"Provider '{model_provider}' will use deterministic merge."
            )
        effective_api_key = None
    elif not api_key:
        logger.warning(
            "Google provider selected but no BYOK key provided; "
            "query optimizer will fall back to deterministic merge."
        )

    if not effective_api_key:
        logger.warning(
            "Query optimizer has no GOOGLE_API_KEY configured. "
            "Falling back to deterministic query merge."
        )
        return _fallback_result(normalized_queries, fallback_native)

    try:
        # google-genai HttpOptions.timeout is in milliseconds. Bound the
        # per-call wait so a stuck Gemini doesn't hang the BU's worker.
        # Setting it on the client (not the request) covers connect + read.
        timeout_seconds = _gemini_timeout()
        http_options = genai.types.HttpOptions(timeout=int(timeout_seconds * 1000))
        client = genai.Client(api_key=effective_api_key, http_options=http_options)
        prompt = OPTIMIZER_USER_PROMPT_TEMPLATE.format(
            target_type=target_type,
            queries="\n".join(
                f"{index}. {query}" for index, query in enumerate(normalized_queries, start=1)
            ),
        )
        response = client.models.generate_content(
            model=model_name,
            contents=f"{OPTIMIZER_SYSTEM_PROMPT.strip()}\n\n{prompt.strip()}",
        )
        optimized_native = (response.text or "").strip()
        if not optimized_native:
            logger.warning(
                "Query optimization returned no text for BU '%s'. Falling back to deterministic merge.",
                bu,
            )
            return _fallback_result(normalized_queries, fallback_native)

        # Translation is BYOK-OpenAI-shaped; the Gemini key + model_name
        # used above don't satisfy the OpenAI contract, so translation
        # currently no-ops (returns the input). Wire-through is preserved
        # so a future caller can pass an OpenAI-compatible BYOK key here.
        optimized_en = translate_to_english(
            optimized_native, model_name=None, api_key=None
        )

        return QueryOptimizationResult(
            optimized_query_native=optimized_native,
            optimized_query_en=optimized_en,
            source_queries=normalized_queries,
            used_llm=True,
        )
    except Exception as exc:
        # Catch every Exception (incl. httpx ReadTimeout / google.api_core
        # timeouts / connection errors) so a single stuck Gemini call falls
        # back to the deterministic merge for that BU instead of failing
        # the whole job. The other BUs continue in their own Send workers.
        logger.warning(
            "Query optimization failed for BU '%s': %s. Falling back to deterministic merge.",
            bu,
            exc,
        )
        return _fallback_result(normalized_queries, fallback_native)


def _fallback_result(
    queries: list[str],
    fallback_native: str,
) -> QueryOptimizationResult:
    optimized_en = translate_to_english(fallback_native, model_name=None, api_key=None)
    return QueryOptimizationResult(
        optimized_query_native=fallback_native,
        optimized_query_en=optimized_en,
        source_queries=queries,
        used_llm=False,
    )


def _dedupe_queries(queries: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()

    for raw_query in queries:
        query = " ".join(str(raw_query).split()).strip()
        if not query:
            continue

        key = query.casefold()
        if key in seen:
            continue

        seen.add(key)
        deduped.append(query)

    return deduped


def _build_fallback_query(queries: list[str]) -> str:
    if not queries:
        return ""
    if len(queries) == 1:
        return queries[0]
    return "\n".join(f"{index}. {query}" for index, query in enumerate(queries, start=1))
