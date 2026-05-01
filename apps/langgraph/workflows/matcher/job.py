"""Match-job orchestration as Graph API + Send (ref doc §Creating workers in LangGraph).

BUs are unknown at build time; orchestrator groups + optimizes them, assign_workers
dispatches one rank_bu Send per BU, results aggregate via merge_dict reducer,
synthesize assembles the master DataFrame and Excel bytes.

JobStore writes are plain function calls inside nodes — NOT @task — to keep
SSE polling deterministic.
"""

from __future__ import annotations

import logging
import tempfile
from collections import defaultdict
from datetime import datetime, timezone
from typing import Annotated, Any, TypedDict

import pandas as pd
from langgraph.graph import END, START, StateGraph
from langgraph.types import Send

from workflows.matcher.excel_processor import ExcelProcessor
from workflows.matcher.job_store import JobStore
from workflows.matcher.lotus import LotusMatcher
from workflows.matcher.query_optimizer import QueryOptimizer

logger = logging.getLogger(__name__)
job_store = JobStore()


def _merge_dict(left: dict, right: dict) -> dict:
    return {**left, **right}


class JobState(TypedDict, total=False):
    job_id: str
    target_df: pd.DataFrame
    req: Any
    queries_by_bu: dict[str, list[str]]
    optimized: dict[str, Any]
    results_by_bu: Annotated[dict[str, pd.DataFrame], _merge_dict]
    excel_bytes: bytes
    total_matches: int
    index_dir: str


def orchestrator(state: JobState) -> dict:
    job_store.update_job(
        state["job_id"], status="PROCESSING", started_at=datetime.now(timezone.utc)
    )
    req = state["req"]
    queries_by_bu: dict[str, list[str]] = defaultdict(list)
    for q in req.queries:
        bu = q.get("bu", "Unknown")
        text = (q.get("query") or "").strip()
        if text:
            queries_by_bu[bu].append(text)
    queries_by_bu = dict(queries_by_bu)
    optimizer = QueryOptimizer(
        excel_processor=ExcelProcessor(),
        model_provider=req.lm.provider,
        model_name=req.lm.model,
        api_key=req.lm.api_key,
        api_base=req.lm.api_base,
    )
    optimized: dict[str, Any] = {}
    total_bus = max(len(queries_by_bu), 1)
    for i, (bu, qs) in enumerate(queries_by_bu.items()):
        progress = 5 + int((i / total_bus) * 20)
        job_store.update_job(
            state["job_id"], progress=progress, error_message=f"Optimizing queries: {bu}"
        )
        optimized[bu] = optimizer.optimize_queries(
            bu=bu,
            queries=qs,
            target_type=req.target_type,
        )
    job_store.update_job(state["job_id"], progress=30, query_data=_enriched(req.queries, optimized))
    return {
        "queries_by_bu": queries_by_bu,
        "optimized": optimized,
        "index_dir": tempfile.mkdtemp(prefix=f"lotus_{state['job_id']}_"),
    }


def assign_workers(state: JobState) -> list[Send]:
    """Send one rank_bu invocation per BU. Per ref doc §Creating workers in LangGraph."""
    return [
        Send(
            "rank_bu",
            {
                "bu": bu,
                "optimized": opt,
                "target_df": state["target_df"],
                "req": state["req"],
                "index_dir": state["index_dir"],
            },
        )
        for bu, opt in state["optimized"].items()
    ]


def rank_bu(ws: dict) -> dict:
    """Worker — runs LOTUS pipeline for one BU. Writes one entry into results_by_bu."""
    matcher = LotusMatcher()
    target_df = matcher.build_text_column(ws["target_df"], ws["req"].target_type)
    matches_df = matcher.run_pipeline(
        df=target_df,
        query_text=ws["optimized"].optimized_query_en,
        query_name=ws["bu"],
        top_k=ws["req"].top_k,
        search_k=ws["req"].search_k,
        include_reasons=ws["req"].include_reasons,
        index_dir=ws["index_dir"],
        progress_callback=lambda *_: None,
        model_provider=ws["req"].lm.provider,
        model_name=ws["req"].lm.model,
        api_key=ws["req"].lm.api_key,
        api_base=ws["req"].lm.api_base,
    )
    matches_df.insert(0, "bu", ws["bu"])
    matches_df.insert(0, "rank", range(1, len(matches_df) + 1))
    reason_cols = [c for c in matches_df.columns if "recommendation_reason" in c]
    if reason_cols:
        matches_df = matches_df.rename(columns={reason_cols[0]: "recommendation_reason"})
    return {"results_by_bu": {ws["bu"]: matches_df}}


