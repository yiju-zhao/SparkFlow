"""
Pydantic models for API request/response schemas.
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Operators API — POST /api/operators/rank
# ---------------------------------------------------------------------------


class RankCandidate(BaseModel):
    """A single candidate passed to the rank pipeline.

    Only ``id`` and ``match_text`` are required; arbitrary additional fields
    (e.g. ``title``, ``abstract``) are preserved via ``extra="allow"`` so they
    round-trip through the response.
    """

    model_config = ConfigDict(extra="allow")

    id: str
    match_text: str


class OperatorModelConfig(BaseModel):
    """Per-request LLM credentials + model selection for LOTUS.

    Callers (apps/langgraph workflows) resolve the user's BYOK via
    ``resolveApiKey`` and forward the result here. The apps/semops service
    does NOT carry its own provider keys — missing BYOK is a 401 at the
    Node layer before the request ever reaches this endpoint.

    ``provider`` is the BYOK provider id ("openai", "google", "deepseek",
    "glm", "minimax", "kimi", "cari-ai4news", "custom"). ``api_base`` is only
    needed for OpenAI-compatible endpoints that aren't api.openai.com
    (deepseek, glm, minimax, kimi, cari-ai4news, custom).
    """

    provider: str
    model: str
    api_key: str
    api_base: Optional[str] = None


class RankRequest(BaseModel):
    """Request body for POST /api/operators/rank."""

    candidates: list[RankCandidate]
    query_text: str
    top_k: int = 50
    search_k: int = 350
    include_reasons: bool = True
    # Per-request LOTUS LM config. Required — no admin fallback.
    # JSON key is ``lm_config`` to avoid colliding with Pydantic v2's
    # reserved ``model_config`` class-attribute name.
    lm_config: OperatorModelConfig


class RankResultItem(BaseModel):
    """A single ranked result.

    Mirrors ``RankCandidate``'s extra-passthrough semantics so any fields the
    semantic operator attached (beyond ``recommendation_reason``) survive.
    """

    model_config = ConfigDict(extra="allow")

    id: str
    match_text: str
    recommendation_reason: Optional[str] = None


class RankResponse(BaseModel):
    """Response body for POST /api/operators/rank."""

    results: list[RankResultItem]
    count: int
