"""
Prompt optimizer tools via MCP.

Configure via environment variable:
    PROMPT_OPTIMIZER_MCP_URL=http://host:port/mcp

Usage:
    from tools.prompt_optimizer import get_tools

    optimizer_tools = get_tools()
    agent = create_deep_agent(
        tools=[explore, search, probe] + optimizer_tools,
        ...
    )
"""

import asyncio
import logging
import os

logger = logging.getLogger(__name__)

PROMPT_OPTIMIZER_MCP_URL = os.getenv("PROMPT_OPTIMIZER_MCP_URL")


def get_tools() -> list:
    """Load prompt optimizer tools from MCP server.

    Reads URL from PROMPT_OPTIMIZER_MCP_URL environment variable.

    Returns:
        List of LangChain tools, or empty list if not configured
    """
    if not PROMPT_OPTIMIZER_MCP_URL:
        logger.info("PROMPT_OPTIMIZER_MCP_URL not set, skipping prompt optimizer tools")
        return []

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _load(PROMPT_OPTIMIZER_MCP_URL))
                return future.result()
        else:
            return loop.run_until_complete(_load(PROMPT_OPTIMIZER_MCP_URL))
    except RuntimeError:
        return asyncio.run(_load(PROMPT_OPTIMIZER_MCP_URL))


async def _load(url: str) -> list:
    from langchain_mcp_adapters.client import MultiServerMCPClient

    try:
        client = MultiServerMCPClient({
            "prompt_optimizer": {
                "transport": "streamable_http",
                "url": url,
            }
        })
        tools = await client.get_tools()
        logger.info(f"Loaded {len(tools)} prompt optimizer tools from {url}")
        return tools
    except Exception as e:
        logger.error(f"Failed to load prompt optimizer tools: {e}")
        return []
