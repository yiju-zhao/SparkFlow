"""
RAGFlow retrieval tool for LangChain agents.
"""

import logging
import os

from langchain.tools import tool
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


def create_retrieval_tool(dataset_ids: list[str], document_ids: list[str] = None, top_k: int = 10):
    """Create a retrieval tool bound to specific datasets."""
    
    @tool
    def retrieve_documents(query: str) -> str:
        """Search the knowledge base for relevant documents."""
        client = _get_client()
        if not client:
            return "RAGFlow not configured. Set RAGFLOW_API_KEY."
        
        try:
            chunks = client.retrieve(
                question=query,
                dataset_ids=dataset_ids,
                document_ids=document_ids,
                page_size=top_k,
            )
            if not chunks:
                return "No relevant documents found."
            
            results = []
            for chunk in chunks:
                content = getattr(chunk, 'content', str(chunk))
                doc = getattr(chunk, 'document_name', '')
                results.append(f"[{doc}]\n{content}" if doc else content)
            
            return "\n\n---\n\n".join(results)
        except Exception as e:
            logger.error(f"Retrieval error: {e}")
            return f"Error: {e}"
    
    return retrieve_documents
