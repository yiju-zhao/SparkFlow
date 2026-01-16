"""
RAGFlow retrieval tools for LangChain agents.
"""

import logging
import os

from langchain.tools import tool
from langchain_core.runnables import RunnableConfig
from ragflow_sdk import RAGFlow

logger = logging.getLogger(__name__)

# Module-level client cache
_ragflow_client = None


def _get_client():
    """Get or create RAGFlow client."""
    global _ragflow_client
    if _ragflow_client is None:
        api_key = os.getenv("RAGFLOW_API_KEY")
        base_url = os.getenv("RAGFLOW_BASE_URL", "http://localhost:9380")
        if api_key:
            _ragflow_client = RAGFlow(api_key=api_key, base_url=base_url)
    return _ragflow_client


@tool
def retrieve_documents(query: str, config: RunnableConfig) -> str:
    """Search the knowledge base for relevant documents.
    
    Args:
        query: The search query to find relevant documents.
    
    Returns:
        Relevant document chunks with [Document Name] (doc_id, chunk_id) metadata.
    """
    client = _get_client()
    if not client:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."
    
    dataset_ids = config.get("configurable", {}).get("dataset_ids", [])
    if not dataset_ids:
        return "No datasets configured for retrieval."
    
    try:
        chunks = client.retrieve(
            question=query,
            dataset_ids=dataset_ids,
            page_size=10,
        )
        if not chunks:
            return "No relevant documents found."
        
        results = []
        for chunk in chunks:
            content = getattr(chunk, 'content', str(chunk))
            doc_name = getattr(chunk, 'document_name', '')
            doc_id = getattr(chunk, 'document_id', '')
            chunk_id = getattr(chunk, 'id', '')
            
            # Format with metadata for context expansion
            header = f"[{doc_name}]" if doc_name else ""
            if doc_id and chunk_id:
                header += f" (doc_id: {doc_id}, chunk_id: {chunk_id})"
            
            results.append(f"{header}\n{content}" if header else content)
        
        return "\n\n---\n\n".join(results)
    except Exception as e:
        logger.error(f"Retrieval error: {e}")
        return f"Error: {e}"


@tool
def get_next_chunks(document_id: str, chunk_id: str, num_chunks: int = 3, config: RunnableConfig = None) -> str:
    """Get the next N chunks after a specific chunk in a document.
    
    Use this to expand context around a retrieved chunk by fetching
    subsequent chunks from the same document.
    
    Args:
        document_id: The ID of the document containing the chunk.
        chunk_id: The ID of the starting chunk.
        num_chunks: Number of chunks to retrieve after the target (default: 3).
    """
    client = _get_client()
    if not client:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."
    
    dataset_ids = config.get("configurable", {}).get("dataset_ids", []) if config else []
    if not dataset_ids:
        return "No datasets configured."
    
    try:
        # Find the dataset containing this document
        dataset = None
        for ds_id in dataset_ids:
            datasets = client.list_datasets(id=ds_id)
            if datasets:
                docs = datasets[0].list_documents(id=document_id)
                if docs:
                    dataset = datasets[0]
                    doc = docs[0]
                    break
        
        if not dataset or not doc:
            return f"Document {document_id} not found in configured datasets."
        
        # Get all chunks from the document (paginated)
        all_chunks = doc.list_chunks(page=1, page_size=100)
        
        # Find the target chunk and its position
        target_chunk = None
        for chunk in all_chunks:
            if chunk.id == chunk_id:
                target_chunk = chunk
                break
        
        if not target_chunk:
            return f"Chunk {chunk_id} not found in document."
        
        # Sort chunks by position (assuming position indicates order)
        sorted_chunks = sorted(all_chunks, key=lambda c: (
            getattr(c, 'position', [0]) or [0]
        ))
        
        # Find index of target chunk in sorted list
        target_idx = None
        for i, chunk in enumerate(sorted_chunks):
            if chunk.id == chunk_id:
                target_idx = i
                break
        
        if target_idx is None:
            return f"Could not determine position of chunk {chunk_id}."
        
        # Get the next N chunks
        next_chunks = sorted_chunks[target_idx + 1 : target_idx + 1 + num_chunks]
        
        if not next_chunks:
            return "No more chunks after the specified chunk."
        
        results = []
        for chunk in next_chunks:
            content = getattr(chunk, 'content', str(chunk))
            results.append(content)
        
        return "\n\n---\n\n".join(results)
        
    except Exception as e:
        logger.error(f"Get next chunks error: {e}")
        return f"Error: {e}"


