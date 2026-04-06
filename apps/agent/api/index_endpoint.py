"""
Indexing endpoint for PageIndex tree generation.
Called by the Next.js frontend after source processing completes.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.pageindex_client import index_markdown

router = APIRouter()


class IndexRequest(BaseModel):
    source_id: str
    content: str
    title: str
    source_type: str


@router.post("/index")
async def index_source(request: IndexRequest):
    """Generate a PageIndex tree for a source document."""
    try:
        tree = index_markdown(
            markdown_content=request.content,
            title=request.title,
        )
        return tree
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
