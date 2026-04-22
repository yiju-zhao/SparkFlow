"""
LOTUS Matcher Service

Implements the semantic matching pipeline using LOTUS operators:
sem_search → sem_topk → sem_map
"""

import logging
import os
from typing import Callable

import lotus
import pandas as pd
from lotus.models import LM, SentenceTransformersRM
from lotus.vector_store import FaissVS

from services.semantic_operators import SemanticOperators

logger = logging.getLogger(__name__)


class LotusMatcher:
    """Wrapper for LOTUS semantic matching operations."""

    def __init__(self):
        self._configured = False
        self._lm = None

    def configure(self):
        """Configure LOTUS with local LLM via Xinference."""
        if self._configured:
            return

        xinference_url = os.getenv("XINFERENCE_BASE_URL", "http://localhost:9997/v1")
        model = os.getenv("XINFERENCE_MODEL", "Qwen3-Instruct")

        # Set dummy API key for LiteLLM (Xinference doesn't require one)
        os.environ["OPENAI_API_KEY"] = os.environ.get("OPENAI_API_KEY", "not-needed")

        logger.info(f"Configuring LOTUS with model: {model} at {xinference_url}")

        self._lm = LM(
            model=f"openai/{model}",
            max_batch_size=5,
            max_tokens=4096,
            api_base=xinference_url,
        )

        rm = SentenceTransformersRM(model="intfloat/e5-base-v2")
        vs = FaissVS()

        lotus.settings.configure(lm=self._lm, rm=rm, vs=vs)
        self._configured = True
        logger.info("LOTUS configured successfully")

    def build_text_column(
        self,
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

    def run_pipeline(
        self,
        df: pd.DataFrame,
        query_text: str,
        query_name: str,
        top_k: int = 50,
        search_k: int = 350,
        include_reasons: bool = True,
        index_dir: str | None = None,
        progress_callback: Callable[[int, str], None] | None = None,
    ) -> pd.DataFrame:
        """
        Run the full LOTUS matching pipeline.

        Args:
            df: DataFrame with target data (sessions/publications)
            query_text: Query text to match against
            query_name: Name of the query (for logging)
            top_k: Final number of matches to return
            search_k: Embedding pre-filter size
            include_reasons: Whether to generate recommendation reasons
            index_dir: Directory for FAISS index cache
            progress_callback: Callback for progress updates (percent, message)

        Returns:
            DataFrame with top_k matches and optional recommendation_reason column
        """
        self.configure()

        logger.info(f"Running pipeline for query: {query_name}")
        logger.info(f"  Input: {len(df)} items, search_k={search_k}, top_k={top_k}")

        # Step 1: Build semantic index (stays in LotusMatcher so we index exactly once).
        if progress_callback:
            progress_callback(10, "Building semantic index...")

        if index_dir:
            os.makedirs(index_dir, exist_ok=True)
            df = df.sem_index("match_text", index_dir)
        else:
            df = df.sem_index("match_text", "/tmp/lotus_index")

        # Step 2+: Delegate sem_search / sem_topk / sem_map to SemanticOperators.
        # Closures capture the pre-indexed `df` so indexing happens once above.
        def _search(cands, q, k):
            # Intentionally ignores `cands` and searches the pre-indexed `df`;
            # sem_search must run against the indexed frame, not a rebuilt one.
            out = df.sem_search("match_text", q, K=k)
            logger.info(f"  sem_search: {len(out)} candidates")
            return out.to_dict("records")

        def _topk(cands, q, k):
            instruction = (
                f"Given the following query:\n{q}\n\n"
                f"Rank the items by relevance to this query. "
                f"An item is more relevant if its {{match_text}} directly addresses, "
                f"provides insights into, or offers solutions for the query's needs."
            )
            out = pd.DataFrame(cands).sem_topk(instruction, K=k)
            logger.info(f"  sem_topk: {len(out)} matches")
            return out.to_dict("records")

        def _map(cands, q):
            instruction = (
                f"Given the query:\n{q}\n\n"
                f"For the item described by: {{match_text}}\n\n"
                f"请用中文写出2-3句简洁的推荐理由，说明为什么该条目与查询相关。要具体说明。"
                f"(Write a concise recommendation reason in Chinese, 2-3 sentences, "
                f"explaining why this item is relevant to the query. Be specific.)"
            )
            out = pd.DataFrame(cands).sem_map(
                instruction, suffix="recommendation_reason"
            )
            logger.info("  sem_map: Reasons generated")
            return out.to_dict("records")

        ops = SemanticOperators(search_fn=_search, topk_fn=_topk, map_fn=_map)

        if progress_callback:
            progress_callback(50, f"Ranking: sem_search → sem_topk → sem_map...")

        ranked = ops.rank(
            candidates=df.to_dict("records"),
            query_text=query_text,
            top_k=top_k,
            search_k=search_k,
            include_reasons=include_reasons,
        )

        if progress_callback:
            progress_callback(100, "Complete")

        return pd.DataFrame(ranked).reset_index(drop=True)

    def print_usage(self):
        """Print total LLM usage statistics."""
        if self._lm:
            self._lm.print_total_usage()


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
