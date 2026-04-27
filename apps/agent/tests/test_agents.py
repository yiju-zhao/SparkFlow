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