@tool
def list_datasets(config: RunnableConfig = None) -> str:
    """List all available knowledge base datasets.
    
    Returns:
        A list of datasets with their IDs and names.
    """
    client = _get_client()
    if not client:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."
    
    try:
        datasets = client.list_datasets(page=1, page_size=100)
        if not datasets:
            return "No datasets found."
        
        results = []
        for ds in datasets:
            results.append(f"ID: {ds.id} | Name: {ds.name}")
        
        return "\n".join(results)
    except Exception as e:
        logger.error(f"List datasets error: {e}")
        return f"Error: {e}"


@tool
def list_documents(dataset_id: str = None, keywords: str = None, config: RunnableConfig = None) -> str:
    """List documents in a dataset.
    
    Args:
        dataset_id: Optional ID of the dataset to list documents from. 
                   If not provided, searches all configured datasets.
        keywords: Optional keywords to filter document titles.
    """
    client = _get_client()
    if not client:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."
    
    dataset_ids = config.get("configurable", {}).get("dataset_ids", []) if config else []
    target_ids = [dataset_id] if dataset_id else dataset_ids
    
    try:
        results = []
        for ds_id in target_ids:
            # We need to get the dataset object first
            datasets = client.list_datasets(id=ds_id)
            if not datasets:
                continue
            
            ds = datasets[0]
            docs = ds.list_documents(keywords=keywords, page=1, page_size=100)
            
            if docs:
                results.append(f"== Dataset: {ds.name} ({ds.id}) ==")
                for doc in docs:
                    results.append(f"- {doc.name} (ID: {doc.id}, Chunks: {doc.chunk_count}, Tokens: {doc.token_count})")
                results.append("")
        
        if not results:
            return "No documents found."
        
        return "\n".join(results)
    except Exception as e:
        logger.error(f"List documents error: {e}")
        return f"Error: {e}"


@tool
def list_chunks(document_id: str, page: int = 1, page_size: int = 10, config: RunnableConfig = None) -> str:
    """List chunks within a specific document.
    
    Args:
        document_id: The ID of the document to inspect.
        page: Page number for pagination (default: 1).
        page_size: Number of chunks per page (default: 10).
    """
    client = _get_client()
    if not client:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."
    
    dataset_ids = config.get("configurable", {}).get("dataset_ids", []) if config else []
    if not dataset_ids:
        return "No datasets configured."
    
    try:
        # Find the dataset containing this document
        dataset = None
        for ds_id in dataset_ids:
            datasets = client.list_datasets(id=ds_id)
            if datasets:
                docs = datasets[0].list_documents(id=document_id)
                if docs:
                    dataset = datasets[0]
                    doc = docs[0]
                    break
        
        if not dataset or not doc:
            return f"Document {document_id} not found in configured datasets."
        
        chunks = doc.list_chunks(page=page, page_size=page_size)
        if not chunks:
            return "No chunks found in this range."
        
        results = [f"== Chunks for {doc.name} (Page {page}) =="]
        for chunk in chunks:
            content = getattr(chunk, 'content', str(chunk))
            chunk_id = getattr(chunk, 'id', 'unknown')
            results.append(f"[Chunk ID: {chunk_id}]\n{content}\n")
        
        return "\n---\n".join(results)
    except Exception as e:
        logger.error(f"List chunks error: {e}")
        return f"Error: {e}"
