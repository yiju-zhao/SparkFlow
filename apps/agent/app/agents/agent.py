"""
RAG Agent using LangChain create_agent.
"""

from langchain.agents import create_agent
from langchain.tools import tool

from .prompts import RAG_AGENT_SYSTEM_PROMPT


@tool
def retrieve_documents(query: str) -> str:
    """Search the knowledge base for relevant documents.
    
    Args:
        query: The search query to find relevant documents.
    
    Returns:
        Relevant document content from the knowledge base.
    """
    import os
    from ragflow_sdk import RAGFlow
    
    api_key = os.getenv("RAGFLOW_API_KEY")
    base_url = os.getenv("RAGFLOW_BASE_URL", "http://localhost:9380")
    
    if not api_key:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."
    
    try:
        client = RAGFlow(api_key=api_key, base_url=base_url)
        # Note: dataset_ids will need to be passed via config in production
        dataset_ids = os.getenv("RAGFLOW_DATASET_IDS", "").split(",")
        dataset_ids = [d.strip() for d in dataset_ids if d.strip()]
        
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
            doc = getattr(chunk, 'document_name', '')
            results.append(f"[{doc}]\n{content}" if doc else content)
        
        return "\n\n---\n\n".join(results)
    except Exception as e:
        return f"Error retrieving documents: {e}"


# Create the RAG agent using LangChain create_agent
agent = create_agent(
    model="openai:gpt-4o",
    tools=[retrieve_documents],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
)
