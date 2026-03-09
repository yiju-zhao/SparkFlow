"""
Query optimization service for matcher jobs.

Uses an OpenAI model to merge overlapping queries within the same BU and
rewrite vague requests into clearer, more matchable search text.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field

from openai import OpenAI
from pydantic import BaseModel, Field

from services.excel_processor import ExcelProcessor

logger = logging.getLogger(__name__)

OPTIMIZER_SYSTEM_PROMPT = """
You optimize enterprise search queries for semantic matching.

Your job for each business unit (BU):
1. Merge overlapping or duplicated queries into a smaller set of distinct semantic intents.
2. Rewrite vague wording into concrete, searchable descriptions that improve matching quality.
3. Preserve the original business intent. Do not invent hard requirements that are not implied.
4. Organize the result into 2-6 relatively independent semantic lines when multiple topics exist.
5. Produce final search text optimized for semantic matching against conference sessions or publications.
"""

OPTIMIZER_USER_PROMPT_TEMPLATE = """
Target type: {target_type}
Business unit: {bu}

Original queries:
{queries}

Return a structured optimization result. Merge similar intents, remove redundancy, and make vague points more specific while preserving the original business intent.
"""


class QueryOptimizationResponse(BaseModel):
    """Structured output schema for query optimization."""

    optimized_query_native: str = Field(
        description="Structured query text in the user's original language when possible."
    )
    optimized_query_en: str = Field(
        description="English search text optimized for semantic matching."
    )
    focuses: list[str] = Field(
        description="Short, relatively independent semantic focuses covered by the optimized query."
    )


@dataclass(slots=True)
class QueryOptimizationResult:
    """Normalized optimization output for one BU."""

    optimized_query_native: str
    optimized_query_en: str
    source_queries: list[str]
    focuses: list[str] = field(default_factory=list)
    used_llm: bool = False


class QueryOptimizer:
    """Optimize grouped BU queries with an OpenAI model."""

    def __init__(self, excel_processor: ExcelProcessor | None = None):
        self.excel_processor = excel_processor or ExcelProcessor()
        self.enabled = (
            os.getenv("ENABLE_MATCHER_QUERY_OPTIMIZER", "true").lower() == "true"
        )
        self.model = os.getenv(
            "MATCHER_QUERY_OPTIMIZER_MODEL", "gpt-4o-2024-08-06"
        )
        self.api_key = self._resolve_api_key()
        self._client: OpenAI | None = None

    def optimize_queries(
        self,
        bu: str,
        queries: list[str],
        target_type: str,
    ) -> QueryOptimizationResult:
        """Optimize all queries for one BU into a single structured query."""
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
                "Query optimizer is enabled but no OpenAI API key is configured. "
                "Falling back to deterministic query merge."
            )
            return self._fallback_result(normalized_queries, fallback_native)

        try:
            client = self._get_client()
            prompt = OPTIMIZER_USER_PROMPT_TEMPLATE.format(
                target_type=target_type,
                bu=bu,
                queries="\n".join(
                    f"{index}. {query}"
                    for index, query in enumerate(normalized_queries, start=1)
                ),
            )
            response = client.responses.parse(
                model=self.model,
                input=[
                    {"role": "system", "content": OPTIMIZER_SYSTEM_PROMPT.strip()},
                    {"role": "user", "content": prompt.strip()},
                ],
                text_format=QueryOptimizationResponse,
            )
            parsed = response.output_parsed
            if not parsed:
                refusal = self._extract_refusal(response)
                if refusal:
                    logger.warning(
                        "Query optimization refused for BU '%s': %s. Falling back to deterministic merge.",
                        bu,
                        refusal,
                    )
                else:
                    logger.warning(
                        "Query optimization returned no parsed payload for BU '%s'. Falling back to deterministic merge.",
                        bu,
                    )
                return self._fallback_result(normalized_queries, fallback_native)

            optimized_native = parsed.optimized_query_native.strip()
            optimized_en = parsed.optimized_query_en.strip()
            focuses = [item.strip() for item in parsed.focuses if item.strip()]

            if not optimized_native:
                optimized_native = fallback_native

            if not optimized_en:
                optimized_en = self.excel_processor._translate_to_english(
                    optimized_native
                )

            return QueryOptimizationResult(
                optimized_query_native=optimized_native,
                optimized_query_en=optimized_en,
                source_queries=normalized_queries,
                focuses=focuses,
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

    def _get_client(self) -> OpenAI:
        if self._client is None:
            self._client = OpenAI(api_key=self.api_key)
        return self._client

    @staticmethod
    def _resolve_api_key() -> str | None:
        dedicated_key = os.getenv("MATCHER_QUERY_OPTIMIZER_API_KEY")
        if dedicated_key:
            return dedicated_key

        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key and openai_key != "not-needed":
            return openai_key

        return None

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

    @staticmethod
    def _extract_refusal(response) -> str | None:
        for output in getattr(response, "output", []) or []:
            if getattr(output, "type", None) != "message":
                continue
            for item in getattr(output, "content", []) or []:
                if getattr(item, "type", None) == "refusal":
                    refusal = getattr(item, "refusal", None)
                    if refusal:
                        return str(refusal)
        return None
