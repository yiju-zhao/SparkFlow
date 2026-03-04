"""
Job Runner Service

Handles background execution of match jobs.
"""

import logging
import os
import tempfile
from datetime import datetime
from typing import Any

import pandas as pd

from services.excel_processor import ExcelProcessor
from services.lotus_matcher import LotusMatcher
from tools.data_loader import DataLoader

logger = logging.getLogger(__name__)


class JobRunner:
    """Execute match jobs in the background."""

    def __init__(
        self,
        matcher: LotusMatcher,
        data_loader: DataLoader,
        excel_processor: ExcelProcessor,
    ):
        self.matcher = matcher
        self.data_loader = data_loader
        self.excel_processor = excel_processor

    def run_job(self, job_id: str):
        """
        Run a match job to completion.

        Pipeline:
        1. Load target data (sessions/publications) from database
        2. Build text column for semantic indexing
        3. For each query, run LOTUS pipeline
        4. Aggregate results and create Excel output
        """
        logger.info(f"Starting job {job_id}")

        try:
            # Update job status
            self.data_loader.update_match_job(
                job_id,
                status="PROCESSING",
                started_at=datetime.utcnow(),
            )

            # Get job details
            job = self.data_loader.get_match_job(job_id)
            if not job:
                raise ValueError(f"Job {job_id} not found")

            queries = job.get("query_data", [])
            instance_id = job["instance_id"]
            target_type = job["target_type"]
            top_k = job["top_k"]
            search_k = job["search_k"]
            include_reasons = job["include_reasons"]

            if not queries:
                raise ValueError("No queries to process")

            # Load target data
            self.data_loader.update_match_job(job_id, progress=5)

            if target_type == "SESSION":
                target_df = self.data_loader.load_sessions(instance_id)
            else:
                target_df = self.data_loader.load_publications(instance_id)

            if target_df is None or len(target_df) == 0:
                raise ValueError(f"No {target_type} data found for instance {instance_id}")

            logger.info(f"Loaded {len(target_df)} {target_type} items")

            # Build text column for semantic matching
            target_df = self.matcher.build_text_column(target_df, target_type)

            # Create temp dir for FAISS index
            index_dir = tempfile.mkdtemp(prefix=f"lotus_{job_id}_")

            # Process each query
            results_by_query = {}
            total_queries = len(queries)
            total_matches = 0

            for i, query in enumerate(queries):
                query_name = query.get("name", f"Query {i + 1}")
                query_content = query.get("content", "")

                if not query_content.strip():
                    logger.warning(f"Skipping empty query: {query_name}")
                    continue

                # Update progress
                progress = 10 + int((i / total_queries) * 70)
                self.data_loader.update_match_job(
                    job_id,
                    progress=progress,
                    error_message=f"Processing: {query_name}",
                )

                def progress_callback(pct, msg):
                    # Nested progress updates not needed at job level
                    pass

                # Run LOTUS pipeline
                matches_df = self.matcher.run_pipeline(
                    df=target_df,
                    query_text=query_content,
                    query_name=query_name,
                    top_k=top_k,
                    search_k=search_k,
                    include_reasons=include_reasons,
                    index_dir=index_dir,
                    progress_callback=progress_callback,
                )

                # Add metadata columns
                matches_df.insert(0, "query_name", query_name)
                matches_df.insert(0, "rank", range(1, len(matches_df) + 1))

                # Rename recommendation_reason column if present
                reason_cols = [c for c in matches_df.columns if "recommendation_reason" in c]
                if reason_cols:
                    matches_df = matches_df.rename(columns={reason_cols[0]: "recommendation_reason"})

                results_by_query[query_name] = matches_df
                total_matches += len(matches_df)
                logger.info(f"Query '{query_name}': {len(matches_df)} matches")

            # Create aggregated master view
            all_matches = []
            for query_name, df in results_by_query.items():
                all_matches.append(df)

            master_df = pd.concat(all_matches, ignore_index=True) if all_matches else None

            # Create result Excel
            self.data_loader.update_match_job(job_id, progress=85, error_message="Creating result file...")
            result_file_key = self.excel_processor.create_result_excel(
                results_by_query=results_by_query,
                master_df=master_df,
            )

            # Update job as completed
            self.data_loader.update_match_job(
                job_id,
                status="COMPLETED",
                progress=100,
                result_file_key=result_file_key,
                match_count=total_matches,
                completed_at=datetime.utcnow(),
                error_message=None,
            )

            logger.info(f"Job {job_id} completed: {total_matches} total matches")

            # Cleanup temp index
            try:
                import shutil
                shutil.rmtree(index_dir, ignore_errors=True)
            except Exception:
                pass

        except Exception as e:
            logger.exception(f"Job {job_id} failed: {e}")
            self.data_loader.update_match_job(
                job_id,
                status="FAILED",
                error_message=str(e),
                completed_at=datetime.utcnow(),
            )
