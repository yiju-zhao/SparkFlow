"""LangChain tools for reading/writing memory.

Each tool takes ``user_id`` (and optionally ``notebook_id``) explicitly;
the surface prompt instructs the LLM to pass them from the session metadata.

We use a module-level singleton ``MemoryStore`` lazily-initialized on first
access so importing this module doesn't require ``DATABASE_URL`` to be set
(which matters for unit tests that patch ``_get_store``).
"""

from __future__ import annotations

import json
from typing import Literal

from langchain_core.tools import tool

from hermes.memory.store import MemoryStore
from hermes.registry import registry


_store: MemoryStore | None = None


def _get_store() -> MemoryStore:
    """Lazy singleton. Tests can monkeypatch this function to inject a fake."""
    global _store
    if _store is None:
        _store = MemoryStore()
    return _store


@tool
def memory_read(
    scope: Literal["user", "notebook"],
    user_id: str,
    notebook_id: str | None = None,
    category: str | None = None,
) -> str:
    """Read stored memory entries.

    Use this to recall facts, preferences, or past observations saved in a
    previous turn. Returns a JSON array of memory objects.

    Args:
        scope: Which memory layer to read. ``"user"`` pulls account-level
            memory (preferences, profile). ``"notebook"`` pulls
            notebook-scoped memory (facts, feedback tied to one notebook).
        user_id: The current user id (from session metadata).
        notebook_id: Required when scope is ``"notebook"``.
        category: Optional category filter ("profile" | "preference" |
            "fact" | "feedback").
    """

    if scope == "notebook" and not notebook_id:
        return json.dumps({"error": "notebook_id is required for scope=notebook"})

    try:
        store = _get_store()
        if scope == "user":
            rows = store.read_user(user_id=user_id, category=category)
        else:
            rows = store.read_notebook(notebook_id=notebook_id, category=category)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"memory_read failed: {exc}"})

    def _serialize(row):
        return {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in row.items()}

    return json.dumps([_serialize(r) for r in rows], ensure_ascii=False)


@tool
def memory_write(
    scope: Literal["user", "notebook"],
    user_id: str,
    category: str,
    content: str,
    notebook_id: str | None = None,
) -> str:
    """Persist a fact, preference, or observation to memory.

    Use sparingly — write only things that will matter in FUTURE sessions
    (long-lived preferences, hard-won facts). Do not echo the current
    conversation back into memory.

    Args:
        scope: ``"user"`` for account-level; ``"notebook"`` for notebook-level.
        user_id: Current user id.
        category: Short tag (``"profile"`` | ``"preference"`` | ``"fact"`` |
            ``"feedback"``). Keep consistent across writes for easy retrieval.
        content: Plain text, ideally one sentence.
        notebook_id: Required when scope is ``"notebook"``.
    """

    if scope == "notebook" and not notebook_id:
        return json.dumps({"error": "notebook_id is required for scope=notebook"})

    try:
        store = _get_store()
        if scope == "user":
            new_id = store.write_user(user_id=user_id, category=category, content=content)
        else:
            new_id = store.write_notebook(
                notebook_id=notebook_id, category=category, content=content
            )
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"memory_write failed: {exc}"})

    return json.dumps({"ok": True, "id": new_id})


@tool
def memory_forget(
    scope: Literal["user", "notebook"],
    user_id: str,
    memory_id: str,
    notebook_id: str | None = None,
) -> str:
    """Delete a memory entry by id.

    Args:
        scope: Must match the scope the memory was written under.
        user_id: Current user id.
        memory_id: The memory id to delete (from a prior ``memory_read``).
        notebook_id: Required when scope is ``"notebook"``.
    """

    if scope == "notebook" and not notebook_id:
        return json.dumps({"error": "notebook_id is required for scope=notebook"})

    try:
        store = _get_store()
        if scope == "user":
            store.forget_user(user_id=user_id, memory_id=memory_id)
        else:
            store.forget_notebook(notebook_id=notebook_id, memory_id=memory_id)
    except Exception as exc:  # noqa: BLE001
        return json.dumps({"error": f"memory_forget failed: {exc}"})

    return json.dumps({"ok": True})


# --- hermes.registry self-registration (P3) -----------------------------
# Individual top-level calls so discover_builtin_tools' AST check picks up
# this module (a for-loop at top level does NOT match the ast.Expr gate).
registry.register(
    name=memory_read.name,
    toolset="memory",
    tool=memory_read,
    description="Read stored memory entries for the current user or notebook.",
)
registry.register(
    name=memory_write.name,
    toolset="memory",
    tool=memory_write,
    description="Persist a fact or preference to user- or notebook-scoped memory.",
)
registry.register(
    name=memory_forget.name,
    toolset="memory",
    tool=memory_forget,
    description="Delete a memory entry by id.",
)
