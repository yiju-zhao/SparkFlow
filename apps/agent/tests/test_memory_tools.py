"""Tests for tools.memory (LangChain tool wrappers)."""

import json
from unittest.mock import MagicMock, patch

import pytest

from tools.memory import memory_read, memory_write, memory_forget
import tools.memory as memory_module


@pytest.fixture(autouse=True)
def reset_memory_store():
    """Reset the module-level singleton before each test."""
    memory_module._store = None
    yield
    memory_module._store = None


def test_memory_read_user_scope():
    fake_store = MagicMock()
    fake_store.read_user.return_value = [
        {"id": "m1", "userId": "u1", "category": "preference",
         "content": "dark mode", "createdAt": "2026-04-22", "updatedAt": "2026-04-22"},
    ]
    with patch.object(memory_module, "_get_store", return_value=fake_store):
        result = memory_read.invoke({"scope": "user", "user_id": "u1"})

    parsed = json.loads(result)
    assert parsed[0]["content"] == "dark mode"
    fake_store.read_user.assert_called_once()


def test_memory_read_notebook_requires_notebook_id():
    fake_store = MagicMock()
    with patch.object(memory_module, "_get_store", return_value=fake_store):
        result = memory_read.invoke({"scope": "notebook", "user_id": "u1"})
    parsed = json.loads(result)
    assert "error" in parsed
    assert "notebook_id" in parsed["error"].lower()


def test_memory_read_notebook_scope_ok():
    fake_store = MagicMock()
    fake_store.read_notebook.return_value = []
    with patch.object(memory_module, "_get_store", return_value=fake_store):
        memory_read.invoke({"scope": "notebook", "user_id": "u1", "notebook_id": "nb1"})
    fake_store.read_notebook.assert_called_once_with(notebook_id="nb1", category=None)


def test_memory_write_user_scope():
    fake_store = MagicMock()
    fake_store.write_user.return_value = "mem_new"
    with patch.object(memory_module, "_get_store", return_value=fake_store):
        result = memory_write.invoke({
            "scope": "user", "user_id": "u1", "category": "fact", "content": "x"
        })
    assert json.loads(result) == {"ok": True, "id": "mem_new"}


def test_memory_forget_user_scope():
    fake_store = MagicMock()
    with patch.object(memory_module, "_get_store", return_value=fake_store):
        result = memory_forget.invoke({
            "scope": "user", "user_id": "u1", "memory_id": "mem_x"
        })
    assert json.loads(result) == {"ok": True}
    fake_store.forget_user.assert_called_once_with(user_id="u1", memory_id="mem_x")


def test_memory_tools_are_registered():
    from hermes.registry import registry
    # Import side-effect registers the tools
    import tools.memory  # noqa: F401
    names = {e.name for e in registry._tools.values() if e.toolset == "memory"}
    assert {"memory_read", "memory_write", "memory_forget"} <= names


def test_memory_write_handles_store_exception():
    """If the DB call fails, tool returns {"error": "..."} JSON, not a raise."""
    fake_store = MagicMock()
    fake_store.write_user.side_effect = RuntimeError("DB down")
    with patch.object(memory_module, "_get_store", return_value=fake_store):
        result = memory_write.invoke({
            "scope": "user", "user_id": "u1", "category": "fact", "content": "x"
        })
    parsed = json.loads(result)
    assert "error" in parsed
    assert "DB down" in parsed["error"]
