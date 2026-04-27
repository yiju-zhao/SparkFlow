"""POST /v1/workflows/wiki/extract — produce wiki payload from source content.

Stateless. The Node-side worker handles per-job persistence (status writes,
prisma.$transaction) and is the single source of truth for DB state.
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse

from server.wiki_ingest_types import (
    WikiExtractMode, WikiExtractRequest, WikiRemoveMode,
)
from workflows.wiki_ingest import (
    Edge, Graph, Node, WikiExtractRequest as InternalReq, extract_wiki,
)

logger = logging.getLogger(__name__)
router = APIRouter()


def _verify_token(x_internal_token: str = Header(default="")) -> None:
    expected = os.getenv("INTERNAL_CALLBACK_TOKEN", "")
    if not expected or x_internal_token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _to_internal(req: WikiExtractRequest) -> InternalReq:
    """Convert Pydantic discriminated-union to the workflow's plain dataclass."""
    existing = None
    if getattr(req, "existingGraph", None):
        existing = Graph(
            nodes=[Node(**n) for n in req.existingGraph.nodes],
            edges=[Edge(**e) for e in req.existingGraph.edges],
        )
    lm = {
        "provider": req.byok.provider, "model": req.byok.model,
        "api_key": req.byok.apiKey, "api_base": req.byok.baseUrl,
    }
    if isinstance(req, WikiExtractMode):
        return InternalReq(
            mode="extract", notebook_id=req.notebookId, source_id=req.sourceId,
            user_id=req.userId, source_title=req.sourceTitle,
            source_content=req.sourceContent, existing_graph=existing,
            existing_node_labels=req.existingNodeLabels, source_map=req.sourceMap,
            lm=lm,
        )
    return InternalReq(
        mode="remove", notebook_id=req.notebookId, source_id=req.sourceId,
        user_id=req.userId, source_title=req.sourceTitle,
        existing_graph=existing, source_map=req.sourceMap, lm=lm,
    )


@router.post("/v1/workflows/wiki/extract", dependencies=[Depends(_verify_token)])
async def extract(req: WikiExtractRequest):
    try:
        result = await extract_wiki.ainvoke(_to_internal(req))
    except ValueError as exc:
        return JSONResponse(status_code=400, content={
            "error": {"code": "BAD_INPUT", "message": str(exc),
                       "providerId": req.byok.provider},
        })
    except Exception as exc:  # noqa: BLE001
        logger.exception("wiki_ingest extract failed")
        return JSONResponse(status_code=500, content={
            "error": {"code": "EXTRACTION_FAILED", "message": str(exc),
                       "providerId": req.byok.provider},
        })

    return {
        "normalizedTitle": result.normalized_title,
        "extraction": (
            None if result.extraction is None else {
                "normalizedTitle": result.extraction.normalized_title,
                "nodes": [n.__dict__ for n in result.extraction.nodes],
                "edges": [e.__dict__ for e in result.extraction.edges],
            }
        ),
        "extractionReport": result.extraction_report,
        "mergedGraph": {
            "nodes": [n.__dict__ for n in result.merged_graph.nodes],
            "edges": [e.__dict__ for e in result.merged_graph.edges],
        },
        "communities": {str(k): v for k, v in result.communities.items()},
        "communityPages": [
            {"slug": p.slug, "title": p.title,
             "markdown": p.markdown, "sourceIds": p.source_ids}
            for p in result.community_pages
        ],
        "indexPage": {
            "slug": result.index_page.slug,
            "title": result.index_page.title,
            "markdown": result.index_page.markdown,
            "sourceIds": result.index_page.source_ids,
        },
        "logEntry": result.log_entry,
    }
