"""MCP Server for Research Hub with SQLDatabaseToolkit.

This server provides dynamic database query capabilities via LangChain's
SQLDatabaseToolkit, allowing natural language to SQL translation with
automatic schema discovery.

The server also serves HTML templates for generative UI components
(tables, charts) that are rendered by CopilotKit's MCPAppsMiddleware.

Usage:
    cd apps/mcp-server && python server.py

The server runs on port 3108 with streamable-http transport.
"""

import json
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langchain.agents import create_agent
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase
from langchain_openai import ChatOpenAI
from mcp.server.fastmcp import FastMCP

# Load environment variables
load_dotenv()

# Initialize FastMCP server
mcp = FastMCP("HubMCPServer", stateless_http=True, json_response=True, port=3108)

# Initialize database connection
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise ValueError("DATABASE_URL environment variable is required")

db = SQLDatabase.from_uri(DATABASE_URL)

# Initialize LLM for SQLDatabaseToolkit
llm = ChatOpenAI(model="gpt-4o", temperature=0)

# Create SQLDatabaseToolkit
toolkit = SQLDatabaseToolkit(db=db, llm=llm)

# Get toolkit tools for internal use
# Available: sql_db_query, sql_db_schema, sql_db_list_tables, sql_db_query_checker
toolkit_tools = toolkit.get_tools()


def get_ui_path(filename: str) -> Path:
    """Get the path to a UI template file."""
    return Path(__file__).parent / "ui" / filename


def _extract_text(content: Any) -> str:
    """Extract plain text from LangChain message content blocks."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
                continue
            if isinstance(item, dict):
                if item.get("type") == "text" and isinstance(item.get("text"), str):
                    parts.append(item["text"])
                    continue
                if isinstance(item.get("content"), str):
                    parts.append(item["content"])
        return "\n".join(part for part in parts if part).strip()
    return str(content)


def _coerce_to_table_payload(output: Any, question: str) -> dict[str, Any]:
    """Normalize model output into the table UI contract."""
    parsed = output
    if isinstance(output, str):
        stripped = output.strip()
        if stripped:
            try:
                parsed = json.loads(stripped)
            except json.JSONDecodeError:
                parsed = {"result": stripped}
        else:
            parsed = {}

    title = question.strip().rstrip("?") or "Query results"

    if isinstance(parsed, list):
        if parsed and isinstance(parsed[0], dict):
            return {
                "title": title,
                "columns": list(parsed[0].keys()),
                "rows": parsed,
            }
        return {"title": title, "columns": ["result"], "rows": [{"result": value} for value in parsed]}

    if isinstance(parsed, dict):
        rows = parsed.get("rows")
        if isinstance(rows, list):
            columns = parsed.get("columns")
            if not isinstance(columns, list) and rows and isinstance(rows[0], dict):
                columns = list(rows[0].keys())
            return {
                "title": parsed.get("title") or title,
                "columns": columns or [],
                "rows": rows,
            }
        result = parsed.get("result")
        if isinstance(result, list):
            if result and isinstance(result[0], dict):
                return {
                    "title": parsed.get("title") or title,
                    "columns": list(result[0].keys()),
                    "rows": result,
                }
            return {
                "title": parsed.get("title") or title,
                "columns": ["result"],
                "rows": [{"result": value} for value in result],
            }
        if parsed:
            return {
                "title": parsed.get("title") or title,
                "columns": list(parsed.keys()),
                "rows": [parsed],
            }
        return {"title": title, "columns": [], "rows": []}

    if parsed is None:
        return {"title": title, "columns": [], "rows": []}

    return {"title": title, "columns": ["result"], "rows": [{"result": parsed}]}


@mcp.tool(meta={"ui/resourceUri": "ui://table"})
def query_conferences(question: str) -> dict:
    """Query the conference database with natural language.

    Use this tool to answer questions about conferences, sessions, venues,
    and related data. The tool uses LangChain's SQLDatabaseToolkit to
    generate and execute SQL queries dynamically.

    Examples:
        - "List all CVPR conferences"
        - "Show sessions about transformers at NeurIPS 2024"
        - "Count sessions by topic"
        - "Find venues with most publications"

    Args:
        question: Natural language question about conference data

    Returns:
        Structured data with UI reference for rendering
    """
    system_prompt = """You are a SQL expert assistant for academic conference data.
Use the available tools to answer questions about conferences, sessions, venues, and publications.

The database has these main tables:
- venues: Conference venues (e.g., CVPR, NeurIPS, ICCV)
- instances: Yearly occurrences of conferences
- conference_sessions: Individual sessions/talks within conference instances

Always use the SQL tools for database questions. Do not answer from prior knowledge.
Return valid JSON only. Prefer this shape:
{"title": "Short title", "rows": [ ... ]}
If the result is a single count or aggregate, return:
{"title": "Short title", "rows": [{"count": 123}]}
If no rows match, return:
{"title": "Short title", "rows": []}"""

    agent = create_agent(
        model=llm,
        tools=toolkit_tools,
        system_prompt=system_prompt,
    )

    try:
        result = agent.invoke({"messages": [{"role": "user", "content": question}]})
        messages = result.get("messages", [])
        output_text = _extract_text(messages[-1].content if messages else "")
        output = _coerce_to_table_payload(output_text, question)

        return {
            "content": [{"type": "text", "text": json.dumps(output)}],
            "structuredContent": output,
            "_meta": {"ui": {"resourceUri": "ui://table"}},
        }
    except Exception as e:
        error_result = {"error": str(e)}
        return {
            "content": [{"type": "text", "text": json.dumps(error_result)}],
            "structuredContent": error_result,
            "_meta": {"ui": {"resourceUri": "ui://table"}},
        }


@mcp.resource("ui://table")
def table_template() -> str:
    """HTML template for generative table UI.

    This template receives data via postMessage and renders a styled table.
    CopilotKit's MCPAppsMiddleware loads this template and passes data to it.
    """
    template_path = get_ui_path("table.html")
    if template_path.exists():
        return template_path.read_text()
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Table UI</title></head>
    <body>
        <div id="loading">Loading table template...</div>
        <script>
            window.addEventListener('message', (event) => {
                document.getElementById('loading').textContent =
                    'Table template will be loaded here. Data: ' +
                    JSON.stringify(event.data);
            });
        </script>
    </body>
    </html>
    """


@mcp.resource("ui://chart")
def chart_template() -> str:
    """HTML template for generative chart UI with Chart.js.

    This template receives data via postMessage and renders interactive charts.
    Supports bar, line, and pie chart types.
    """
    template_path = get_ui_path("chart.html")
    if template_path.exists():
        return template_path.read_text()
    return """
    <!DOCTYPE html>
    <html>
    <head><title>Chart UI</title></head>
    <body>
        <div id="loading">Loading chart template...</div>
        <script>
            window.addEventListener('message', (event) => {
                document.getElementById('loading').textContent =
                    'Chart template will be loaded here. Data: ' +
                    JSON.stringify(event.data);
            });
        </script>
    </body>
    </html>
    """


if __name__ == "__main__":
    print("Starting Hub MCP Server on port 3108...")
    mcp.run(transport="streamable-http")
