"""
Translation utility for matcher.

Previously this was ``ExcelProcessor._translate_to_english`` — a private
method that ``query_optimizer.py`` reached across class boundaries to
call. The dependency direction was wrong: ExcelProcessor (which mostly
just writes xlsx files) doesn't actually own LLM credentials in most code
paths. Translation is its own concern; it lives here, both consumers
import it directly.

BYOK only — uses the caller's ``api_key`` / ``model_name`` / ``api_base``.
Returns the original text on any failure (empty input, missing creds,
API error). Never raises.
"""

from __future__ import annotations

import logging

from openai import OpenAI

logger = logging.getLogger(__name__)


def translate_to_english(
    text: str,
    *,
    model_name: str | None,
    api_key: str | None,
    api_base: str | None = None,
) -> str:
    """Translate ``text`` to English using the caller's BYOK LLM.

    Returns the original text if empty, if credentials are missing, or if
    the API call fails. Logging stays warning-level so the matcher job
    proceeds with the untranslated text rather than failing.
    """
    if not text or not text.strip():
        return text
    if not api_key or not model_name:
        logger.warning(
            "translate_to_english called without BYOK credentials; "
            "returning text unchanged."
        )
        return text
    try:
        client = OpenAI(api_key=api_key, base_url=api_base)
        response = client.chat.completions.create(
            model=model_name,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Translate the following text to English. Return only "
                        "the translated text, nothing else. If the text is "
                        "already in English, return it unchanged."
                    ),
                },
                {"role": "user", "content": text},
            ],
            max_tokens=512,
        )
        return response.choices[0].message.content.strip()
    except Exception as exc:  # noqa: BLE001 — translation must never fail the job
        logger.warning(
            "Translation failed for text '%s...': %s. Using original.",
            text[:50],
            exc,
        )
        return text
