"""Tests for agents.{notebook,hub,deep_research}.

Pattern: each surface defines a module-level `agent` (compiled StateGraph).
We invoke it with a fake LLM that emits a tool call then a final answer,
and assert the loop terminates correctly.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage


def _fake_model_factory(responses):
    """Return a model object mimicking init_chat_model().bind_tools(...).invoke().

    `responses` is a list of AIMessage instances; each invoke returns the next.

    IMPORTANT: always pass the *same* factory object back from the
    init_chat_model lambda so the shared response iterator advances correctly
    across multiple llm_call invocations (one per graph iteration).
    """
    iter_responses = iter(responses)
    bound = MagicMock()
    bound.invoke = MagicMock(side_effect=lambda msgs: next(iter_responses))
    model = MagicMock()
    model.bind_tools = MagicMock(return_value=bound)
    return model


# --------------------- notebook surface ---------------------


def test_notebook_dispatches_backend_tool(monkeypatch):
    from agents import notebook as nb

    responses = [
        AIMessage(
            content="",
            tool_calls=[{"name": "source_list", "args": {"notebook_id": "nb_1"}, "id": "c1"}],
        ),
        AIMessage(content="here are your sources"),
    ]
    # Same factory object on every init_chat_model call → shared iterator.
    _factory = _fake_model_factory(responses)
    monkeypatch.setattr(nb, "init_chat_model", lambda *a, **kw: _factory)
    # Replace the tool entry with a simple MagicMock to avoid real HTTP.
    # func=None signals to tool_node that this is a sync tool (invoke path).
    fake_tool = MagicMock()
    fake_tool.name = "source_list"
    fake_tool.invoke = MagicMock(return_value="Source A\nSource B")
    fake_tool.func = None
    monkeypatch.setitem(nb.TOOLS_BY_NAME, "source_list", fake_tool)

    ctx = nb.Ctx(
        model_provider="openai",
        model_name="gpt-4o",
        api_key="sk-test",
        user_id="u1",
        session_id="s1",
        notebook_id="nb_1",
    )
    out = nb.agent.invoke({"messages": [HumanMessage("list sources")]}, context=ctx)
    msgs = out["messages"]
    # Expect: human, ai-toolcall, tool-result, ai-final
    assert isinstance(msgs[-1], AIMessage)
    assert msgs[-1].content == "here are your sources"
    assert any(isinstance(m, ToolMessage) for m in msgs)


def test_notebook_unknown_tool_returns_error_toolmessage(monkeypatch):
    from agents import notebook as nb

    responses = [
        AIMessage(content="", tool_calls=[{"name": "no_such_tool", "args": {}, "id": "c1"}]),
        AIMessage(content="oh well"),
    ]
    _factory = _fake_model_factory(responses)
    monkeypatch.setattr(nb, "init_chat_model", lambda *a, **kw: _factory)
    ctx = nb.Ctx(
        model_provider="openai",
        model_name="gpt-4o",
        api_key="sk-test",
        user_id="u1",
        session_id="s1",
        notebook_id="nb_1",
    )
    out = nb.agent.invoke({"messages": [HumanMessage("hi")]}, context=ctx)
    tool_msgs = [m for m in out["messages"] if isinstance(m, ToolMessage)]
    assert len(tool_msgs) == 1
    assert "unknown tool" in tool_msgs[0].content.lower()


def test_notebook_no_api_key_raises():
    from agents import notebook as nb

    ctx = nb.Ctx(
        model_provider="openai",
        model_name="gpt-4o",
        api_key="",
        user_id="u1",
        session_id="s1",
        notebook_id="nb_1",
    )
    with pytest.raises(ValueError, match="BYOK"):
        nb.agent.invoke({"messages": [HumanMessage("hi")]}, context=ctx)


# --------------------- hub surface — four paths ---------------------


def test_hub_all_backend_tool_calls(monkeypatch):
    from agents import hub as h

    responses = [
        AIMessage(
            content="", tool_calls=[{"name": "list_publications", "args": {"limit": 5}, "id": "c1"}]
        ),
        AIMessage(content="here are publications"),
    ]
    _factory = _fake_model_factory(responses)
    monkeypatch.setattr(h, "init_chat_model", lambda *a, **kw: _factory)

    # Hub toolbox tools are async; fake ainvoke via a coroutine function.
    # func=None → sync path in tool_node; we patch ainvoke directly via a
    # helper class since MagicMock.ainvoke() isn't awaitable.
    class _FakeTool:
        name = "list_publications"
        func = None  # triggers sync invoke path

        def invoke(self, args):
            return '{"items":[]}'

    monkeypatch.setitem(h.TOOLS_BY_NAME, "list_publications", _FakeTool())

    ctx = h.Ctx(
        model_provider="openai", model_name="gpt-4o", api_key="sk-t", user_id="u", session_id="s"
    )
    out = h.agent.invoke({"messages": [HumanMessage("list pubs")]}, context=ctx)
    msgs = out["messages"]
    assert any(isinstance(m, ToolMessage) for m in msgs)
    assert msgs[-1].content == "here are publications"


def test_hub_all_frontend_tool_calls_terminates_loop(monkeypatch):
    """Critical regression test: when EVERY tool_call is frontend, loop must END.

    Otherwise the LLM is invoked again with no ToolMessage answers and
    will repeat the frontend call or hallucinate (spec §5.3).
    """
    from agents import hub as h

    # Single response — if loop terminates, no second invoke needed.
    # If the bug regresses, the iterator will be exhausted and StopIteration
    # bubbles up.
    responses = [
        AIMessage(
            content="",
            tool_calls=[{"name": "show_table", "args": {"title": "T", "rows": []}, "id": "c1"}],
        ),
    ]
    _factory = _fake_model_factory(responses)
    monkeypatch.setattr(h, "init_chat_model", lambda *a, **kw: _factory)

    ctx = h.Ctx(
        model_provider="openai", model_name="gpt-4o", api_key="sk-t", user_id="u", session_id="s"
    )
    out = h.agent.invoke({"messages": [HumanMessage("show me a table")]}, context=ctx)
    # Last message is the AIMessage with the frontend tool_call — client renders it.
    assert isinstance(out["messages"][-1], AIMessage)
    assert out["messages"][-1].tool_calls[0]["name"] == "show_table"


def test_hub_mixed_frontend_and_backend(monkeypatch):
    from agents import hub as h

    responses = [
        AIMessage(
            content="",
            tool_calls=[
                {"name": "show_table", "args": {"title": "T", "rows": []}, "id": "c1"},
                {"name": "list_publications", "args": {"limit": 5}, "id": "c2"},
            ],
        ),
        AIMessage(content="ok"),
    ]
    _factory = _fake_model_factory(responses)
    monkeypatch.setattr(h, "init_chat_model", lambda *a, **kw: _factory)

    class _FakeTool:
        name = "list_publications"
        func = None  # triggers sync invoke path in tool_node

        def invoke(self, args):
            return '{"items":[]}'

    monkeypatch.setitem(h.TOOLS_BY_NAME, "list_publications", _FakeTool())

    ctx = h.Ctx(
        model_provider="openai", model_name="gpt-4o", api_key="sk-t", user_id="u", session_id="s"
    )
    out = h.agent.invoke({"messages": [HumanMessage("hi")]}, context=ctx)
    tool_msgs = [m for m in out["messages"] if isinstance(m, ToolMessage)]
    # Only the backend tool produces a ToolMessage; frontend is skipped.
    assert len(tool_msgs) == 1
    msgs = out["messages"]
    assert msgs[-1].content == "ok"


def test_hub_unknown_backend_tool(monkeypatch):
    from agents import hub as h

    responses = [
        AIMessage(content="", tool_calls=[{"name": "no_such_tool", "args": {}, "id": "c1"}]),
        AIMessage(content="recovered"),
    ]
    _factory = _fake_model_factory(responses)
    monkeypatch.setattr(h, "init_chat_model", lambda *a, **kw: _factory)
    ctx = h.Ctx(
        model_provider="openai", model_name="gpt-4o", api_key="sk-t", user_id="u", session_id="s"
    )
    out = h.agent.invoke({"messages": [HumanMessage("?")]}, context=ctx)
    tool_msgs = [m for m in out["messages"] if isinstance(m, ToolMessage)]
    assert len(tool_msgs) == 1
    assert "unknown tool" in tool_msgs[0].content.lower()


# --------------------- deep_research surface ---------------------


def test_deep_research_dispatches_web_search(monkeypatch):
    from agents import deep_research as dr

    responses = [
        AIMessage(
            content="",
            tool_calls=[{"name": "search_web", "args": {"query": "diffusion"}, "id": "c1"}],
        ),
        AIMessage(content="results follow"),
    ]
    _factory = _fake_model_factory(responses)
    monkeypatch.setattr(dr, "init_chat_model", lambda *a, **kw: _factory)
    # search_web is a sync tool; func=None signals sync path in tool_node.
    fake_tool = MagicMock()
    fake_tool.name = "search_web"
    fake_tool.invoke = MagicMock(return_value='[{"title":"a","url":"u","content":"c"}]')
    fake_tool.func = None
    monkeypatch.setitem(dr.TOOLS_BY_NAME, "search_web", fake_tool)

    ctx = dr.Ctx(
        model_provider="openai",
        model_name="gpt-4o",
        api_key="sk-t",
        user_id="u",
        session_id="s",
        page_context="user is on /explore",
    )
    out = dr.agent.invoke({"messages": [HumanMessage("research diffusion")]}, context=ctx)
    assert out["messages"][-1].content == "results follow"
