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
from tools.job_store import JobStore

logger = logging.getLogger(__name__)


class JobRunner:
    """Execute match jobs in the background."""

    def __init__(
        self,
        matcher: LotusMatcher,
        excel_processor: ExcelProcessor,
        job_store: JobStore,
    ):
        self.matcher = matcher
        self.excel_processor = excel_processor
        self.job_store = job_store

    def run_job(self, job_id: str, target_data: list[dict]):
        """
        Run a match job to completion.

        Processing flow:
        1. Group queries by BU (business unit)
        2. Aggregate queries from same BU
        3. Translate aggregated query to English
        4. Match against target data
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

            # Step 2 & 3: Aggregate and translate each BU's queries
            aggregated_queries = []
            for bu, query_list in queries_by_bu.items():
                # Combine all queries from this BU
                combined_query = "\n".join(f"- {q}" for q in query_list)
                
                # Translate the aggregated query to English
                translated_query = self.excel_processor._translate_to_english(combined_query)
                
                aggregated_queries.append({
                    "bu": bu,
                    "original_count": len(query_list),
                    "aggregated_query": translated_query,
                })
                logger.info(f"BU '{bu}': aggregated {len(query_list)} queries")

            # Step 4: Process each aggregated query
            results_by_query = {}
            total_bus = len(aggregated_queries)
            total_matches = 0

            for i, agg in enumerate(aggregated_queries):
                bu = agg["bu"]
                query_text = agg["aggregated_query"]

                if not query_text.strip():
                    logger.warning(f"Skipping empty aggregated query for BU: {bu}")
                    continue

                # Update progress
                progress = 10 + int((i / total_bus) * 70)
                self.job_store.update_job(
                    job_id,
                    progress=progress,
                    error_message=f"Processing: {bu}",
                )

                def progress_callback(pct, msg):
                    pass

                # Run LOTUS pipeline with aggregated query
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

            # Create aggregated master view
            all_matches = []
            for bu, df in results_by_query.items():
                all_matches.append(df)

            master_df = pd.concat(all_matches, ignore_index=True) if all_matches else None

            # Create result Excel
            self.job_store.update_job(job_id, progress=85, error_message="Creating result file...")
            result_file_key = self.excel_processor.create_result_excel(
                results_by_query=results_by_query,
                master_df=master_df,
            )

            # Update job as completed
            self.job_store.update_job(
                job_id,
                status="COMPLETED",
                progress=100,
                result_file_key=result_file_key,
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
