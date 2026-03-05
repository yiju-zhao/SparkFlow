"""
Excel Processing Service

Handles reading query Excel files and writing result Excel files.
"""

import io
import logging
import os
import uuid
from typing import Iterator

import boto3
import pandas as pd
from botocore.exceptions import ClientError
from openai import OpenAI

logger = logging.getLogger(__name__)


class ExcelProcessor:
    """Process Excel files for queries and results."""

    def __init__(self):
        self.s3_client = self._create_s3_client()
        self.bucket = os.getenv("S3_BUCKET", "sparkflow")

    def _create_s3_client(self):
        """Create S3 client for MinIO/S3."""
        return boto3.client(
            "s3",
            endpoint_url=os.getenv("S3_ENDPOINT", "http://localhost:9002"),
            aws_access_key_id=os.getenv("S3_ACCESS_KEY", "minioadmin"),
            aws_secret_access_key=os.getenv("S3_SECRET_KEY", "minioadmin"),
        )

    def _translate_to_english(self, text: str) -> str:
        """
        Translate text to English using the Xinference LLM.

        Returns the original text if it's empty or translation fails.
        """
        if not text or not text.strip():
            return text
        try:
            client = OpenAI(
                api_key=os.getenv("XINFERENCE_API_KEY", "not-needed"),
                base_url=os.getenv("XINFERENCE_BASE_URL", "http://localhost:9997/v1"),
            )
            model = os.getenv("XINFERENCE_MODEL", "Qwen3-Instruct")
            response = client.chat.completions.create(
                model=model,
                messages=[
                    {
                        "role": "system",
                        "content": "Translate the following text to English. Return only the translated text, nothing else. If the text is already in English, return it unchanged.",
                    },
                    {"role": "user", "content": text},
                ],
                max_tokens=512,
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.warning(f"Translation failed for text '{text[:50]}...': {e}. Using original.")
            return text

    def parse_queries(self, file_key: str) -> list[dict]:
        """
        Parse queries from an uploaded Excel file.

        Expected format (positional columns):
        - Column 1 (index 0): key — who wants the matching (not translated)
        - Column 2 (index 1): area — optional domain/area (translated to English)
        - Column 3 (index 2): query — the actual query text (translated to English)

        Returns list of dicts with id, key, area, query, row_index
        """
        try:
            # Download from S3
            response = self.s3_client.get_object(Bucket=self.bucket, Key=file_key)
            excel_data = response["Body"].read()

            # Read Excel without using first row as header
            df = pd.read_excel(io.BytesIO(excel_data), engine="openpyxl", header=None)

            queries = []
            for idx, row in df.iterrows():
                # Skip empty rows
                if row.isna().all():
                    continue

                key = self._safe_str(row.iloc[0])
                area = self._safe_str(row.iloc[1] if len(row) > 1 else "")
                query_text = self._safe_str(row.iloc[2] if len(row) > 2 else "")

                # Skip rows with no query text
                if not query_text.strip():
                    continue

                query = {
                    "id": str(uuid.uuid4()),
                    "key": key,
                    "area": area,
                    "query": query_text,
                    "row_index": idx,
                }
                queries.append(query)

            logger.info(f"Parsed {len(queries)} queries from {file_key}")
            return queries

        except ClientError as e:
            logger.error(f"S3 error reading {file_key}: {e}")
            raise Exception(f"Failed to read query file: {e}")
        except Exception as e:
            logger.error(f"Error parsing queries from {file_key}: {e}")
            raise

    def create_result_excel(
        self,
        results_by_query: dict[str, pd.DataFrame],
        master_df: pd.DataFrame | None = None,
    ) -> str:
        """
        Create a multi-tab Excel file with match results.

        Args:
            results_by_query: Dict mapping query name to results DataFrame
            master_df: Optional aggregated master DataFrame

        Returns:
            S3 key of the created file
        """
        output = io.BytesIO()

        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            # Tab 1: Master aggregated view (if provided)
            if master_df is not None:
                master_df.to_excel(writer, sheet_name="All_Matches", index=False)

            # Tabs for each query's results
            for query_name, df in results_by_query.items():
                # Sanitize sheet name (max 31 chars, no special chars)
                safe_name = self._sanitize_sheet_name(query_name)
                df.to_excel(writer, sheet_name=safe_name, index=False)

        output.seek(0)

        # Upload to S3
        file_key = f"match-results/{uuid.uuid4()}.xlsx"
        self.s3_client.put_object(
            Bucket=self.bucket,
            Key=file_key,
            Body=output.getvalue(),
            ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

        logger.info(f"Created result Excel: {file_key}")
        return file_key

    def get_result_file_stream(self, file_key: str) -> Iterator[bytes]:
        """Get a streaming response for the result file."""
        response = self.s3_client.get_object(Bucket=self.bucket, Key=file_key)
        return response["Body"].iter_chunks()

    def _sanitize_sheet_name(self, name: str) -> str:
        """Sanitize sheet name for Excel (max 31 chars, no invalid chars)."""
        # Remove invalid characters
        invalid_chars = ['\\', '/', '*', '?', ':', '[', ']']
        for char in invalid_chars:
            name = name.replace(char, '_')
        # Truncate to 31 chars
        return name[:31]

    def _safe_str(self, val) -> str:
        """Convert value to string safely."""
        if val is None or (isinstance(val, float) and pd.isna(val)):
            return ""
        if isinstance(val, list):
            return ", ".join(str(v) for v in val)
        return str(val).strip()
