"""
Semantic operator routes.

Exposes the LOTUS rank pipeline directly. Workflow callers
(apps/langgraph/workflows/{search,matcher,daily_digest}) invoke these over
HTTP, passing per-request BYOK credentials in ``lm_config``.
"""

import logging

from fastapi import APIRouter, HTTPException

from api.types import RankRequest, RankResponse, RankResultItem
from services.errors import (
    SemopsAuthError,
    SemopsBadRequest,
    SemopsProviderError,
    SemopsRateLimitError,
)
from services.semantic_operators import rank as run_rank

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/rank", response_model=RankResponse)
async def rank(req: RankRequest):
    """Run the LOTUS rank pipeline and return up to ``top_k`` results."""
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
        ranked = run_rank(
            candidates=candidates_dicts,
            query_text=req.query_text,
            top_k=req.top_k,
            search_k=req.search_k,
            include_reasons=req.include_reasons,
            lm_config=req.lm_config.model_dump(),
        )
    except SemopsAuthError as e:
        # BYOK key rejected by the provider. Surface as 401 so callers
        # (matcher / digest workflows) can prompt the user to fix Settings.
        logger.warning("rank auth error: %s", e)
        raise HTTPException(status_code=401, detail=str(e)) from e
    except SemopsRateLimitError as e:
        logger.warning("rank rate limited: %s", e)
        raise HTTPException(status_code=429, detail=str(e)) from e
    except SemopsBadRequest as e:
        # Malformed candidates / etc. — caller error, distinct from auth/rate.
        logger.warning("rank bad request: %s", e)
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SemopsProviderError as e:
        # Provider 5xx / unknown upstream failure. 502 == "we are a gateway
        # to a broken upstream" which matches semantically.
        logger.exception("rank provider error: %s", e)
        raise HTTPException(status_code=502, detail=str(e)) from e
    except ValueError as e:
        # Backstop for ValueErrors that didn't get normalized — most likely
        # the module-level rank()'s own "candidates must be non-empty list"
        # which fires before the pool path. Kept LAST so normalized errors
        # above take precedence.
        logger.exception("rank rejected: %s", e)
        raise HTTPException(status_code=400, detail=str(e)) from e

    results = [RankResultItem(**item) for item in ranked]
    response = RankResponse(results=results, count=len(results))

    logger.info(
        "rank complete: query_len=%d candidates=%d returned=%d",
        len(req.query_text),
        len(req.candidates),
        response.count,
    )
    return response
