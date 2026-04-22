"""Tests for hermes.registry."""

from hermes.registry import ToolEntry


def test_tool_entry_creation_minimal():
    entry = ToolEntry(
        name="echo",
        toolset="test",
        tool=object(),  # placeholder; real tool in later tests
    )
    assert entry.name == "echo"
    assert entry.toolset == "test"
    assert entry.check_fn is None
    assert entry.requires_env == ()
    assert entry.frontend is False
    assert entry.requires_approval is False
    assert entry.description == ""


def test_tool_entry_creation_full():
    def _check() -> bool:
        return True

    tool_obj = object()
    entry = ToolEntry(
        name="wiki_search",
        toolset="wiki",
        tool=tool_obj,
        check_fn=_check,
        requires_env=("OPENAI_API_KEY",),
        frontend=False,
        requires_approval=False,
        description="Search the notebook wiki.",
    )
    assert entry.check_fn is _check
    assert entry.requires_env == ("OPENAI_API_KEY",)
    assert entry.description == "Search the notebook wiki."
    assert entry.tool is tool_obj


def test_tool_entry_uses_slots():
    entry = ToolEntry(name="x", toolset="t", tool=object())
    # slots means we can't assign arbitrary attributes
    try:
        entry.unknown_attr = 1  # type: ignore[attr-defined]
    except (AttributeError, TypeError):
        return
    raise AssertionError("ToolEntry should use __slots__ and reject unknown attrs")
