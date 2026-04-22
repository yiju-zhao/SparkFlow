"""Smoke-test tool. Not attached to any surface's toolset in production —
lives in an ``_test`` toolset so nothing can accidentally expose it to an
LLM. Its sole purpose is to let tests verify that auto-discovery + registry
round-trip works end to end.
"""

from langchain_core.tools import tool

from hermes.registry import registry


@tool
def echo(text: str) -> str:
    """Return the input text verbatim. Used only for harness smoke tests."""

    return text


registry.register(
    name="echo",
    toolset="_test",
    tool=echo,
    description="Return the input text verbatim (test-only).",
)
