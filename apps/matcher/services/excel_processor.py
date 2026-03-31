"""
Excel Processing Service

Handles reading query Excel files and writing result Excel files.
"""

import io
import logging
import os
import re

import pandas as pd
from openai import OpenAI

# Characters illegal in Excel/openpyxl cells (control chars except tab, newline, carriage return)
_ILLEGAL_EXCEL_CHARS_RE = re.compile(r"[\x00-\x08\x0b-\x0c\x0e-\x1f]")

logger = logging.getLogger(__name__)


class ExcelProcessor:
    """Process Excel files for queries and results."""

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

    def create_result_excel(
        self,
        results_by_query: dict[str, pd.DataFrame],
        master_df: pd.DataFrame | None = None,
    ) -> bytes:
        """
        Create a multi-tab Excel file with match results.

        Args:
            results_by_query: Dict mapping query name to results DataFrame
            master_df: Optional aggregated master DataFrame

        Returns:
            Excel file as bytes
        """
        output = io.BytesIO()

        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            # Tab 1: Master aggregated view (if provided)
            if master_df is not None:
                self._sanitize_df(master_df).to_excel(writer, sheet_name="Master_Aggregated", index=False)

            # Tabs for each query's results
            for query_name, df in results_by_query.items():
                # Sanitize sheet name (max 31 chars, no special chars)
                safe_name = self._sanitize_sheet_name(query_name)
                self._sanitize_df(df).to_excel(writer, sheet_name=safe_name, index=False)

        output.seek(0)
        return output.getvalue()

    @staticmethod
    def _sanitize_df(df: pd.DataFrame) -> pd.DataFrame:
        """Strip illegal Excel control characters from all string columns."""
        df = df.copy()
        for col in df.select_dtypes(include=["object"]).columns:
            df[col] = df[col].apply(
                lambda v: _ILLEGAL_EXCEL_CHARS_RE.sub("", v) if isinstance(v, str) else v
            )
        return df

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
