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

from dotenv import load_dotenv
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase
from langchain_openai import ChatOpenAI
from mcp.server.fastmcp import FastMCP

# Load environment variables
load_dotenv()

# Initialize FastMCP server
mcp = FastMCP("HubMCPServer", stateless_http=True, json_response=True)

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


@mcp.tool()
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
    from langchain.agents import AgentExecutor, create_tool_calling_agent
    from langchain_core.prompts import ChatPromptTemplate

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """You are a SQL expert assistant for academic conference data.
Use the available tools to answer questions about conferences, sessions, venues, and publications.

The database has these main tables:
- venues: Conference venues (e.g., CVPR, NeurIPS, ICCV)
- instances: Yearly occurrences of conferences
- conference_sessions: Individual sessions/talks within conference instances

Always return structured data that can be displayed in tables or charts.
If the result is a list, return it as an array of objects.
If the result is a count/aggregation, return it as a single object with the value.""",
            ),
            ("human", "{question}"),
            ("placeholder", "{agent_scratchpad}"),
        ]
    )

    agent = create_tool_calling_agent(llm, toolkit_tools, prompt)
    executor = AgentExecutor(agent=agent, tools=toolkit_tools, verbose=True)

    try:
        result = executor.invoke({"question": question})
        output = result.get("output", {})

        # Parse output if it's a string
        if isinstance(output, str):
            try:
                output = json.loads(output)
            except json.JSONDecodeError:
                output = {"result": output}

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
    mcp.run(transport="streamable-http", port=3108)
