"""Render-only MCP server for Research Hub workflow and presentation apps."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

load_dotenv()

mcp = FastMCP("HubRenderMCPServer", stateless_http=True, json_response=True, port=3108)

ChartType = Literal["bar", "line", "pie"]


def get_ui_path(filename: str) -> Path:
    return Path(__file__).parent / "ui" / filename


def _build_mcp_result(payload: dict[str, Any], resource_uri: str) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}],
        "structuredContent": payload,
        "_meta": {"ui": {"resourceUri": resource_uri}},
    }


@mcp.tool(meta={"ui/resourceUri": "ui://table"})
def record_table(
    title: str,
    columns: list[str] | None = None,
    rows: list[dict[str, Any]] | None = None,
    subtitle: str | None = None,
    row_drilldown_prompt_template: str | None = None,
) -> dict[str, Any]:
    """Render structured rows as a table."""
    safe_rows = rows or []
    safe_columns = columns or (list(safe_rows[0].keys()) if safe_rows else [])
    return _build_mcp_result(
        {
            "title": title,
            "subtitle": subtitle,
            "columns": safe_columns,
            "rows": safe_rows,
            "rowDrilldownPromptTemplate": row_drilldown_prompt_template,
        },
        "ui://table",
    )


@mcp.tool(meta={"ui/resourceUri": "ui://chart"})
def stats_chart(
    title: str,
    labels: list[str],
    values: list[float | int],
    chart_type: ChartType = "bar",
    subtitle: str | None = None,
    colors: list[str] | None = None,
    drilldown_prompt_template: str | None = None,
) -> dict[str, Any]:
    """Render aggregate values as a chart."""
    return _build_mcp_result(
        {
            "title": title,
            "subtitle": subtitle,
            "type": chart_type,
            "chartType": chart_type,
            "labels": labels,
            "values": values,
            "colors": colors,
            "drilldownPromptTemplate": drilldown_prompt_template,
        },
        "ui://chart",
    )


@mcp.tool(meta={"ui/resourceUri": "ui://stat-card"})
def stat_card(
    title: str, value: str | int | float, subtitle: str | None = None
) -> dict[str, Any]:
    """Render a single KPI card."""
    return _build_mcp_result(
        {"title": title, "value": value, "subtitle": subtitle},
        "ui://stat-card",
    )


@mcp.tool(meta={"ui/resourceUri": "ui://select-value"})
def select_value_app(
    title: str,
    field: str,
    options: list[dict[str, Any]] | list[str],
    instruction: str | None = None,
    confirm_label: str = "Use Selection",
    continue_prompt_template: str | None = None,
    cancel_prompt: str | None = None,
) -> dict[str, Any]:
    """Render an interactive selection list for ambiguous values."""
    normalized_options: list[dict[str, Any]] = []
    for option in options:
        if isinstance(option, str):
            normalized_options.append({"label": option, "value": option})
            continue
        normalized_options.append(
            {
                "label": option.get("label")
                or option.get("value")
                or option.get("name")
                or "",
                "value": option.get("value")
                or option.get("label")
                or option.get("name")
                or "",
                "count": option.get("count"),
                "description": option.get("description"),
            }
        )
    return _build_mcp_result(
        {
            "title": title,
            "field": field,
            "instruction": instruction,
            "confirmLabel": confirm_label,
            "continuePromptTemplate": continue_prompt_template,
            "cancelPrompt": cancel_prompt,
            "options": normalized_options,
        },
        "ui://select-value",
    )


@mcp.tool(meta={"ui/resourceUri": "ui://confirm-action"})
def confirm_action_app(
    title: str,
    summary: str,
    details: list[str] | None = None,
    confirm_label: str = "Continue",
    cancel_label: str = "Cancel",
    continue_message: str | None = None,
    cancel_message: str | None = None,
) -> dict[str, Any]:
    """Render a confirmation card for high-signal next steps."""
    return _build_mcp_result(
        {
            "title": title,
            "summary": summary,
            "details": details or [],
            "confirmLabel": confirm_label,
            "cancelLabel": cancel_label,
            "continueMessage": continue_message,
            "cancelMessage": cancel_message,
        },
        "ui://confirm-action",
    )


@mcp.resource("ui://table")
def table_template() -> str:
    return get_ui_path("table.html").read_text()


@mcp.resource("ui://chart")
def chart_template() -> str:
    return get_ui_path("chart.html").read_text()


@mcp.resource("ui://stat-card")
def stat_card_template() -> str:
    return get_ui_path("stat-card.html").read_text()


@mcp.resource("ui://select-value")
def select_value_template() -> str:
    return get_ui_path("select-value.html").read_text()


@mcp.resource("ui://confirm-action")
def confirm_action_template() -> str:
    return get_ui_path("confirm-action.html").read_text()


if __name__ == "__main__":
    print("Starting Hub render MCP server on port 3108...")
    mcp.run(transport="streamable-http")
