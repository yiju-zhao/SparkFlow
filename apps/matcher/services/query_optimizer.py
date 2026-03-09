"""
Query optimization service for matcher jobs.

Uses an OpenAI model to merge overlapping queries within the same BU and
rewrite vague requests into clearer, more matchable search text.
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass, field

from openai import OpenAI

from services.excel_processor import ExcelProcessor

logger = logging.getLogger(__name__)

_JSON_BLOCK_RE = re.compile(r"\{.*\}", re.DOTALL)

OPTIMIZER_SYSTEM_PROMPT = """
You optimize enterprise search queries for semantic matching.

Your job for each business unit (BU):
1. Merge overlapping or duplicated queries into a smaller set of distinct semantic intents.
2. Rewrite vague wording into concrete, searchable descriptions that improve matching quality.
3. Preserve the original business intent. Do not invent hard requirements that are not implied.
4. Organize the result into 2-6 relatively independent semantic lines when multiple topics exist.
5. Produce final search text optimized for semantic matching against conference sessions or publications.

Return valid JSON only with this schema:
{
  "optimized_query_native": "structured text in the user's original language when possible",
  "optimized_query_en": "structured English text for semantic matching",
  "focuses": ["short focus 1", "short focus 2"]
}
"""

OPTIMIZER_USER_PROMPT_TEMPLATE = """
Target type: {target_type}
Business unit: {bu}

Original queries:
{queries}

Please merge similar intents, remove redundancy, make vague points more specific, and return the optimized result as JSON only.
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
    """Optimize grouped BU queries with an OpenAI model."""

    def __init__(self, excel_processor: ExcelProcessor | None = None):
        self.excel_processor = excel_processor or ExcelProcessor()
        self.enabled = (
            os.getenv("ENABLE_MATCHER_QUERY_OPTIMIZER", "true").lower() == "true"
        )
        self.model = os.getenv("MATCHER_QUERY_OPTIMIZER_MODEL", "gpt-4.1-mini")
        self.base_url = os.getenv("MATCHER_QUERY_OPTIMIZER_BASE_URL")
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
                    f"{index}. {query}" for index, query in enumerate(normalized_queries, start=1)
                ),
            )
            response = client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": OPTIMIZER_SYSTEM_PROMPT.strip()},
                    {"role": "user", "content": prompt.strip()},
                ],
                temperature=0.2,
                max_tokens=900,
            )
            content = (response.choices[0].message.content or "").strip()
            parsed = self._parse_response(content)
            optimized_native = (parsed.get("optimized_query_native") or "").strip()
            optimized_en = (parsed.get("optimized_query_en") or "").strip()
            focuses = [
                str(item).strip()
                for item in parsed.get("focuses", [])
                if str(item).strip()
            ]

            if not optimized_native:
                optimized_native = fallback_native

            if not optimized_en:
                optimized_en = self.excel_processor._translate_to_english(optimized_native)

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
            client_kwargs = {"api_key": self.api_key}
            if self.base_url:
                client_kwargs["base_url"] = self.base_url
            self._client = OpenAI(**client_kwargs)
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
    def _parse_response(content: str) -> dict:
        if not content:
            return {}

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            match = _JSON_BLOCK_RE.search(content)
            if not match:
                return {}
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return {}
