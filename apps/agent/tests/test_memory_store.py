"""Tests for hermes.memory.store.MemoryStore.

These tests use an in-memory stub for psycopg to avoid requiring a live DB.
Integration against the real DB is covered by the P3 smoke test (Task 14)
or deferred to a manual check when the DB is migrated.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from hermes.memory.store import MemoryStore


class _FakeCursor:
    def __init__(self, preset_rows=None):
        self.preset_rows = preset_rows or []
        self.executed = []

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchall(self):
        return self.preset_rows

    def fetchone(self):
        return self.preset_rows[0] if self.preset_rows else None


class _FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.commits = 0

    def cursor(self, *, row_factory=None):
        return self._cursor

    def commit(self):
        self.commits += 1

    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()
        return False


def _store_with_conn(cursor):
    store = MemoryStore(dsn="postgresql://fake/ignored")
    store._connect = lambda: _FakeConn(cursor)  # type: ignore[assignment]
    return store


def test_read_user_memory_returns_rows():
    cur = _FakeCursor(preset_rows=[
        {"id": "m1", "userId": "u1", "category": "preference", "content": "prefers bullets",
         "createdAt": datetime.now(timezone.utc), "updatedAt": datetime.now(timezone.utc)},
    ])
    store = _store_with_conn(cur)
    rows = store.read_user(user_id="u1")
    assert len(rows) == 1
    assert rows[0]["content"] == "prefers bullets"
    assert "SELECT" in cur.executed[0][0]
    # user_id must be in the params tuple
    assert "u1" in cur.executed[0][1]


def test_read_user_memory_filters_by_category():
    cur = _FakeCursor(preset_rows=[])
    store = _store_with_conn(cur)
    store.read_user(user_id="u1", category="preference")
    assert "category" in cur.executed[0][0].lower()


def test_read_notebook_memory_returns_rows():
    cur = _FakeCursor(preset_rows=[
        {"id": "m2", "notebookId": "nb1", "category": "fact", "content": "uses BGE-M3",
         "createdAt": datetime.now(timezone.utc), "updatedAt": datetime.now(timezone.utc)},
    ])
    store = _store_with_conn(cur)
    rows = store.read_notebook(notebook_id="nb1")
    assert len(rows) == 1
    assert rows[0]["notebookId"] == "nb1"


def test_write_user_memory_inserts_and_returns_id():
    new_id_row = {"id": "newly_created_id"}
    cur = _FakeCursor(preset_rows=[new_id_row])
    store = _store_with_conn(cur)
    new_id = store.write_user(user_id="u1", category="fact", content="likes dark mode")
    assert new_id == "newly_created_id"
    assert "INSERT" in cur.executed[0][0]


def test_write_notebook_memory_inserts_and_returns_id():
    cur = _FakeCursor(preset_rows=[{"id": "nbmem_1"}])
    store = _store_with_conn(cur)
    new_id = store.write_notebook(notebook_id="nb1", category="fact", content="Python 3.12")
    assert new_id == "nbmem_1"
    assert "INSERT" in cur.executed[0][0]


def test_forget_user_memory_deletes_by_id():
    cur = _FakeCursor(preset_rows=[])
    store = _store_with_conn(cur)
    store.forget_user(user_id="u1", memory_id="m1")
    assert "DELETE" in cur.executed[0][0]


def test_read_user_memory_returns_empty_list_on_empty_result():
    cur = _FakeCursor(preset_rows=[])
    store = _store_with_conn(cur)
    rows = store.read_user(user_id="nobody")
    assert rows == []
