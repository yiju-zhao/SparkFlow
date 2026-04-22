"""Tests for hermes.registry.discover_builtin_tools."""

import sys
from pathlib import Path

from hermes.registry import ToolRegistry, discover_builtin_tools, registry as global_registry


FIXTURES = Path(__file__).parent / "fixtures" / "fake_tools"


def _clear_fixture_imports():
    """Remove any cached imports of our fixture modules so each test is fresh."""
    for mod in list(sys.modules):
        if mod.startswith("tests.fixtures.fake_tools"):
            del sys.modules[mod]


def test_discover_imports_registering_module():
    _clear_fixture_imports()
    # Ensure a clean registry slot for the fake tool
    global_registry._tools.pop("fake_real", None)

    imported = discover_builtin_tools(tools_dir=FIXTURES, package="tests.fixtures.fake_tools")
    assert "tests.fixtures.fake_tools.real_tool" in imported
    assert "fake_real" in global_registry._tools


def test_discover_skips_non_registering_module():
    _clear_fixture_imports()
    global_registry._tools.pop("fake_helper", None)

    imported = discover_builtin_tools(tools_dir=FIXTURES, package="tests.fixtures.fake_tools")
    assert "tests.fixtures.fake_tools.helper" not in imported
    # helper.py has registry.register INSIDE a function; that call should not run
    assert "fake_helper" not in global_registry._tools


def test_discover_skips_init_and_registry():
    """__init__.py and any file called registry.py should be skipped."""
    _clear_fixture_imports()
    imported = discover_builtin_tools(tools_dir=FIXTURES, package="tests.fixtures.fake_tools")
    assert not any("__init__" in m for m in imported)
    assert not any(m.endswith(".registry") for m in imported)


def test_discover_nonexistent_dir_returns_empty(tmp_path):
    # tmp_path is empty
    imported = discover_builtin_tools(tools_dir=tmp_path, package="test.empty")
    assert imported == []


def test_echo_tool_is_discovered_from_production_tools_dir():
    """The real apps/agent/tools/ directory must include _echo.py after P1."""
    _clear_fixture_imports()
    # Clear any prior registration so the discovery side-effect is observable
    global_registry._tools.pop("echo", None)

    imported = discover_builtin_tools()  # use default tools_dir
    assert "tools._echo" in imported
    entry = global_registry.get_entry("echo")
    assert entry.name == "echo"
    assert entry.toolset == "_test"
    # The tool itself is a LangChain BaseTool instance
    from langchain_core.tools import BaseTool
    assert isinstance(entry.tool, BaseTool)


def test_echo_tool_invocation_returns_input():
    from hermes.registry import registry as global_registry

    entry = global_registry.get_entry("echo")
    result = entry.tool.invoke({"text": "hello"})
    assert result == "hello"