def synthesize(state: JobState) -> dict:
    job_store.update_job(state["job_id"], progress=85, error_message="Creating result file...")
    master = _build_master(state["target_df"], state["results_by_bu"], state["req"].include_reasons)
    excel_bytes = ExcelProcessor().create_result_excel(
        results_by_query=state["results_by_bu"],
        master_df=master,
    )
    total = sum(len(df) for df in state["results_by_bu"].values())
    return {"excel_bytes": excel_bytes, "total_matches": total}


# --- helpers (match the legacy job_runner.py output shape) ---


def _enriched(queries: list[dict], optimized: dict[str, Any]) -> list[dict]:
    out = []
    for q in queries:
        rec = dict(q)
        opt = optimized.get(rec.get("bu", "Unknown"))
        if opt:
            rec.update(
                {
                    "optimized_query_native": opt.optimized_query_native,
                    "optimized_query_en": opt.optimized_query_en,
                    "optimization_focuses": opt.focuses,
                    "optimizer_used_llm": opt.used_llm,
                }
            )
        out.append(rec)
    return out


def _build_master(
    target_df: pd.DataFrame, results_by_bu: dict[str, pd.DataFrame], include_reasons: bool
) -> pd.DataFrame:
    # Validate identity-column consistency across BU result frames.
    # If two BUs disagree (one returns 'id', another only 'title'), joins
    # would silently key on different columns and emit wrong rows.
    id_columns = {
        bu: ("id" if "id" in df.columns else "title") for bu, df in results_by_bu.items()
    }
    distinct = set(id_columns.values())
    if len(distinct) > 1:
        raise ValueError(
            f"BU result DataFrames have inconsistent identity columns: {id_columns}. "
            f"All BUs must agree on either 'id' or 'title' as the join key."
        )
    # Capture id_col once and use everywhere — avoids order coupling between
    # `master.drop(columns=["id"])` and reason aggregation.
    id_col = next(iter(distinct), "id")

    master = target_df.drop(columns=["match_text"], errors="ignore").copy()
    bu_names = list(results_by_bu.keys())
    for bu in bu_names:
        bu_df = results_by_bu[bu]
        if id_col in bu_df.columns and id_col in master.columns:
            rank_map = dict(zip(bu_df[id_col], bu_df["rank"]))
            # Cast to nullable Int64 so unmatched rows render as blank in
            # Excel instead of `1.0, 2.0, NaN` (float upcast on .map miss).
            master[bu] = master[id_col].map(rank_map).astype("Int64")
        else:
            master[bu] = ""
    if include_reasons and any(
        "recommendation_reason" in results_by_bu[bu].columns for bu in bu_names
    ):
        reason_maps: dict[str, dict] = {}
        for bu in bu_names:
            df = results_by_bu[bu]
            if "recommendation_reason" not in df.columns:
                continue
            if id_col in df.columns:
                reason_maps[bu] = dict(zip(df[id_col], df["recommendation_reason"]))
        if reason_maps and id_col in master.columns:

            def agg(row):
                parts = []
                k = row[id_col]
                for bu, m in reason_maps.items():
                    r = m.get(k)
                    if r and str(r).strip():
                        parts.append(f"[{bu}]\n{r}")
                return "\n\n".join(parts)

            master["recommendation_reasons"] = master.apply(agg, axis=1)
    master = master.drop(columns=["id"], errors="ignore")
    for bu in results_by_bu:
        results_by_bu[bu] = results_by_bu[bu].drop(columns=["id"], errors="ignore")
    return master


# ---------------------------------------------------------------------------
# Build the graph
# ---------------------------------------------------------------------------

builder = StateGraph(JobState)
builder.add_node("orchestrator", orchestrator)
builder.add_node("rank_bu", rank_bu)
builder.add_node("synthesize", synthesize)
builder.add_edge(START, "orchestrator")
builder.add_conditional_edges("orchestrator", assign_workers, ["rank_bu"])
builder.add_edge("rank_bu", "synthesize")
builder.add_edge("synthesize", END)
match_job_graph = builder.compile()
