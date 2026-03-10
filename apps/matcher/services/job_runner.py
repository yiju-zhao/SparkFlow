"""
Job Runner Service

Handles background execution of match jobs.
"""

import logging
import tempfile
from collections import defaultdict
from datetime import datetime

import pandas as pd

from services.excel_processor import ExcelProcessor
from services.lotus_matcher import LotusMatcher
from services.query_optimizer import QueryOptimizer
from tools.job_store import JobStore

logger = logging.getLogger(__name__)


class JobRunner:
    """Execute match jobs in the background."""

    def __init__(
        self,
        matcher: LotusMatcher,
        excel_processor: ExcelProcessor,
        job_store: JobStore,
        query_optimizer: QueryOptimizer | None = None,
        model_provider: str = "google",
        model_name: str = "gemini-2.5-flash",
    ):
        self.matcher = matcher
        self.excel_processor = excel_processor
        self.job_store = job_store
        self.model_provider = model_provider
        self.model_name = model_name
        self.query_optimizer = query_optimizer or QueryOptimizer(
            excel_processor=excel_processor,
            model_provider=model_provider,
            model_name=model_name,
        )

    def run_job(self, job_id: str, target_data: list[dict]):
        """
        Run a match job to completion.

        Processing flow:
        1. Group queries by BU (business unit)
        2. Optimize each BU's query set with OpenAI
        3. Match optimized English query against target data
        """
        logger.info(f"Starting job {job_id}")

        try:
            # Update job status
            self.job_store.update_job(
                job_id,
                status="PROCESSING",
                started_at=datetime.utcnow(),
            )

            # Get job details
            job = self.job_store.get_job(job_id)
            if not job:
                raise ValueError(f"Job {job_id} not found")

            queries = job.get("query_data", [])
            target_type = job["target_type"]
            top_k = job["top_k"]
            search_k = job["search_k"]
            include_reasons = job["include_reasons"]

            if not queries:
                raise ValueError("No queries to process")

            # Convert target_data to DataFrame
            target_df = pd.DataFrame(target_data)
            logger.info(f"Loaded {len(target_df)} {target_type} items")

            if len(target_df) == 0:
                raise ValueError(f"No {target_type} data provided")

            # Build text column for semantic matching
            target_df = self.matcher.build_text_column(target_df, target_type)

            # Create temp dir for FAISS index
            index_dir = tempfile.mkdtemp(prefix=f"lotus_{job_id}_")

            # Step 1: Group queries by BU
            queries_by_bu = defaultdict(list)
            for query in queries:
                bu = query.get("bu", "Unknown")
                query_text = query.get("query", "")
                if query_text.strip():
                    queries_by_bu[bu].append(query_text)

            logger.info(f"Grouped {len(queries)} queries into {len(queries_by_bu)} BUs")

            # Step 2: Optimize each BU's queries into clearer, less redundant search text
            optimized_queries = []
            optimization_by_bu = {}
            total_bus = len(queries_by_bu)
            for i, (bu, query_list) in enumerate(queries_by_bu.items()):
                progress = 5 + int((i / max(total_bus, 1)) * 20)
                self.job_store.update_job(
                    job_id,
                    progress=progress,
                    error_message=f"Optimizing queries: {bu}",
                )

                optimization = self.query_optimizer.optimize_queries(
                    bu=bu,
                    queries=query_list,
                    target_type=target_type,
                )
                optimized_record = {
                    "bu": bu,
                    "original_count": len(query_list),
                    "source_queries": optimization.source_queries,
                    "optimized_query_native": optimization.optimized_query_native,
                    "optimized_query_en": optimization.optimized_query_en,
                    "focuses": optimization.focuses,
                    "used_llm": optimization.used_llm,
                }
                optimized_queries.append(optimized_record)
                optimization_by_bu[bu] = optimized_record
                logger.info(
                    "BU '%s': optimized %s queries into %s chars of search text (used_llm=%s)",
                    bu,
                    len(query_list),
                    len(optimization.optimized_query_en),
                    optimization.used_llm,
                )

            # Persist optimized BU query summaries into job query_data for history/debugging
            enriched_queries = []
            for query in queries:
                query_record = dict(query)
                bu = query_record.get("bu", "Unknown")
                optimization = optimization_by_bu.get(bu)
                if optimization:
                    query_record["optimized_query_native"] = optimization["optimized_query_native"]
                    query_record["optimized_query_en"] = optimization["optimized_query_en"]
                    query_record["optimization_focuses"] = optimization["focuses"]
                    query_record["optimizer_used_llm"] = optimization["used_llm"]
                enriched_queries.append(query_record)
            self.job_store.update_job(job_id, query_data=enriched_queries)

            # Step 3: Process each optimized BU query
            results_by_query = {}
            total_matches = 0

            for i, optimized in enumerate(optimized_queries):
                bu = optimized["bu"]
                query_text = optimized["optimized_query_en"]

                if not query_text.strip():
                    logger.warning(f"Skipping empty optimized query for BU: {bu}")
                    continue

                # Update progress
                progress = 30 + int((i / max(total_bus, 1)) * 50)
                self.job_store.update_job(
                    job_id,
                    progress=progress,
                    error_message=f"Processing: {bu}",
                )

                def progress_callback(pct, msg):
                    pass

                # Run LOTUS pipeline with optimized English query
                matches_df = self.matcher.run_pipeline(
                    df=target_df,
                    query_text=query_text,
                    query_name=bu,
                    top_k=top_k,
                    search_k=search_k,
                    include_reasons=include_reasons,
                    index_dir=index_dir,
                    progress_callback=progress_callback,
                )

                # Add metadata columns
                matches_df.insert(0, "bu", bu)
                matches_df.insert(0, "rank", range(1, len(matches_df) + 1))

                # Rename recommendation_reason column if present
                reason_cols = [c for c in matches_df.columns if "recommendation_reason" in c]
                if reason_cols:
                    matches_df = matches_df.rename(columns={reason_cols[0]: "recommendation_reason"})

                results_by_query[bu] = matches_df
                total_matches += len(matches_df)
                logger.info(f"BU '{bu}': {len(matches_df)} matches")

            # Create aggregated master view: all target items with BU rank columns
            master_df = target_df.drop(columns=["match_text"], errors="ignore").copy()

            # Add a rank column for each BU
            bu_names = list(results_by_query.keys())
            for bu in bu_names:
                bu_df = results_by_query[bu]
                # Build a mapping from target item identifier to rank
                # Use the original index or a unique identifier column
                id_col = "id" if "id" in bu_df.columns else None
                if id_col:
                    rank_map = dict(zip(bu_df[id_col], bu_df["rank"]))
                    master_df[bu] = master_df["id"].map(rank_map) if "id" in master_df.columns else ""
                else:
                    # Fallback: use title for matching
                    title_col = "title" if "title" in bu_df.columns else None
                    if title_col:
                        rank_map = dict(zip(bu_df[title_col], bu_df["rank"]))
                        master_df[bu] = master_df["title"].map(rank_map) if "title" in master_df.columns else ""
                    else:
                        master_df[bu] = ""

            # Add aggregated recommendation reasons column to master sheet
            has_reasons = include_reasons and any(
                "recommendation_reason" in results_by_query[bu].columns
                for bu in bu_names
            )
            if has_reasons:
                # Build per-BU reason maps keyed by id (or title as fallback)
                reason_maps = {}
                for bu in bu_names:
                    bu_df = results_by_query[bu]
                    if "recommendation_reason" not in bu_df.columns:
                        continue
                    if "id" in bu_df.columns:
                        reason_maps[bu] = dict(zip(bu_df["id"], bu_df["recommendation_reason"]))
                    elif "title" in bu_df.columns:
                        reason_maps[bu] = dict(zip(bu_df["title"], bu_df["recommendation_reason"]))

                id_key = "id" if "id" in master_df.columns else ("title" if "title" in master_df.columns else None)
                if id_key and reason_maps:
                    def get_aggregated_reasons(row, _maps=reason_maps, _key=id_key):
                        parts = []
                        key = row[_key]
                        for bu, rmap in _maps.items():
                            reason = rmap.get(key)
                            if reason and str(reason).strip():
                                parts.append(f"[{bu}]\n{reason}")
                        return "\n\n".join(parts)

                    master_df["recommendation_reasons"] = master_df.apply(get_aggregated_reasons, axis=1)

            # Drop database PK columns before writing to Excel
            master_df = master_df.drop(columns=["id"], errors="ignore")
            for bu in results_by_query:
                results_by_query[bu] = results_by_query[bu].drop(columns=["id"], errors="ignore")

            # Create result Excel
            self.job_store.update_job(job_id, progress=85, error_message="Creating result file...")
            result_bytes = self.excel_processor.create_result_excel(
                results_by_query=results_by_query,
                master_df=master_df,
            )

            # Update job as completed
            self.job_store.update_job(
                job_id,
                status="COMPLETED",
                progress=100,
                result_data=result_bytes,
                match_count=total_matches,
                completed_at=datetime.utcnow(),
                error_message=None,
            )

            logger.info(f"Job {job_id} completed: {total_matches} total matches from {total_bus} BUs")

            # Cleanup temp index
            try:
                import shutil
                shutil.rmtree(index_dir, ignore_errors=True)
            except Exception:
                pass

        except Exception as e:
            logger.exception(f"Job {job_id} failed: {e}")
            self.job_store.update_job(
                job_id,
                status="FAILED",
                error_message=str(e),
                completed_at=datetime.utcnow(),
            )
