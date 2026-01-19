"""
RAGFlow retrieval tools for LangChain agents.

Architecture:
- Internal Functions (_函数): Atomic RAGFlow SDK operations, invisible to Agent
- Tools Layer (3 工具): Composite capabilities visible to Agent
  - explore(): Understand knowledge base structure
  - search(): Find relevant information
  - probe(): Validate chunk relevance by examining surrounding context
"""

import logging
import os
from typing import Literal

from langchain.tools import tool
from langchain_core.runnables import RunnableConfig
from ragflow_sdk import RAGFlow

logger = logging.getLogger(__name__)


# =============================================================================
# Internal Functions (原子能力 - Agent 不可见)
# =============================================================================

_ragflow_client = None


def _get_client() -> RAGFlow | None:
    """Get or create RAGFlow client."""
    global _ragflow_client
    if _ragflow_client is None:
        api_key = os.getenv("RAGFLOW_API_KEY")
        base_url = os.getenv("RAGFLOW_BASE_URL", "http://localhost:9380")
        if api_key:
            _ragflow_client = RAGFlow(api_key=api_key, base_url=base_url)
    return _ragflow_client


def _list_datasets(client: RAGFlow) -> list:
    """List all datasets."""
    return client.list_datasets(page=1, page_size=100)


def _list_documents(client: RAGFlow, dataset_ids: list[str]) -> dict:
    """List documents in specified datasets. Returns {dataset: [docs]}."""
    result = {}
    for ds_id in dataset_ids:
        datasets = client.list_datasets(id=ds_id)
        if datasets:
            ds = datasets[0]
            docs = ds.list_documents(page=1, page_size=100)
            result[ds] = docs
    return result


def _retrieve(client: RAGFlow, query: str, dataset_ids: list[str]) -> list:
    """Retrieve chunks matching query from datasets."""
    toc_enhance = os.getenv("RAGFLOW_TOC_ENHANCE", "false").lower() == "true"
    return client.retrieve(
        question=query,
        dataset_ids=dataset_ids,
        page_size=10,
        toc_enhance=toc_enhance,
    )


def _get_chunks_around(
    client: RAGFlow,
    dataset_ids: list[str],
    chunk_id: str,
    direction: str,
    count: int
) -> tuple[list, str | None]:
    """Get chunks around a target chunk. Returns (chunks, doc_name)."""
    # Find the document containing this chunk
    for ds_id in dataset_ids:
        datasets = client.list_datasets(id=ds_id)
        if not datasets:
            continue
        
        # Search all documents in dataset for the chunk
        docs = datasets[0].list_documents(page=1, page_size=100)
        for doc in docs:
            all_chunks = doc.list_chunks(page=1, page_size=200)
            
            # Find target chunk
            target_idx = None
            for i, chunk in enumerate(all_chunks):
                if chunk.id == chunk_id:
                    target_idx = i
                    break
            
            if target_idx is not None:
                # Sort by position
                sorted_chunks = sorted(all_chunks, key=lambda c: (
                    getattr(c, 'position', [0]) or [0]
                ))
                
                # Find target in sorted list
                for i, chunk in enumerate(sorted_chunks):
                    if chunk.id == chunk_id:
                        target_idx = i
                        break
                
                # Get surrounding chunks
                if direction == "before":
                    start = max(0, target_idx - count)
                    result = sorted_chunks[start:target_idx]
                elif direction == "after":
                    result = sorted_chunks[target_idx + 1:target_idx + 1 + count]
                else:  # both
                    start = max(0, target_idx - count)
                    end = target_idx + 1 + count
                    result = sorted_chunks[start:target_idx] + sorted_chunks[target_idx + 1:end]
                
                return result, doc.name
    
    return [], None


# =============================================================================
# Tools Layer (复合能力 - Agent 可见)
# =============================================================================

@tool
def explore(config: RunnableConfig = None) -> str:
    """Explore the knowledge base to see available documents.
    
    Use this to understand what sources are available before searching.
    """
    client = _get_client()
    if not client:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."
    
    dataset_ids = config.get("configurable", {}).get("dataset_ids", []) if config else []
    if not dataset_ids:
        return "No datasets configured."
    
    try:
        results = ["== Available Documents ==\n"]
        docs_by_dataset = _list_documents(client, dataset_ids)
        
        for ds, docs in docs_by_dataset.items():
            results.append(f"[{ds.name}]")
            for doc in docs[:15]:  # Limit to 15 per dataset
                results.append(f"  - {doc.name} ({doc.chunk_count} chunks)")
            if len(docs) > 15:
                results.append(f"  ... and {len(docs) - 15} more")
            results.append("")
        
        if len(results) == 1:
            return "No documents found in configured datasets."
        
        return "\n".join(results)
        
    except Exception as e:
        logger.error(f"Explore error: {e}")
        return f"Error: {e}"


@tool
def search(query: str, config: RunnableConfig) -> str:
    """Search the knowledge base for relevant information.

    Returns chunks with chunk IDs that can be used with probe() to validate relevance.

    Args:
        query: Keywords or question to search for
    """
    client = _get_client()
    if not client:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."
    
    dataset_ids = config.get("configurable", {}).get("dataset_ids", [])
    if not dataset_ids:
        return "No datasets configured. Use explore() to see available datasets."
    
    try:
        chunks = _retrieve(client, query, dataset_ids)
        if not chunks:
            return "No relevant information found. Try different keywords."
        
        results = []
        for chunk in chunks:
            content = getattr(chunk, 'content', str(chunk))
            doc_name = getattr(chunk, 'document_name', 'Unknown')
            chunk_id = getattr(chunk, 'id', '')
            
            # Format: [Doc Name] #chunk_id
            header = f"[{doc_name}] #{chunk_id}" if chunk_id else f"[{doc_name}]"
            results.append(f"{header}\n{content}")
        
        return "\n\n---\n\n".join(results)
        
    except Exception as e:
        logger.error(f"Search error: {e}")
        return f"Error: {e}"


@tool
def probe(
    chunk_id: str,
    direction: str = "both",
    count: int = 2,
    config: RunnableConfig = None
) -> str:
    """Probe surrounding context to validate chunk relevance.

    Use this to verify a search result is truly relevant before citing it.
    Check if the surrounding context matches the question's intent.

    Args:
        chunk_id: The chunk ID from search results (e.g., "abc123")
        direction: "before", "after", or "both" (default)
        count: Number of chunks to retrieve (default: 2)
    """
    client = _get_client()
    if not client:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."
    
    dataset_ids = config.get("configurable", {}).get("dataset_ids", []) if config else []
    if not dataset_ids:
        return "No datasets configured."
    
    # Validate direction
    if direction not in ("before", "after", "both"):
        return f"Invalid direction '{direction}'. Use 'before', 'after', or 'both'."
    
    try:
        chunks, doc_name = _get_chunks_around(client, dataset_ids, chunk_id, direction, count)
        
        if not chunks:
            return f"No {direction} chunks found for #{chunk_id}."
        
        results = [f"== Probed Context ({direction} #{chunk_id}) from [{doc_name}] ==\n"]
        for chunk in chunks:
            content = getattr(chunk, 'content', str(chunk))
            results.append(content)
        
        return "\n\n---\n\n".join(results)
        
    except Exception as e:
        logger.error(f"Extend error: {e}")
        return f"Error: {e}"
