"""Frontend UI tools for hub generative UI rendering via CopilotKit."""

from __future__ import annotations

from typing import Any, Literal

from langchain.tools import tool


@tool
def show_stat_card(
    title: str,
    value: str | int | float,
    subtitle: str | None = None,
) -> dict[str, Any]:
    """Display a single KPI metric card in the chat.

    Use this to highlight a key number or statistic, such as a total count,
    percentage, or other scalar metric. The card renders prominently in the
    chat UI as a visual summary tile.

    Args:
        title: Label describing what the metric represents.
        value: The numeric or string value to display.
        subtitle: Optional secondary line with context or units.
    """
    return {"title": title, "value": value, "subtitle": subtitle}


@tool
def show_table(
    title: str,
    columns: list[str] | None = None,
    rows: list[dict[str, Any]] | None = None,
    row_drilldown_prompt_template: str | None = None,
) -> dict[str, Any]:
    """Display a sortable data table in the chat.

    Use this to present structured tabular data such as publication lists,
    session schedules, or venue rankings. Columns are inferred from the first
    row when not provided.

    Args:
        title: Heading displayed above the table.
        columns: Ordered list of column names. Inferred from first row if omitted.
        rows: List of row dicts, each keyed by column name.
        row_drilldown_prompt_template: Optional template string with ``{row}``
            placeholder. When provided, each row becomes clickable and sends
            this prompt (with the row substituted) back to the agent.
    """
    safe_rows = rows or []
    safe_columns = columns or (list(safe_rows[0].keys()) if safe_rows else [])
    return {
        "title": title,
        "columns": safe_columns,
        "rows": safe_rows,
        "rowDrilldownPromptTemplate": row_drilldown_prompt_template,
    }


@tool
def show_chart(
    title: str,
    labels: list[str],
    values: list[int | float],
    chart_type: Literal["bar", "line", "pie"] = "bar",
    subtitle: str | None = None,
    colors: list[str] | None = None,
    drilldown_prompt_template: str | None = None,
) -> dict[str, Any]:
    """Display a chart (bar, line, or pie) in the chat.

    Use this to visualise aggregated or time-series data. Labels and values
    must be the same length. Prefer bar for comparisons, line for trends, and
    pie for share/composition breakdowns.

    Args:
        title: Chart heading.
        labels: Category labels or x-axis tick values.
        values: Numeric values corresponding to each label.
        chart_type: One of ``"bar"``, ``"line"``, or ``"pie"``.
        subtitle: Optional descriptive subheading below the title.
        colors: Optional list of hex or CSS color strings, one per data point.
        drilldown_prompt_template: Optional template with ``{label}`` and
            ``{value}`` placeholders. When provided, clicking a data point
            sends this prompt back to the agent.
    """
    return {
        "title": title,
        "subtitle": subtitle,
        "chartType": chart_type,
        "labels": labels,
        "values": values,
        "colors": colors,
        "drilldownPromptTemplate": drilldown_prompt_template,
    }


@tool
def show_select(
    title: str,
    field: str,
    options: list[dict[str, Any]],
    instruction: str | None = None,
    confirm_label: str = "Use Selection",
    continue_prompt_template: str | None = None,
    cancel_prompt: str | None = None,
) -> dict[str, Any]:
    """Display an interactive selection list for ambiguous filter values.

    Use this when the user's query is ambiguous and you need them to pick from
    a known set of values (e.g. selecting the correct venue name). Each option
    dict should have at least a ``label`` key and any additional metadata to
    display.

    Args:
        title: Heading for the selection widget.
        field: The filter field name being disambiguated (e.g. ``"venue"``).
        options: List of option dicts. Each must have a ``label`` key.
        instruction: Optional helper text shown above the options.
        confirm_label: Button label to submit the selection.
        continue_prompt_template: Template with ``{selection}`` placeholder
            sent to the agent after the user confirms.
        cancel_prompt: Prompt sent to the agent if the user cancels.
    """
    return {
        "title": title,
        "field": field,
        "instruction": instruction,
        "confirmLabel": confirm_label,
        "continuePromptTemplate": continue_prompt_template,
        "cancelPrompt": cancel_prompt,
        "options": options,
    }


@tool
def show_confirm(
    title: str,
    summary: str,
    details: list[str] | None = None,
    confirm_label: str = "Continue",
    cancel_label: str = "Cancel",
    continue_message: str | None = None,
    cancel_message: str | None = None,
) -> dict[str, Any]:
    """Display a confirmation card for a high-signal next step.

    Use this to propose an action to the user (e.g. running a heavy query,
    navigating to a page, or exporting data) and let them confirm or cancel
    before proceeding.

    Args:
        title: Short action title.
        summary: One-sentence description of what will happen.
        details: Optional bullet points with additional context.
        confirm_label: Label for the confirm button.
        cancel_label: Label for the cancel button.
        continue_message: Message sent to the agent when the user confirms.
        cancel_message: Message sent to the agent when the user cancels.
    """
    return {
        "title": title,
        "summary": summary,
        "details": details or [],
        "confirmLabel": confirm_label,
        "cancelLabel": cancel_label,
        "continueMessage": continue_message,
        "cancelMessage": cancel_message,
    }


@tool
def show_navigation(pages: list[dict[str, Any]]) -> dict[str, Any]:
    """Display clickable page links to guide the user to relevant Research Hub pages.

    Use this to surface direct navigation links when the user's intent maps to
    one or more specific pages in the Research Hub. Each page dict should
    include at minimum ``title`` and ``url`` keys, and optionally
    ``description``.

    Args:
        pages: List of page dicts. Each should have ``title``, ``url``, and
            optionally ``description`` keys.
    """
    return {"pages": pages}


HUB_UI_TOOLS = [
    show_stat_card,
    show_table,
    show_chart,
    show_select,
    show_confirm,
    show_navigation,
]


# --- hermes.registry self-registration (P2) -------------------------------
# Individual top-level call trips the AST discovery gate; rest via loop.
# NOTE: frontend=True — these tools are NOT executed server-side. The LLM's
# AIMessage tool_call reaches the client via the SDK and the frontend
# renders the call args as a React component.
from hermes.registry import registry

registry.register(
    name=HUB_UI_TOOLS[0].name,
    toolset="ui",
    tool=HUB_UI_TOOLS[0],
    frontend=True,
    description=getattr(HUB_UI_TOOLS[0], "description", "") or "",
)

for _t in HUB_UI_TOOLS[1:]:
    registry.register(
        name=_t.name,
        toolset="ui",
        tool=_t,
        frontend=True,
        description=getattr(_t, "description", "") or "",
    )
