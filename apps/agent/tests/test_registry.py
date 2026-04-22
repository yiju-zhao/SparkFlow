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


def test_get_tools_filters_by_toolset():
    reg = ToolRegistry()
    t1 = object()
    t2 = object()
    t3 = object()
    reg.register(name="a", toolset="wiki", tool=t1)
    reg.register(name="b", toolset="hub", tool=t2)
    reg.register(name="c", toolset="wiki", tool=t3)
    tools = reg.get_tools(toolset={"wiki"})
    assert set(id(t) for t in tools) == {id(t1), id(t3)}


def test_get_tools_multi_toolset():
    reg = ToolRegistry()
    t1, t2, t3 = object(), object(), object()
    reg.register(name="a", toolset="wiki", tool=t1)
    reg.register(name="b", toolset="hub", tool=t2)
    reg.register(name="c", toolset="memory", tool=t3)
    tools = reg.get_tools(toolset={"wiki", "memory"})
    assert set(id(t) for t in tools) == {id(t1), id(t3)}


def test_get_tools_check_fn_gates_inclusion():
    reg = ToolRegistry()
    t_available = object()
    t_unavailable = object()
    reg.register(name="a", toolset="x", tool=t_available, check_fn=lambda: True)
    reg.register(name="b", toolset="x", tool=t_unavailable, check_fn=lambda: False)
    tools = reg.get_tools(toolset={"x"})
    assert tools == [t_available]


def test_get_tools_no_check_fn_always_included():
    reg = ToolRegistry()
    t = object()
    reg.register(name="a", toolset="x", tool=t)  # no check_fn
    tools = reg.get_tools(toolset={"x"})
    assert tools == [t]


def test_get_tools_empty_toolset_returns_empty():
    reg = ToolRegistry()
    reg.register(name="a", toolset="x", tool=object())
    assert reg.get_tools(toolset=set()) == []


def test_get_tools_unknown_toolset_returns_empty():
    reg = ToolRegistry()
    reg.register(name="a", toolset="x", tool=object())
    assert reg.get_tools(toolset={"y"}) == []


def test_is_frontend():
    reg = ToolRegistry()
    reg.register(name="backend_tool", toolset="x", tool=object(), frontend=False)
    reg.register(name="ui_tool", toolset="x", tool=object(), frontend=True)
    assert reg.is_frontend("ui_tool") is True
    assert reg.is_frontend("backend_tool") is False
    with pytest.raises(KeyError):
        reg.is_frontend("unknown")
