"""
Semantic operator routes.

Exposes ``SemanticOperators`` primitives directly. Workflow callers
(apps/langgraph/workflows/{search,matcher,daily_digest}) invoke these over
HTTP, passing per-request BYOK credentials in ``lm_config``.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from api.types import RankRequest, RankResponse, RankResultItem
from services.semantic_operators import SemanticOperators

logger = logging.getLogger(__name__)

router = APIRouter()


def get_operators(request: Request) -> SemanticOperators:
    """Return a per-process ``SemanticOperators`` instance.

    Reusing one instance keeps any real-LOTUS state (default search/topk/map
    closures, lazy imports) warm across requests. LOTUS's LM is (re)configured
    inside ``SemanticOperators.rank`` per request using the caller's
    ``lm_config``.
    """
    ops = getattr(request.app.state, "operators", None)
    if ops is None:
        ops = SemanticOperators()
        request.app.state.operators = ops
    return ops


@router.post("/rank", response_model=RankResponse)
async def rank(
    req: RankRequest,
    request: Request,
    ops: SemanticOperators = Depends(get_operators),
):
    """Run ``SemanticOperators.rank`` and return up to ``top_k`` results."""
    logger.info(
        "rank request: provider=%s model=%s query_len=%d candidates=%d top_k=%d search_k=%d include_reasons=%s",
        req.lm_config.provider,
        req.lm_config.model,
        len(req.query_text),
        len(req.candidates),
        req.top_k,
        req.search_k,
        req.include_reasons,
    )

    candidates_dicts = [c.model_dump() for c in req.candidates]

    try:
        ranked = ops.rank(
            candidates=candidates_dicts,
            query_text=req.query_text,
            top_k=req.top_k,
            search_k=req.search_k,
            include_reasons=req.include_reasons,
            lm_config=req.lm_config.model_dump(),
        )
    except ValueError as e:
        # SemanticOperators raises ValueError for empty candidates. Translate
        # to HTTP 400 with a stable detail string.
        logger.info("rank rejected: %s", e)
        raise HTTPException(
            status_code=400, detail="candidates must not be empty"
        ) from e

    results = [RankResultItem(**item) for item in ranked]
    response = RankResponse(results=results, count=len(results))

    logger.info(
        "rank complete: query_len=%d candidates=%d returned=%d",
        len(req.query_text),
        len(req.candidates),
        response.count,
    )
    return response
