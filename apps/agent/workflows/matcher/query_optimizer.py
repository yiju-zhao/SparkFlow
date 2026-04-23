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

from workflows.matcher.excel_processor import ExcelProcessor

logger = logging.getLogger(__name__)

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


class QueryOptimizer:
    """Optimize grouped BU queries with Gemini."""

    def __init__(
        self,
        excel_processor: ExcelProcessor | None = None,
        model_provider: str = "google",
        model_name: str = "gemini-2.5-flash",
        api_key: str | None = None,
        api_base: str | None = None,
    ):
        self.excel_processor = excel_processor or ExcelProcessor()
        self.enabled = (
            os.getenv("ENABLE_MATCHER_QUERY_OPTIMIZER", "true").lower() == "true"
        )
        self.model_provider = model_provider
        self.model_name = model_name
        self.api_base = api_base
        self._client: genai.Client | None = None

        # BYOK only — no env fallback. If the caller wanted query
        # optimization they must pass an api_key for a supported provider.
        if model_provider == "google" and api_key:
            self.api_key = api_key
        else:
            # Non-Google providers are not supported for LLM-based
            # optimization yet; the matcher falls back to deterministic
            # merge, which doesn't need a key.
            self.api_key = None
            if model_provider != "google":
                logger.warning(
                    "Query optimizer only supports Google Gemini. "
                    f"Provider '{model_provider}' will use deterministic merge."
                )
            elif not api_key:
                logger.warning(
                    "Google provider selected but no BYOK key provided; "
                    "query optimizer will fall back to deterministic merge."
                )

    def optimize_queries(
        self,
        bu: str,
        queries: list[str],
        target_type: str,
    ) -> QueryOptimizationResult:
        """Optimize all queries for one BU into a single clearer query."""
        normalized_queries = self._dedupe_queries(queries)
        fallback_native = self._build_fallback_query(normalized_queries)

        if not normalized_queries:
            return QueryOptimizationResult(
                optimized_query_native="",
                optimized_query_en="",
                source_queries=[],
            )

        if not self.enabled:
            return self._fallback_result(normalized_queries, fallback_native)

        if not self.api_key:
            logger.warning(
                "Query optimizer is enabled but no GOOGLE_API_KEY is configured. "
                "Falling back to deterministic query merge."
            )
            return self._fallback_result(normalized_queries, fallback_native)

        try:
            client = self._get_client()
            prompt = OPTIMIZER_USER_PROMPT_TEMPLATE.format(
                target_type=target_type,
                queries="\n".join(
                    f"{index}. {query}"
                    for index, query in enumerate(normalized_queries, start=1)
                ),
            )
            response = client.models.generate_content(
                model=self.model_name,
                contents=f"{OPTIMIZER_SYSTEM_PROMPT.strip()}\n\n{prompt.strip()}",
            )
            optimized_native = (response.text or "").strip()
            if not optimized_native:
                logger.warning(
                    "Query optimization returned no text for BU '%s'. Falling back to deterministic merge.",
                    bu,
                )
                return self._fallback_result(normalized_queries, fallback_native)

            if not optimized_native:
                optimized_native = fallback_native

            optimized_en = self.excel_processor._translate_to_english(optimized_native)

            return QueryOptimizationResult(
                optimized_query_native=optimized_native,
                optimized_query_en=optimized_en,
                source_queries=normalized_queries,
                used_llm=True,
            )
        except Exception as exc:
            logger.warning(
                "Query optimization failed for BU '%s': %s. Falling back to deterministic merge.",
                bu,
                exc,
            )
            return self._fallback_result(normalized_queries, fallback_native)

    def _fallback_result(
        self,
        queries: list[str],
        fallback_native: str,
    ) -> QueryOptimizationResult:
        optimized_en = self.excel_processor._translate_to_english(fallback_native)
        return QueryOptimizationResult(
            optimized_query_native=fallback_native,
            optimized_query_en=optimized_en,
            source_queries=queries,
            used_llm=False,
        )

    def _get_client(self) -> genai.Client:
        if self._client is None:
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    @staticmethod
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

    @staticmethod
    def _build_fallback_query(queries: list[str]) -> str:
        if not queries:
            return ""
        if len(queries) == 1:
            return queries[0]
        return "\n".join(
            f"{index}. {query}" for index, query in enumerate(queries, start=1)
        )
