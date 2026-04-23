"""Memory persistence via raw psycopg.

We deliberately avoid a Python Prisma client. Memory rows are simple
key/value pairs scoped by user or notebook; the schema is hand-maintained
across languages (Prisma emits the column names; we read them verbatim).

Patterns match ``apps/agent/scripts/backfill_wechat_embeddings.py``:
short-lived connections per call, DSN injected at construction time, all
errors surface as exceptions (the caller — memory tools — wraps them
into tool-error ToolMessages).
"""

from __future__ import annotations

import os
from typing import Any

import psycopg
from psycopg.rows import dict_row


def _dsn_from_env() -> str:
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL is not set — memory store cannot connect.")
    return dsn


class MemoryStore:
    """Read/write UserMemory and NotebookMemory rows.

    One instance per process is fine; connections are opened and closed per
    call so nothing is held long-term.
    """

    def __init__(self, *, dsn: str | None = None) -> None:
        self._dsn = dsn or _dsn_from_env()

    def _connect(self) -> psycopg.Connection:
        return psycopg.connect(self._dsn, row_factory=dict_row)

    # ---- read -----------------------------------------------------

    def read_user(
        self, *, user_id: str, category: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        sql = (
            'SELECT id, "userId", category, content, "createdAt", "updatedAt" '
            'FROM user_memory WHERE "userId" = %s'
        )
        params: tuple[Any, ...] = (user_id,)
        if category is not None:
            sql += " AND category = %s"
            params = (user_id, category)
        sql += ' ORDER BY "updatedAt" DESC LIMIT %s'
        params = (*params, limit)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return list(cur.fetchall())

    def read_notebook(
        self, *, notebook_id: str, category: str | None = None, limit: int = 50
    ) -> list[dict[str, Any]]:
        sql = (
            'SELECT id, "notebookId", category, content, "createdAt", "updatedAt" '
            'FROM notebook_memory WHERE "notebookId" = %s'
        )
        params: tuple[Any, ...] = (notebook_id,)
        if category is not None:
            sql += " AND category = %s"
            params = (notebook_id, category)
        sql += ' ORDER BY "updatedAt" DESC LIMIT %s'
        params = (*params, limit)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return list(cur.fetchall())

    # ---- write ----------------------------------------------------

    def write_user(self, *, user_id: str, category: str, content: str) -> str:
        sql = (
            'INSERT INTO user_memory (id, "userId", category, content, "updatedAt") '
            "VALUES (gen_random_uuid()::text, %s, %s, %s, NOW()) "
            "RETURNING id"
        )
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (user_id, category, content))
                row = cur.fetchone()
            conn.commit()
        if row is None:
            raise RuntimeError("INSERT ... RETURNING did not produce a row")
        return row["id"]

    def write_notebook(
        self, *, notebook_id: str, category: str, content: str
    ) -> str:
        sql = (
            'INSERT INTO notebook_memory (id, "notebookId", category, content, "updatedAt") '
            "VALUES (gen_random_uuid()::text, %s, %s, %s, NOW()) "
            "RETURNING id"
        )
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (notebook_id, category, content))
                row = cur.fetchone()
            conn.commit()
        if row is None:
            raise RuntimeError("INSERT ... RETURNING did not produce a row")
        return row["id"]

    # ---- forget ---------------------------------------------------

    def forget_user(self, *, user_id: str, memory_id: str) -> None:
        sql = 'DELETE FROM user_memory WHERE id = %s AND "userId" = %s'
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (memory_id, user_id))
            conn.commit()

    def forget_notebook(self, *, notebook_id: str, memory_id: str) -> None:
        sql = 'DELETE FROM notebook_memory WHERE id = %s AND "notebookId" = %s'
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(sql, (memory_id, notebook_id))
            conn.commit()
