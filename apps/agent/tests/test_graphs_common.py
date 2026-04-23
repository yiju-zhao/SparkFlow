"""Tests for graphs.common factories."""

from dataclasses import dataclass
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from config.surfaces import SurfaceConfig
from graphs.common import SurfaceRuntimeContext, make_llm_call, make_tool_node


@dataclass
class _FakeRuntime:
    context: SurfaceRuntimeContext


def _runtime(**overrides) -> _FakeRuntime:
    defaults = dict(
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
        notebook_id=None,
        page_context=None,
        # BYOK is required by _resolve_model; tests pass a dummy key so
        # the resolver path runs. init_chat_model is patched in the test
        # that actually exercises the LLM call, so this value never reaches
        # a real provider.
        api_key="test-key",
        extra_caller_system=None,
    )
    defaults.update(overrides)
    return _FakeRuntime(context=SurfaceRuntimeContext(**defaults))


def test_surface_runtime_context_defaults():
    ctx = SurfaceRuntimeContext(
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
    )
    assert ctx.notebook_id is None
    assert ctx.page_context is None
    assert ctx.api_key is None
    assert ctx.extra_caller_system is None


@pytest.mark.asyncio
async def test_make_llm_call_assembles_prompt_and_invokes_model():
    cfg = SurfaceConfig(
        name="notebook",
        surface_prompt_path="surfaces/notebook.md",
        toolset={"wiki"},
    )

    fake_response = MagicMock()
    fake_response.tool_calls = []
    bound_model = AsyncMock()
    bound_model.ainvoke = AsyncMock(return_value=fake_response)

    model = MagicMock()
    model.bind_tools = MagicMock(return_value=bound_model)

    # Patch init_chat_model and PromptBuilder to avoid real API + file I/O
    with patch("graphs.common.init_chat_model", return_value=model), patch(
        "graphs.common._prompt_builder"
    ) as pb_singleton, patch(
        "graphs.common.registry"
    ) as reg:
        pb_singleton.build = MagicMock(return_value="SYSTEM_PROMPT")
        reg.get_tools = MagicMock(return_value=["fake_tool"])
        llm_call = make_llm_call(cfg)
        result = await llm_call({"messages": []}, _runtime())

    assert result == {"messages": [fake_response]}
    bound_model.ainvoke.assert_awaited_once()
    # First positional arg is the messages list; first message is the system prompt
    call_args = bound_model.ainvoke.await_args.args[0]
    assert call_args[0].content == "SYSTEM_PROMPT"


@pytest.mark.asyncio
async def test_make_tool_node_invokes_registered_tools_and_formats_results():
    from hermes.registry import ToolRegistry
    from langchain_core.messages import AIMessage

    reg = ToolRegistry()
    fake_tool = MagicMock()
    fake_tool.name = "echo"
    fake_tool.ainvoke = AsyncMock(return_value="hi")
    reg.register(name="echo", toolset="t", tool=fake_tool)

    cfg = SurfaceConfig(
        name="x",
        surface_prompt_path="surfaces/notebook.md",
        toolset={"t"},
    )

    tool_msg = AIMessage(
        content="",
        tool_calls=[
            {"name": "echo", "args": {"text": "hi"}, "id": "call_1", "type": "tool_call"}
        ],
    )
    with patch("graphs.common.registry", reg):
        tool_node = make_tool_node(cfg)
        result = await tool_node({"messages": [tool_msg]})

    assert len(result["messages"]) == 1
    assert result["messages"][0].content == "hi"
    assert result["messages"][0].tool_call_id == "call_1"


@pytest.mark.asyncio
async def test_make_tool_node_skips_frontend_tools():
    """Frontend tools must not be executed server-side."""
    from hermes.registry import ToolRegistry
    from langchain_core.messages import AIMessage

    reg = ToolRegistry()
    ui_tool = MagicMock(spec=[])  # no methods => no accidental ainvoke
    ui_tool.name = "show_table"
    reg.register(name="show_table", toolset="ui", tool=ui_tool, frontend=True)

    cfg = SurfaceConfig(name="x", surface_prompt_path="surfaces/hub.md", toolset={"ui"})

    msg = AIMessage(
        content="",
        tool_calls=[
            {"name": "show_table", "args": {}, "id": "c1", "type": "tool_call"}
        ],
    )
    with patch("graphs.common.registry", reg):
        tool_node = make_tool_node(cfg)
        result = await tool_node({"messages": [msg]})

    # Frontend tool should NOT be invoked server-side.
    # Node returns an empty message list for that call.
    assert result == {"messages": []}


@pytest.mark.asyncio
async def test_make_tool_node_unknown_tool_returns_error_message():
    from langchain_core.messages import AIMessage
    from hermes.registry import ToolRegistry

    cfg = SurfaceConfig(name="x", surface_prompt_path="surfaces/notebook.md", toolset={"t"})

    msg = AIMessage(
        content="",
        tool_calls=[
            {"name": "nonexistent", "args": {}, "id": "c1", "type": "tool_call"}
        ],
    )
    with patch("graphs.common.registry", ToolRegistry()):  # empty registry
        tool_node = make_tool_node(cfg)
        result = await tool_node({"messages": [msg]})

    assert len(result["messages"]) == 1
    import json as _json
    payload = _json.loads(result["messages"][0].content)
    assert "error" in payload
    assert "nonexistent" in payload["error"]
    assert result["messages"][0].tool_call_id == "c1"


@pytest.mark.asyncio
async def test_make_tool_node_no_ai_message_returns_empty():
    from langchain_core.messages import HumanMessage

    cfg = SurfaceConfig(name="x", surface_prompt_path="surfaces/notebook.md", toolset={"t"})
    tool_node = make_tool_node(cfg)
    result = await tool_node({"messages": [HumanMessage(content="hi")]})
    assert result == {"messages": []}
