"""
RAG Agent using LangChain create_agent.
"""

import os
from typing import Annotated

from langchain.agents import create_agent
from langchain.tools import tool
from langchain_core.runnables import RunnableConfig


# System prompt for RAG agent
RAG_AGENT_SYSTEM_PROMPT = """You are a skilled AI research assistant for SparkFlow with expertise in knowledge retrieval.

## Retrieval Strategies

When answering questions, use the retrieve_documents tool strategically:

1. **Extract key concepts** - Identify the main entities, topics, and technical terms from the user's question
2. **Query reformulation** - Transform questions into effective search queries (use keywords, not full sentences)
3. **Multi-angle search** - If initial results are insufficient, try different phrasings or related terms
4. **Follow-up retrieval** - When you find partial information, search for missing details

## Response Guidelines

- Always retrieve before answering questions that may need specific knowledge
- Synthesize information from multiple retrieved chunks into coherent answers
- Cite sources when making claims: [Document Name]
- If no relevant information is found, say so honestly rather than guessing
- Use markdown formatting for readability"""


@tool
def retrieve_documents(
    query: str,
    config: RunnableConfig,
) -> str:
    """Search the knowledge base for relevant documents.
    
    Args:
        query: The search query to find relevant documents.
    
    Returns:
        Relevant document content from the knowledge base.
    """
    from ragflow_sdk import RAGFlow
    
    api_key = os.getenv("RAGFLOW_API_KEY")
    base_url = os.getenv("RAGFLOW_BASE_URL", "http://localhost:9380")
    
    if not api_key:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."
    
    # Get dataset_ids from runtime config or fallback to env var
    dataset_ids = config.get("configurable", {}).get("dataset_ids", [])
    if not dataset_ids:
        dataset_ids = os.getenv("RAGFLOW_DATASET_IDS", "").split(",")
        dataset_ids = [d.strip() for d in dataset_ids if d.strip()]
    
    if not dataset_ids:
        return "No datasets configured for retrieval."
    
    try:
        client = RAGFlow(api_key=api_key, base_url=base_url)
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

