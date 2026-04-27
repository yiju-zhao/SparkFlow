"""Tests for agents.{notebook,hub,deep_research}.

Pattern: each surface defines a module-level `agent` (compiled StateGraph).
We invoke it with a fake LLM that emits a tool call then a final answer,
and assert the loop terminates correctly.
"""
from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage


def _fake_model_factory(responses):
    """Return a callable mimicking init_chat_model().bind_tools(...).invoke().

    `responses` is a list of AIMessage instances; each invoke returns the next.
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
        AIMessage(content="", tool_calls=[
            {"name": "source_list", "args": {"notebook_id": "nb_1"}, "id": "c1"}
        ]),
        AIMessage(content="here are your sources"),
    ]
    monkeypatch.setattr(nb, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    # Mock source_list tool dispatch to avoid real HTTP
    monkeypatch.setattr(nb.TOOLS_BY_NAME["source_list"], "invoke",
                        lambda args: "Source A\nSource B")

    ctx = nb.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-test",
                 user_id="u1", session_id="s1", notebook_id="nb_1")
    out = nb.agent.invoke({"messages": [HumanMessage("list sources")]}, context=ctx)
    msgs = out["messages"]
    # Expect: human, ai-toolcall, tool-result, ai-final
    assert isinstance(msgs[-1], AIMessage)
    assert msgs[-1].content == "here are your sources"
    assert any(isinstance(m, ToolMessage) for m in msgs)


def test_notebook_unknown_tool_returns_error_toolmessage(monkeypatch):
    from agents import notebook as nb

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "no_such_tool", "args": {}, "id": "c1"}
        ]),
        AIMessage(content="oh well"),
    ]
    monkeypatch.setattr(nb, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    ctx = nb.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-test",
                 user_id="u1", session_id="s1", notebook_id="nb_1")
    out = nb.agent.invoke({"messages": [HumanMessage("hi")]}, context=ctx)
    tool_msgs = [m for m in out["messages"] if isinstance(m, ToolMessage)]
    assert len(tool_msgs) == 1
    assert "unknown tool" in tool_msgs[0].content.lower()


def test_notebook_no_api_key_raises():
    from agents import notebook as nb
    ctx = nb.Ctx(model_provider="openai", model_name="gpt-4o", api_key="",
                 user_id="u1", session_id="s1", notebook_id="nb_1")
    with pytest.raises(ValueError, match="BYOK"):
        nb.agent.invoke({"messages": [HumanMessage("hi")]}, context=ctx)


# --------------------- hub surface — four paths ---------------------

def test_hub_all_backend_tool_calls(monkeypatch):
    from agents import hub as h

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "list_publications", "args": {"limit": 5}, "id": "c1"}
        ]),
        AIMessage(content="here are publications"),
    ]
    monkeypatch.setattr(h, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    # Mock the toolbox dispatch
    fake_tool = MagicMock()
    fake_tool.ainvoke = MagicMock(return_value={"items": [], "total": 0})
    monkeypatch.setitem(h.TOOLS_BY_NAME, "list_publications", fake_tool)

    import asyncio
    async def _patched_ainvoke(args):
        return {"items": []}
    fake_tool.ainvoke = _patched_ainvoke

    ctx = h.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-t",
                user_id="u", session_id="s")
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
        AIMessage(content="", tool_calls=[
            {"name": "show_table", "args": {"title": "T", "rows": []}, "id": "c1"}
        ]),
    ]
    monkeypatch.setattr(h, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))

    ctx = h.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-t",
                user_id="u", session_id="s")
    out = h.agent.invoke({"messages": [HumanMessage("show me a table")]}, context=ctx)
    # Last message is the AIMessage with the frontend tool_call — client renders it.
    assert isinstance(out["messages"][-1], AIMessage)
    assert out["messages"][-1].tool_calls[0]["name"] == "show_table"


def test_hub_mixed_frontend_and_backend(monkeypatch):
    from agents import hub as h

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "show_table", "args": {"title": "T", "rows": []}, "id": "c1"},
            {"name": "list_publications", "args": {"limit": 5}, "id": "c2"},
        ]),
        AIMessage(content="ok"),
    ]
    monkeypatch.setattr(h, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    fake = MagicMock()
    async def _ainvoke(args):
        return {"items": []}
    fake.ainvoke = _ainvoke
    monkeypatch.setitem(h.TOOLS_BY_NAME, "list_publications", fake)

    ctx = h.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-t",
                user_id="u", session_id="s")
    out = h.agent.invoke({"messages": [HumanMessage("hi")]}, context=ctx)
    tool_msgs = [m for m in out["messages"] if isinstance(m, ToolMessage)]
    # Only the backend tool produces a ToolMessage; frontend is skipped.
    assert len(tool_msgs) == 1
    msgs = out["messages"]
    assert msgs[-1].content == "ok"


def test_hub_unknown_backend_tool(monkeypatch):
    from agents import hub as h

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "no_such_tool", "args": {}, "id": "c1"}
        ]),
        AIMessage(content="recovered"),
    ]
    monkeypatch.setattr(h, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    ctx = h.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-t",
                user_id="u", session_id="s")
    out = h.agent.invoke({"messages": [HumanMessage("?")]}, context=ctx)
    tool_msgs = [m for m in out["messages"] if isinstance(m, ToolMessage)]
    assert len(tool_msgs) == 1
    assert "unknown tool" in tool_msgs[0].content.lower()


# --------------------- deep_research surface ---------------------

def test_deep_research_dispatches_web_search(monkeypatch):
    from agents import deep_research as dr

    responses = [
        AIMessage(content="", tool_calls=[
            {"name": "search_web", "args": {"query": "diffusion"}, "id": "c1"}
        ]),
        AIMessage(content="results follow"),
    ]
    monkeypatch.setattr(dr, "init_chat_model",
                        lambda *a, **kw: _fake_model_factory(responses))
    monkeypatch.setattr(dr.TOOLS_BY_NAME["search_web"], "invoke",
                        lambda args: '[{"title":"a","url":"u","content":"c"}]')

    ctx = dr.Ctx(model_provider="openai", model_name="gpt-4o", api_key="sk-t",
                 user_id="u", session_id="s",
                 page_context="user is on /explore")
    out = dr.agent.invoke({"messages": [HumanMessage("research diffusion")]}, context=ctx)
    assert out["messages"][-1].content == "results follow"
