"""
LangChain tools for RAG agent using MCP (Model Context Protocol).

Provides tool wrappers around RAGFlow MCP server following LangGraph
best practices. Uses langchain-mcp-adapters to connect to the RAGFlow
MCP server at http://localhost:9382/mcp/.
"""

import logging
from typing import Any

from langchain_mcp_adapters.client import MultiServerMCPClient

logger = logging.getLogger(__name__)


async def create_mcp_retrieval_tools(
    dataset_ids: list[str],
    mcp_server_url: str = "http://localhost:9382/mcp/",
    document_ids: list[str] | None = None,
):
    """
    Factory function to create MCP-based retrieval tools.

    Creates LangChain tools that connect to the RAGFlow MCP server and use
    the ragflow_retrieval tool provided by the server.

    Args:
        dataset_ids: List of dataset IDs to search
        mcp_server_url: URL of the RAGFlow MCP server (default: http://localhost:9382/mcp/)
        document_ids: Optional list of specific document IDs to search within

    Returns:
        List of LangChain tools from the MCP server that can be used with LangGraph agents

    Example:
        >>> tools = await create_mcp_retrieval_tools(
        ...     dataset_ids=["bc4177924a7a11f09eff238aa5c10c94"]
        ... )
        >>> # Use tools with LangGraph agent
        >>> agent = create_agent("claude-sonnet-4-5-20250929", tools)
    """
    logger.info(
        f"[create_mcp_retrieval_tools] Connecting to MCP server: {mcp_server_url}"
    )
    logger.info(f"[create_mcp_retrieval_tools] Dataset IDs: {dataset_ids}")

    # Configure MCP client for RAGFlow server
    client = MultiServerMCPClient(
        {
            "ragflow": {
                "transport": "http",  # HTTP-based remote server
                "url": mcp_server_url,
            }
        }
    )

    try:
        # Get all available tools from the MCP server
        tools = await client.get_tools()
        logger.info(
            f"[create_mcp_retrieval_tools] Retrieved {len(tools)} tools from MCP server"
        )

        # Store metadata on tools for later use
        for tool in tools:
            # Store default parameters that will be used during invocations
            tool._default_dataset_ids = dataset_ids
            tool._default_document_ids = document_ids or []

        return tools

    except Exception as e:
        logger.error(
            f"[create_mcp_retrieval_tools] Failed to connect to MCP server: {e}"
        )
        raise
