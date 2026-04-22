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


import pytest

from hermes.registry import ToolRegistry


def test_registry_register_and_get():
    reg = ToolRegistry()
    tool_obj = object()
    reg.register(name="echo", toolset="test", tool=tool_obj)
    entry = reg.get_entry("echo")
    assert entry.name == "echo"
    assert entry.tool is tool_obj


def test_registry_get_entry_unknown_raises_keyerror():
    reg = ToolRegistry()
    with pytest.raises(KeyError):
        reg.get_entry("does_not_exist")


def test_registry_duplicate_name_overrides_with_warning(caplog):
    reg = ToolRegistry()
    reg.register(name="echo", toolset="a", tool=object())
    with caplog.at_level("WARNING"):
        reg.register(name="echo", toolset="b", tool=object())
    assert any("echo" in rec.message for rec in caplog.records)
    # Last registration wins
    assert reg.get_entry("echo").toolset == "b"


def test_registry_register_with_all_fields():
    reg = ToolRegistry()

    def _check() -> bool:
        return True

    reg.register(
        name="wiki_search",
        toolset="wiki",
        tool=object(),
        check_fn=_check,
        requires_env=("OPENAI_API_KEY",),
        frontend=False,
        description="Search",
    )
    entry = reg.get_entry("wiki_search")
    assert entry.check_fn is _check
    assert entry.requires_env == ("OPENAI_API_KEY",)
    assert entry.description == "Search"
