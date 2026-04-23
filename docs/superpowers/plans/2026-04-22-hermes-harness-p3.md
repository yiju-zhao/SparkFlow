# Hermes Harness — P3 (Memory + Skills) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill in the P1 no-op stubs for `PromptBuilder._memory_snippet` and `PromptBuilder._skills_snippet` with real implementations. Add Prisma `UserMemory` + `NotebookMemory` tables, a psycopg-based memory store, and `memory_read` / `memory_write` / `memory_forget` LangChain tools wired into the notebook and hub surfaces. Add the `~/.sparkflow/skills/*.md` scanner with two-level cache (in-memory LRU + on-disk snapshot).

**Architecture:** P1 primitives and P2 surfaces stay untouched. P3 populates the two empty hooks in `hermes/prompt_builder.py`. New code lives under `apps/agent/hermes/memory/` and `apps/agent/hermes/skills/`. Memory persistence is raw `psycopg` (no Python Prisma client — schema changes are infrequent and hand-maintained; parallels `apps/agent/scripts/backfill_wechat_embeddings.py`). Skills are progressive-disclosure: the system prompt injects an index (name + one-line description + applies_to + tools_required) and the LLM calls `skill_read(name)` for full content when needed.

**Tech Stack:** Python 3.12 (apps/agent venv), `psycopg[binary]` (already in requirements), `PyYAML` (new dep for frontmatter), LangChain tools. Prisma + PostgreSQL for the schema changes. No frontend changes.

**Spec:** `docs/superpowers/specs/2026-04-22-hermes-harness-design.md` §5.3, §5.4, §8, §10 (P3 row).
**Preceding plans:**
- `docs/superpowers/plans/2026-04-22-hermes-harness-p1.md` (merged as PR #68)
- `docs/superpowers/plans/2026-04-22-hermes-harness-p2.md` (merged as PR #69)

---

## Scope boundaries

**IN scope for P3:**

- `apps/web/prisma/schema.prisma` (MOD) — add `UserMemory` + `NotebookMemory` models + matching `User.memories` / `Notebook.memories` relations
- `apps/web/prisma/migrations/<timestamp>_add_memory_tables/migration.sql` (new)
- `apps/agent/hermes/memory/__init__.py` (empty)
- `apps/agent/hermes/memory/store.py` — psycopg-backed CRUD (`MemoryStore` class)
- `apps/agent/hermes/memory/tools.py` — LangChain `@tool` wrappers that self-register into `hermes.registry` under `toolset="memory"`
- `apps/agent/hermes/prompt_builder.py` (MOD) — implement `_memory_snippet` using `MemoryStore`
- `apps/agent/hermes/skills/__init__.py` (empty)
- `apps/agent/hermes/skills/loader.py` — scan `~/.sparkflow/skills/*.md`, parse YAML frontmatter
- `apps/agent/hermes/skills/index.py` — two-level cache (in-memory LRU + disk snapshot)
- `apps/agent/hermes/prompt_builder.py` (MOD) — implement `_skills_snippet` using `SkillsIndex`
- `apps/agent/tools/skill_tools.py` — `skill_read(name)` for progressive disclosure; self-register under `toolset="skills"`
- `apps/agent/surfaces/notebook.py` (MOD) — add `"memory"` and `"skills"` to `toolset`
- `apps/agent/surfaces/hub.py` (MOD) — add `"memory"` and `"skills"` to `toolset`
- `apps/agent/pyproject.toml` (MOD) — add `PyYAML` to dependencies
- `apps/agent/skills/defaults/` (new, 3 example skills as seed content — copied to `~/.sparkflow/skills/` on first use via loader)
- `apps/agent/tests/test_memory_store.py`, `test_memory_tools.py`, `test_skills_loader.py`, `test_skills_index.py`, `test_prompt_builder_memory_skills.py`

**OUT of scope for P3** (deferred):
- Frontend UI for browsing/editing memories (future product decision; MVP is "agent manages its own memory")
- Skill self-authoring (LLM writing new skills; Hermes upstream has this, we don't need it yet)
- External memory providers (mem0 / honcho) — `memory/provider.py` stays empty until someone asks
- Cross-session memory aggregation ("user asks about X frequently") — belongs to later analytics work
- Production seeding of `~/.sparkflow/skills/` on deploy — that's ops concern, covered by ops docs

**Rollback:**
- The Prisma migration is **additive** — two new tables, no column changes elsewhere. Forward-only migration; if the feature needs to be removed, a future migration drops the tables.
- Every Python task ends with a commit; individual tasks can be reverted without touching siblings.
- `PromptBuilder._memory_snippet` / `_skills_snippet` return `""` on any error path (DB unreachable, skill dir missing, YAML malformed). Surface prompts still build; memory/skills just go quiet.

---

## Phase A — Memory (Tasks 1-7)

### Task 1: Prisma schema — `UserMemory` + `NotebookMemory` models

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Read `apps/web/prisma/schema.prisma`** to understand existing `User` + `Notebook` shapes and `@@map` conventions (`users`, `notebooks` tables).

- [ ] **Step 2: Add two new models plus back-relations**

Insert these models somewhere logical (e.g., near the other per-notebook models like `Source`, `Note`):

```prisma
model UserMemory {
  id        String   @id @default(cuid())
  userId    String
  category  String   // "profile" | "preference" | "fact" | "feedback"
  content   String   @db.Text
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, category])
  @@map("user_memory")
}

model NotebookMemory {
  id         String   @id @default(cuid())
  notebookId String
  category   String
  content    String   @db.Text
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  notebook Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)

  @@index([notebookId, category])
  @@map("notebook_memory")
}
```

Then add back-relations:

In the `User` model, alongside `notebooks Notebook[]` / `notes Note[]`:
```prisma
  memories UserMemory[]
```

In the `Notebook` model, alongside `sources Source[]` / `notes Note[]`:
```prisma
  memories NotebookMemory[]
```

- [ ] **Step 3: Verify the schema parses**

```bash
cd apps/web && npx prisma validate 2>&1 | tail -3
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat(web): add UserMemory + NotebookMemory Prisma models"
```

---

### Task 2: Generate migration SQL + hand-verify

**Files:**
- New: `apps/web/prisma/migrations/<timestamp>_add_memory_tables/migration.sql`

- [ ] **Step 1: Generate migration**

```bash
cd apps/web && npx prisma migrate dev --name add_memory_tables --create-only 2>&1 | tail -10
```

`--create-only` writes the SQL file without applying. This lets us inspect it.

- [ ] **Step 2: Inspect the generated SQL**

```bash
ls -1 apps/web/prisma/migrations/ | tail -3
cat apps/web/prisma/migrations/<latest>_add_memory_tables/migration.sql
```

Expected:
- `CREATE TABLE "user_memory" (...)`  and `CREATE TABLE "notebook_memory" (...)`.
- Two `CREATE INDEX` statements.
- Two `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ...` with `ON DELETE CASCADE`.
- NO `DROP COLUMN` / `DROP TABLE` anywhere.

Per `apps/web/CLAUDE.md`, any `DROP + ADD` for an existing column must be hand-edited to `RENAME COLUMN`. Memory tables are brand-new, so this shouldn't apply here — but verify.

- [ ] **Step 3: Apply the migration to the dev DB**

```bash
cd apps/web && npx prisma migrate dev 2>&1 | tail -5
```

Expected: "Your database is now in sync with your schema." and the Prisma Client is regenerated.

- [ ] **Step 4: Confirm tables exist**

```bash
cd apps/web && npx prisma db execute --stdin <<EOF
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name IN ('user_memory', 'notebook_memory')
ORDER BY table_name;
EOF
```

Expected output lists both tables. (If `prisma db execute --stdin` isn't the right form, use `psql` with `DATABASE_URL` directly.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/prisma/migrations/
git commit -m "feat(web): migration — create user_memory + notebook_memory tables"
```

---

### Task 3: `MemoryStore` (psycopg CRUD)

**Files:**
- Create: `apps/agent/hermes/memory/__init__.py` (empty)
- Create: `apps/agent/hermes/memory/store.py`
- Create: `apps/agent/tests/test_memory_store.py`

`MemoryStore` is a thin wrapper over `psycopg`. It speaks the exact column names Prisma emits (`userId`, `notebookId`, camelCase — Prisma's default for FK columns). Reads return dict rows; writes return the new id. Designed for request-scope use: one short-lived connection per call, relying on pg connection reuse via `DATABASE_URL`.

- [ ] **Step 1: Write the failing test**

Create `apps/agent/tests/test_memory_store.py`:

```python
"""Tests for hermes.memory.store.MemoryStore.

These tests use an in-memory stub for psycopg to avoid requiring a live DB.
Integration against the real DB is covered by the P3 smoke test (Task 13).
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
    store = MemoryStore(dsn="fake://ignored")
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
    assert cur.executed[0][1] == ("u1",)


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
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_memory_store.py -v 2>&1 | tail -10
```

Expected: `ModuleNotFoundError: No module named 'hermes.memory'`.

- [ ] **Step 3: Implement**

Create `apps/agent/hermes/memory/__init__.py` (empty).

Create `apps/agent/hermes/memory/store.py`:

```python
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
```

Note: `gen_random_uuid()::text` requires PostgreSQL's `pgcrypto` extension. It's typically available on managed Postgres; SparkFlow already uses `pgvector` so `pgcrypto` should be available. If it isn't, switch to Python-side uuid generation (`uuid.uuid4().hex`).

- [ ] **Step 4: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_memory_store.py -v 2>&1 | tail -15
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/hermes/memory/ apps/agent/tests/test_memory_store.py
git commit -m "feat(agent): add psycopg-backed MemoryStore for User/NotebookMemory"
```

---

### Task 4: Memory tools — `memory_read` / `memory_write` / `memory_forget`

**Files:**
- Create: `apps/agent/hermes/memory/tools.py`
- Create: `apps/agent/tests/test_memory_tools.py`

The tools are thin LangChain `@tool` wrappers that:

- Accept `scope: Literal["user", "notebook"]` plus the relevant id (user_id or notebook_id).
- Look up the current `user_id` / `notebook_id` from the `SurfaceRuntimeContext` — since tools can't access `Runtime` directly, we follow the same "explicit arg" pattern P2 used for `notebook_id` in wiki tools.
- `memory_read(scope, user_id, notebook_id?, category?)` → JSON list of memory rows.
- `memory_write(scope, user_id, notebook_id?, category, content)` → new memory id.
- `memory_forget(scope, user_id, notebook_id?, memory_id)` → ok/err.

- [ ] **Step 1: Write the failing test**

Create `apps/agent/tests/test_memory_tools.py`:

```python
"""Tests for hermes.memory.tools (LangChain tool wrappers)."""

from unittest.mock import MagicMock, patch

import pytest

from hermes.memory.tools import memory_read, memory_write, memory_forget


def test_memory_read_user_scope():
    fake_store = MagicMock()
    fake_store.read_user.return_value = [
        {"id": "m1", "userId": "u1", "category": "preference",
         "content": "dark mode", "createdAt": "2026-04-22", "updatedAt": "2026-04-22"},
    ]
    with patch("hermes.memory.tools._get_store", return_value=fake_store):
        result = memory_read.invoke({"scope": "user", "user_id": "u1"})

    import json
    parsed = json.loads(result)
    assert parsed[0]["content"] == "dark mode"
    fake_store.read_user.assert_called_once()


def test_memory_read_notebook_requires_notebook_id():
    fake_store = MagicMock()
    with patch("hermes.memory.tools._get_store", return_value=fake_store):
        result = memory_read.invoke({"scope": "notebook", "user_id": "u1"})
    import json
    parsed = json.loads(result)
    assert "error" in parsed
    assert "notebook_id" in parsed["error"].lower()


def test_memory_read_notebook_scope_ok():
    fake_store = MagicMock()
    fake_store.read_notebook.return_value = []
    with patch("hermes.memory.tools._get_store", return_value=fake_store):
        memory_read.invoke({"scope": "notebook", "user_id": "u1", "notebook_id": "nb1"})
    fake_store.read_notebook.assert_called_once_with(notebook_id="nb1", category=None)


def test_memory_write_user_scope():
    fake_store = MagicMock()
    fake_store.write_user.return_value = "mem_new"
    with patch("hermes.memory.tools._get_store", return_value=fake_store):
        result = memory_write.invoke({
            "scope": "user", "user_id": "u1", "category": "fact", "content": "x"
        })
    import json
    assert json.loads(result) == {"ok": True, "id": "mem_new"}


def test_memory_forget_user_scope():
    fake_store = MagicMock()
    with patch("hermes.memory.tools._get_store", return_value=fake_store):
        result = memory_forget.invoke({
            "scope": "user", "user_id": "u1", "memory_id": "mem_x"
        })
    import json
    assert json.loads(result) == {"ok": True}
    fake_store.forget_user.assert_called_once_with(user_id="u1", memory_id="mem_x")


def test_memory_tools_are_registered():
    from hermes.registry import registry
    # Import side-effect registers the tools
    import hermes.memory.tools  # noqa: F401
    names = {e.name for e in registry._tools.values() if e.toolset == "memory"}
    assert {"memory_read", "memory_write", "memory_forget"} <= names
```

- [ ] **Step 2: Run to verify failure**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_memory_tools.py -v 2>&1 | tail -10
```

Expected: `ModuleNotFoundError: No module named 'hermes.memory.tools'`.

- [ ] **Step 3: Implement**

Create `apps/agent/hermes/memory/tools.py`:

```python
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

    try:
        store = _get_store()
        if scope == "user":
            rows = store.read_user(user_id=user_id, category=category)
        else:
            if not notebook_id:
                return json.dumps({"error": "notebook_id is required for scope=notebook"})
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

    try:
        store = _get_store()
        if scope == "user":
            new_id = store.write_user(user_id=user_id, category=category, content=content)
        else:
            if not notebook_id:
                return json.dumps({"error": "notebook_id is required for scope=notebook"})
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

    try:
        store = _get_store()
        if scope == "user":
            store.forget_user(user_id=user_id, memory_id=memory_id)
        else:
            if not notebook_id:
                return json.dumps({"error": "notebook_id is required for scope=notebook"})
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
```

Wait — these tools currently live under `hermes/memory/tools.py` but AST discovery only scans `apps/agent/tools/*.py` (the `tools/` directory). We need to either:

- Move the tool wrappers into `apps/agent/tools/memory.py`, OR
- Extend discovery to also scan `apps/agent/hermes/memory/` etc.

Go with **Option A** — move. The implementation file `hermes/memory/store.py` stays where it is; only the LangChain `@tool` wrappers + `registry.register` calls move to `apps/agent/tools/memory.py`.

Revise Task 4: create `apps/agent/tools/memory.py` (not `hermes/memory/tools.py`). Keep the same content; only the path changes. Update the test file's import: `from tools.memory import memory_read, memory_write, memory_forget`.

- [ ] **Step 4: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_memory_tools.py -v 2>&1 | tail -15
```

Expected: 6 tests pass.

- [ ] **Step 5: Verify discovery picks up the new tool module**

```bash
cd apps/agent && .venv/bin/python -c "
from hermes.registry import discover_builtin_tools, registry
imported = discover_builtin_tools()
assert 'tools.memory' in imported, f'tools.memory not in {imported}'
tools = registry.get_tools(toolset={'memory'})
print(f'memory tools: {sorted(t.name for t in tools)}')
"
```

Expected: `memory tools: ['memory_forget', 'memory_read', 'memory_write']`.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/tools/memory.py apps/agent/tests/test_memory_tools.py
git commit -m "feat(agent): add memory_read/write/forget tools with registry self-registration"
```

---

### Task 5: Wire `PromptBuilder._memory_snippet`

**Files:**
- Modify: `apps/agent/hermes/prompt_builder.py`
- Modify: `apps/agent/tests/test_prompt_builder.py` (add memory-integration tests)

`_memory_snippet` in P1 is a no-op returning `""`. P3 implements it to produce a "## Memory" section when the surface's `memory_scope` is non-empty AND there's memory content to show.

Design notes:
- The snippet is part of the cached system prompt. Memory read happens once per session (first turn) and is frozen in the cache (Hermes "memory freeze" convention — protects LLM prefix cache).
- On DB error, log and return `""` — the surface prompt still works; memory just goes quiet.

- [ ] **Step 1: Add failing tests**

Append to `apps/agent/tests/test_prompt_builder.py`:

```python
def test_memory_snippet_returns_empty_when_no_user_id(tmp_path):
    pb = PromptBuilder()
    assert pb._memory_snippet(user_id="", notebook_id=None) == ""


def test_memory_snippet_returns_empty_when_store_unavailable(monkeypatch):
    """DB unreachable → empty snippet; prompt build must still succeed."""
    from hermes import prompt_builder as pb_mod

    class _BoomStore:
        def read_user(self, **kw):
            raise RuntimeError("DATABASE_URL unset")

    monkeypatch.setattr(pb_mod, "_get_memory_store", lambda: _BoomStore())

    pb = PromptBuilder()
    assert pb._memory_snippet(user_id="u1", notebook_id=None) == ""


def test_memory_snippet_renders_user_memories(monkeypatch):
    from hermes import prompt_builder as pb_mod

    class _FakeStore:
        def read_user(self, *, user_id, category=None, limit=50):
            return [
                {"id": "m1", "category": "preference", "content": "prefers bullets"},
                {"id": "m2", "category": "fact", "content": "uses gpt-4o"},
            ]

        def read_notebook(self, **kw):
            return []

    monkeypatch.setattr(pb_mod, "_get_memory_store", lambda: _FakeStore())

    pb = PromptBuilder()
    out = pb._memory_snippet(user_id="u1", notebook_id=None)
    assert "## Memory" in out
    assert "prefers bullets" in out
    assert "uses gpt-4o" in out


def test_memory_snippet_includes_notebook_memories(monkeypatch):
    from hermes import prompt_builder as pb_mod

    class _FakeStore:
        def read_user(self, **kw):
            return []

        def read_notebook(self, *, notebook_id, category=None, limit=50):
            return [{"id": "n1", "category": "fact", "content": "topic: diffusion models"}]

    monkeypatch.setattr(pb_mod, "_get_memory_store", lambda: _FakeStore())

    pb = PromptBuilder()
    out = pb._memory_snippet(user_id="u1", notebook_id="nb_1")
    assert "topic: diffusion models" in out
```

- [ ] **Step 2: Run failing tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_prompt_builder.py -v 2>&1 | tail -15
```

Expected: 4 new tests fail (returns `""` universally), other tests still pass.

- [ ] **Step 3: Implement `_memory_snippet`**

Add to `apps/agent/hermes/prompt_builder.py`:

1. Top-level `_get_memory_store()` helper (lazy singleton mirror of `tools/memory.py`'s pattern — so tests can monkeypatch it):

```python
_memory_store = None


def _get_memory_store():
    global _memory_store
    if _memory_store is None:
        from hermes.memory.store import MemoryStore
        _memory_store = MemoryStore()
    return _memory_store
```

2. Replace the existing `_memory_snippet` stub with:

```python
    def _memory_snippet(self, *, user_id: str, notebook_id: str | None) -> str:
        """Render a ``## Memory`` block for the system prompt.

        Reads user-level memory (always) and notebook-level memory (when
        ``notebook_id`` is provided). On any error (DB unreachable, etc.)
        returns an empty string so the prompt build still succeeds.
        """

        if not user_id:
            return ""

        try:
            store = _get_memory_store()
            user_rows = store.read_user(user_id=user_id) or []
            notebook_rows = (
                store.read_notebook(notebook_id=notebook_id) if notebook_id else []
            )
        except Exception:  # noqa: BLE001
            return ""

        if not user_rows and not notebook_rows:
            return ""

        lines: list[str] = ["## Memory\n"]
        lines.append(
            "Use `memory_read(...)` to retrieve a specific category; "
            "use `memory_write(...)` only for facts that will matter in future sessions.\n"
        )

        if user_rows:
            lines.append("### User memory\n")
            for row in user_rows:
                lines.append(f"- [{row.get('category', '-')}] {row.get('content', '')}")
            lines.append("")

        if notebook_rows:
            lines.append("### Notebook memory\n")
            for row in notebook_rows:
                lines.append(f"- [{row.get('category', '-')}] {row.get('content', '')}")

        return "\n".join(lines).strip()
```

- [ ] **Step 4: Tests pass**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_prompt_builder.py -v 2>&1 | tail -15
```

- [ ] **Step 5: Commit**

```bash
git add apps/agent/hermes/prompt_builder.py apps/agent/tests/test_prompt_builder.py
git commit -m "feat(agent): wire PromptBuilder._memory_snippet to MemoryStore"
```

---

### Task 6: Update `SurfaceConfig.toolset` for notebook + hub to include `"memory"`

**Files:**
- Modify: `apps/agent/surfaces/notebook.py`
- Modify: `apps/agent/surfaces/hub.py`

- [ ] **Step 1: Update notebook**

```python
NOTEBOOK = SurfaceConfig(
    name="notebook",
    surface_prompt_path="surfaces/notebook.md",
    toolset={"wiki", "memory"},   # was {"wiki"}
    context_refs=(WikiContentRef, NotebookSourcesRef),
    memory_scope=("user", "notebook"),
    max_iterations=30,
)
```

- [ ] **Step 2: Update hub**

```python
HUB = SurfaceConfig(
    name="hub",
    surface_prompt_path="surfaces/hub.md",
    toolset={"hub", "wechat", "navigation", "ui", "memory"},   # added "memory"
    context_refs=(PageContextRef,),
    memory_scope=("user",),
    max_iterations=20,
)
```

- [ ] **Step 3: Verify `graphs/surface.py` import still works + memory tools are visible**

```bash
cd apps/agent && .venv/bin/python -c "
from graphs.surface import notebook_graph, hub_graph
from hermes.registry import registry
from surfaces.notebook import NOTEBOOK
from surfaces.hub import HUB
tools_nb = registry.get_tools(toolset=NOTEBOOK.toolset)
tools_hub = registry.get_tools(toolset=HUB.toolset)
print('notebook tools:', sorted(t.name for t in tools_nb))
print('hub tools count:', len(tools_hub))
assert 'memory_read' in {t.name for t in tools_nb}
assert 'memory_read' in {t.name for t in tools_hub}
print('memory_* visible in both surfaces')
"
```

Expected: `memory_read`, `memory_write`, `memory_forget` appear in both surfaces' tool lists.

- [ ] **Step 4: Full-suite regression gate**

```bash
cd apps/agent && .venv/bin/python -m pytest -q 2>&1 | tail -3
```

- [ ] **Step 5: Commit**

```bash
git add apps/agent/surfaces/notebook.py apps/agent/surfaces/hub.py
git commit -m "feat(agent): add memory toolset to notebook + hub surfaces"
```

---

### Task 7: Update surface prompts to mention memory capabilities

**Files:**
- Modify: `apps/agent/prompts/surfaces/notebook.md`
- Modify: `apps/agent/prompts/surfaces/hub.md`

- [ ] **Step 1: Append a "Memory" section to `notebook.md`**

Append to the end of the file (after the "Tool arguments" section from P2):

```markdown

## Memory

You have three memory tools available:

- `memory_read(scope, user_id, notebook_id?, category?)` — retrieve past
  facts, preferences, or feedback. Call at the start of a session or when
  the user refers back to something you should remember.
- `memory_write(scope, user_id, category, content, notebook_id?)` —
  persist a new fact or preference. Use sparingly; only write things that
  will matter in FUTURE sessions (not the current conversation's text).
- `memory_forget(scope, user_id, memory_id, notebook_id?)` — delete a
  specific memory by id (found via `memory_read`).

Scopes:
- `user`: account-level memory (preferences, profile, cross-notebook facts).
- `notebook`: bound to the current notebook; use for notebook-specific
  observations and domain facts.
```

- [ ] **Step 2: Append a shorter "Memory" section to `hub.md`**

```markdown

## Memory

You can read and write user-level memory via `memory_read(scope="user",
user_id=...)` and `memory_write(scope="user", user_id=..., category=...,
content=...)`. Use this to remember user preferences across sessions
(favorite conferences, research interests, subscription preferences). The
hub does not have notebook-scoped memory.
```

- [ ] **Step 3: Commit**

```bash
git add apps/agent/prompts/surfaces/notebook.md apps/agent/prompts/surfaces/hub.md
git commit -m "docs(agent): describe memory tools in notebook + hub surface prompts"
```

---

## Phase B — Skills (Tasks 8-12)

### Task 8: Add `PyYAML` dependency

**Files:**
- Modify: `apps/agent/pyproject.toml`
- Modify: `apps/agent/requirements.txt`

- [ ] **Step 1: Add to `pyproject.toml`'s `[project].dependencies`**

Insert `"PyYAML>=6.0",` alongside other deps.

- [ ] **Step 2: Add to `requirements.txt`**

Append `PyYAML>=6.0`.

- [ ] **Step 3: Install in the venv**

```bash
cd apps/agent && uv pip install --python .venv/bin/python pyyaml 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add apps/agent/pyproject.toml apps/agent/requirements.txt
git commit -m "chore(agent): add PyYAML dep for skills frontmatter parsing"
```

---

### Task 9: `SkillsLoader` — scan + parse frontmatter

**Files:**
- Create: `apps/agent/hermes/skills/__init__.py` (empty)
- Create: `apps/agent/hermes/skills/loader.py`
- Create: `apps/agent/tests/test_skills_loader.py`

- [ ] **Step 1: Write the failing tests**

Create `apps/agent/tests/test_skills_loader.py`:

```python
"""Tests for hermes.skills.loader.SkillsLoader."""

import pytest

from hermes.skills.loader import Skill, SkillsLoader


def _write_skill(dir, name, frontmatter, body):
    (dir / f"{name}.md").write_text(frontmatter + "\n" + body, encoding="utf-8")


def test_loader_empty_dir_returns_empty_list(tmp_path):
    loader = SkillsLoader(skills_dir=tmp_path)
    assert loader.load_all() == []


def test_loader_parses_valid_skill(tmp_path):
    _write_skill(
        tmp_path, "literature-summary",
        frontmatter="""---
name: literature-summary
description: Summarize cited sources in a notebook.
applies_to: [notebook]
tools_required: [wiki_search, source_read]
---""",
        body="# Body\nProse about what to do.",
    )

    loader = SkillsLoader(skills_dir=tmp_path)
    skills = loader.load_all()
    assert len(skills) == 1
    s = skills[0]
    assert isinstance(s, Skill)
    assert s.name == "literature-summary"
    assert s.description == "Summarize cited sources in a notebook."
    assert s.applies_to == ["notebook"]
    assert s.tools_required == ["wiki_search", "source_read"]
    assert "Prose about what to do." in s.body


def test_loader_skips_files_without_frontmatter(tmp_path):
    (tmp_path / "no-frontmatter.md").write_text("just body, no frontmatter", encoding="utf-8")
    loader = SkillsLoader(skills_dir=tmp_path)
    assert loader.load_all() == []


def test_loader_skips_non_md_files(tmp_path):
    (tmp_path / "readme.txt").write_text("not markdown", encoding="utf-8")
    loader = SkillsLoader(skills_dir=tmp_path)
    assert loader.load_all() == []


def test_loader_handles_malformed_yaml_by_skipping(tmp_path):
    (tmp_path / "broken.md").write_text(
        "---\nname: broken\n  bad indent\n---\nbody", encoding="utf-8"
    )
    loader = SkillsLoader(skills_dir=tmp_path)
    # Malformed YAML is skipped with no exception
    assert loader.load_all() == []


def test_loader_missing_required_fields_skipped(tmp_path):
    # No `name` field → invalid, skipped
    (tmp_path / "noname.md").write_text(
        "---\ndescription: missing name\n---\nbody", encoding="utf-8"
    )
    loader = SkillsLoader(skills_dir=tmp_path)
    assert loader.load_all() == []


def test_loader_multiple_skills_returned_sorted_by_name(tmp_path):
    _write_skill(tmp_path, "zebra", "---\nname: zebra\ndescription: Z\n---", "")
    _write_skill(tmp_path, "apple", "---\nname: apple\ndescription: A\n---", "")

    loader = SkillsLoader(skills_dir=tmp_path)
    names = [s.name for s in loader.load_all()]
    assert names == ["apple", "zebra"]


def test_loader_nonexistent_dir_returns_empty(tmp_path):
    loader = SkillsLoader(skills_dir=tmp_path / "does-not-exist")
    assert loader.load_all() == []
```

- [ ] **Step 2: Implement**

Create `apps/agent/hermes/skills/__init__.py` (empty).

Create `apps/agent/hermes/skills/loader.py`:

```python
"""Skills loader — scans ``~/.sparkflow/skills/*.md`` and parses frontmatter.

A skill is a Markdown file with YAML frontmatter describing when to apply
it and which tools it needs. The body is only shown to the LLM when it
calls ``skill_read(name)`` — the system prompt's skills index injects just
the metadata.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import yaml


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Skill:
    """Parsed skill — frontmatter + body."""

    name: str
    description: str
    applies_to: list[str] = field(default_factory=list)  # surface names, or [] for all
    tools_required: list[str] = field(default_factory=list)
    body: str = ""
    source_path: Path | None = None


class SkillsLoader:
    """Scan a directory for skill Markdown files and parse them."""

    def __init__(self, *, skills_dir: Path | None = None) -> None:
        if skills_dir is None:
            skills_dir = Path.home() / ".sparkflow" / "skills"
        self.skills_dir = Path(skills_dir)

    def load_all(self) -> list[Skill]:
        if not self.skills_dir.exists() or not self.skills_dir.is_dir():
            return []

        skills: list[Skill] = []
        for path in sorted(self.skills_dir.glob("*.md")):
            skill = self._load_one(path)
            if skill is not None:
                skills.append(skill)
        return skills

    def _load_one(self, path: Path) -> Skill | None:
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            return None

        if not raw.startswith("---"):
            return None

        # Split: '---\n<frontmatter>\n---\n<body>'
        parts = raw.split("---", 2)
        if len(parts) < 3:
            return None

        _, fm_text, body_text = parts

        try:
            fm = yaml.safe_load(fm_text)
        except yaml.YAMLError:
            logger.warning("Skipping skill with malformed YAML: %s", path)
            return None

        if not isinstance(fm, dict):
            return None

        name = fm.get("name")
        description = fm.get("description")
        if not isinstance(name, str) or not isinstance(description, str):
            logger.warning("Skipping skill missing name/description: %s", path)
            return None

        return Skill(
            name=name,
            description=description,
            applies_to=list(fm.get("applies_to") or []),
            tools_required=list(fm.get("tools_required") or []),
            body=body_text.strip(),
            source_path=path,
        )
```

- [ ] **Step 3: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_skills_loader.py -v 2>&1 | tail -15
```

Expected: 8 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/hermes/skills/ apps/agent/tests/test_skills_loader.py
git commit -m "feat(agent): add SkillsLoader with YAML frontmatter parsing"
```

---

### Task 10: `SkillsIndex` — two-level cache + filter

**Files:**
- Modify: `apps/agent/hermes/skills/__init__.py` (still empty)
- Create: `apps/agent/hermes/skills/index.py`
- Create: `apps/agent/tests/test_skills_index.py`

The index is what the PromptBuilder consumes. It exposes:

- `get_index(surface: str, toolset: set[str]) -> list[Skill]` — filters skills by `applies_to` (surface match or empty = any) and by `tools_required ⊆ toolset`.
- Two-level cache: in-memory `OrderedDict` (cap 8) keyed by `(skills_dir_mtime, surface, tuple(sorted(toolset)))`, plus a disk snapshot `~/.sparkflow/skills/.skills_index_snapshot.json` validated against a mtime+size manifest.

For P3 MVP, implement **Level 1 only** (in-memory). Level 2 disk snapshot is an optimization for fast process boot; flag it as future work. This keeps Task 10 bounded.

- [ ] **Step 1: Write the failing tests**

Create `apps/agent/tests/test_skills_index.py`:

```python
"""Tests for hermes.skills.index.SkillsIndex."""

from pathlib import Path

import pytest

from hermes.skills.index import SkillsIndex
from hermes.skills.loader import Skill, SkillsLoader


def _write(dir, name, description, applies_to=None, tools_required=None):
    applies_to_yaml = applies_to if applies_to is not None else []
    tools_yaml = tools_required if tools_required is not None else []
    fm = f"""---
name: {name}
description: {description}
applies_to: {applies_to_yaml}
tools_required: {tools_yaml}
---
Body for {name}.
"""
    (dir / f"{name}.md").write_text(fm, encoding="utf-8")


def test_index_filters_by_surface(tmp_path):
    _write(tmp_path, "for-notebook", "nb skill", applies_to=["notebook"])
    _write(tmp_path, "for-hub", "hub skill", applies_to=["hub"])
    _write(tmp_path, "for-all", "universal skill", applies_to=[])

    idx = SkillsIndex(loader=SkillsLoader(skills_dir=tmp_path))
    nb_skills = {s.name for s in idx.get_index(surface="notebook", toolset={"wiki"})}
    assert "for-notebook" in nb_skills
    assert "for-all" in nb_skills
    assert "for-hub" not in nb_skills


def test_index_filters_by_tools_required(tmp_path):
    _write(tmp_path, "needs-wiki", "x", tools_required=["wiki_search"])
    _write(tmp_path, "needs-hub", "x", tools_required=["search_conferences"])

    idx = SkillsIndex(loader=SkillsLoader(skills_dir=tmp_path))
    # Only wiki_search tool available → needs-wiki qualifies, needs-hub doesn't
    result = {s.name for s in idx.get_index(surface="notebook", toolset={"wiki_search"})}
    assert "needs-wiki" in result
    assert "needs-hub" not in result


def test_index_caches_in_memory(tmp_path):
    _write(tmp_path, "cached", "c")

    loader = SkillsLoader(skills_dir=tmp_path)
    idx = SkillsIndex(loader=loader)

    _ = idx.get_index(surface="notebook", toolset={"wiki"})
    _ = idx.get_index(surface="notebook", toolset={"wiki"})
    # Second call should hit the in-memory cache; we test this by checking
    # cache internals (acceptable for unit tests).
    assert len(idx._cache) >= 1


def test_index_invalidate_clears_cache(tmp_path):
    _write(tmp_path, "x", "x")
    loader = SkillsLoader(skills_dir=tmp_path)
    idx = SkillsIndex(loader=loader)
    idx.get_index(surface="notebook", toolset={"wiki"})
    assert len(idx._cache) >= 1
    idx.invalidate()
    assert len(idx._cache) == 0


def test_render_snippet_empty_when_no_skills(tmp_path):
    loader = SkillsLoader(skills_dir=tmp_path)  # empty dir
    idx = SkillsIndex(loader=loader)
    snippet = idx.render_snippet(surface="notebook", toolset={"wiki"})
    assert snippet == ""


def test_render_snippet_includes_name_description_and_applies_to(tmp_path):
    _write(tmp_path, "lit", "Summarize cited sources.",
           applies_to=["notebook"], tools_required=["wiki_search"])

    loader = SkillsLoader(skills_dir=tmp_path)
    idx = SkillsIndex(loader=loader)
    snippet = idx.render_snippet(surface="notebook", toolset={"wiki_search"})
    assert "## Skills" in snippet
    assert "lit" in snippet
    assert "Summarize cited sources" in snippet
    # Body should NOT be in the snippet (progressive disclosure)
    assert "Body for lit" not in snippet
```

- [ ] **Step 2: Implement**

Create `apps/agent/hermes/skills/index.py`:

```python
"""Skills index — filters and renders the system-prompt snippet.

In-memory LRU cache keyed by ``(surface, sorted(toolset))``. Disk-snapshot
tier is deferred to a future task.
"""

from __future__ import annotations

from collections import OrderedDict

from hermes.skills.loader import Skill, SkillsLoader


_CACHE_CAP = 8


class SkillsIndex:
    """Query skills by surface and available toolset."""

    def __init__(self, *, loader: SkillsLoader | None = None) -> None:
        self.loader = loader or SkillsLoader()
        self._cache: OrderedDict[tuple[str, tuple[str, ...]], list[Skill]] = OrderedDict()

    def invalidate(self) -> None:
        self._cache.clear()

    def get_index(self, *, surface: str, toolset: set[str]) -> list[Skill]:
        key = (surface, tuple(sorted(toolset)))
        cached = self._cache.get(key)
        if cached is not None:
            self._cache.move_to_end(key)
            return cached

        skills = self.loader.load_all()
        result: list[Skill] = []
        for s in skills:
            if s.applies_to and surface not in s.applies_to:
                continue
            if s.tools_required and not set(s.tools_required).issubset(toolset):
                continue
            result.append(s)

        self._cache[key] = result
        if len(self._cache) > _CACHE_CAP:
            self._cache.popitem(last=False)
        return result

    def render_snippet(self, *, surface: str, toolset: set[str]) -> str:
        """Render the ``## Skills`` block for the system prompt.

        Each skill appears as a one-liner. Full body is NOT included —
        the LLM must call ``skill_read(name)`` to fetch it (progressive
        disclosure).
        """

        skills = self.get_index(surface=surface, toolset=toolset)
        if not skills:
            return ""

        lines: list[str] = [
            "## Skills\n",
            "Below is the index of skills available for this surface. "
            "Call `skill_read(name)` to load the full body of any skill before applying it.\n",
        ]
        for s in skills:
            applies = f" (applies_to: {', '.join(s.applies_to)})" if s.applies_to else ""
            lines.append(f"- **{s.name}**{applies} — {s.description}")
        return "\n".join(lines)
```

- [ ] **Step 3: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_skills_index.py -v 2>&1 | tail -15
```

Expected: 6 tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/hermes/skills/index.py apps/agent/tests/test_skills_index.py
git commit -m "feat(agent): add SkillsIndex with surface+toolset filtering and in-memory cache"
```

---

### Task 11: `skill_read` tool

**Files:**
- Create: `apps/agent/tools/skills.py`

The tool lets the LLM fetch the full body of a named skill on demand.

- [ ] **Step 1: Create**

```python
"""Skills tools — progressive disclosure for skill bodies."""

from __future__ import annotations

import json

from langchain_core.tools import tool

from hermes.registry import registry
from hermes.skills.loader import SkillsLoader


_loader: SkillsLoader | None = None


def _get_loader() -> SkillsLoader:
    global _loader
    if _loader is None:
        _loader = SkillsLoader()
    return _loader


@tool
def skill_read(name: str) -> str:
    """Read the full body of a named skill.

    Use this when a skill listed in the system prompt's Skills section
    looks relevant and you need its full instructions. The body contains
    the step-by-step approach.

    Args:
        name: The skill name as listed in the Skills index.
    """

    loader = _get_loader()
    for s in loader.load_all():
        if s.name == name:
            return s.body
    return json.dumps({"error": f"Unknown skill: {name}"})


# --- hermes.registry self-registration (P3) -----------------------------
registry.register(
    name=skill_read.name,
    toolset="skills",
    tool=skill_read,
    description="Read the full body of a named skill (progressive disclosure).",
)
```

- [ ] **Step 2: Verify**

```bash
cd apps/agent && .venv/bin/python -c "
from hermes.registry import discover_builtin_tools, registry
imported = discover_builtin_tools()
assert 'tools.skills' in imported
tools = registry.get_tools(toolset={'skills'})
print('skills tools:', [t.name for t in tools])
"
```

- [ ] **Step 3: Commit**

```bash
git add apps/agent/tools/skills.py
git commit -m "feat(agent): add skill_read tool for progressive skill disclosure"
```

---

### Task 12: Wire `PromptBuilder._skills_snippet`

**Files:**
- Modify: `apps/agent/hermes/prompt_builder.py`
- Modify: `apps/agent/tests/test_prompt_builder.py`

- [ ] **Step 1: Add failing tests**

Append to `apps/agent/tests/test_prompt_builder.py`:

```python
def test_skills_snippet_empty_when_no_skills_dir(monkeypatch, tmp_path):
    from hermes import prompt_builder as pb_mod

    class _EmptyIndex:
        def render_snippet(self, *, surface, toolset):
            return ""

    monkeypatch.setattr(pb_mod, "_get_skills_index", lambda: _EmptyIndex())

    pb = PromptBuilder()
    assert pb._skills_snippet(surface_path="surfaces/notebook.md") == ""


def test_skills_snippet_renders_when_skills_available(monkeypatch):
    from hermes import prompt_builder as pb_mod

    class _FakeIndex:
        def render_snippet(self, *, surface, toolset):
            return f"## Skills\n- **example** — for {surface}"

    monkeypatch.setattr(pb_mod, "_get_skills_index", lambda: _FakeIndex())

    pb = PromptBuilder()
    out = pb._skills_snippet(surface_path="surfaces/notebook.md")
    assert "## Skills" in out
    assert "notebook" in out  # surface name threaded through
```

- [ ] **Step 2: Implement**

Add to `apps/agent/hermes/prompt_builder.py` top-level:

```python
_skills_index = None


def _get_skills_index():
    global _skills_index
    if _skills_index is None:
        from hermes.skills.index import SkillsIndex
        _skills_index = SkillsIndex()
    return _skills_index
```

Replace the `_skills_snippet` stub with:

```python
    def _skills_snippet(self, *, surface_path: str) -> str:
        """Render the ``## Skills`` block (layer 6 of the prompt).

        Surface name is derived from ``surface_path`` (last path segment
        without ``.md`` extension). Toolset filtering is NOT performed
        here — the PromptBuilder doesn't know the surface's toolset at
        this layer, so the index shows all skills applicable to the
        surface. The tool-requirement filter is left for future tuning.
        """

        # "surfaces/notebook.md" → "notebook"
        surface_name = surface_path.rsplit("/", 1)[-1].rsplit(".", 1)[0]

        try:
            idx = _get_skills_index()
            return idx.render_snippet(surface=surface_name, toolset=set())
        except Exception:  # noqa: BLE001
            return ""
```

Wait — passing `toolset=set()` means the `tools_required ⊆ toolset` check fails for any skill that requires tools. Revise: we want skills whose `tools_required` is EMPTY or is a subset. Adjust `SkillsIndex.get_index` to treat empty `toolset` as "allow all skills regardless of tools_required", OR pass the real surface toolset to `_skills_snippet`.

Cleanest: thread the real toolset. Change the `_skills_snippet` signature to also take `toolset: set[str]`, and update the call in `build()`:

```python
        if not skip_skills:                                                    # 6
            skills = self._skills_snippet(surface_path=surface_prompt_path, toolset=toolset)
            if skills:
                parts.append(skills)
```

But the PromptBuilder `build()` method doesn't currently take `toolset`. Adding it is a breaking change on the public API. Alternative: inside `make_llm_call`, pass the config.toolset via `extra_caller_system` — ugly.

Simplest pragmatic fix: extend `build()` with optional `toolset: set[str] = frozenset()` parameter. Callers who don't pass it lose skill-tool filtering, which degrades gracefully.

Alternatively, interpret `toolset=set()` in SkillsIndex.get_index as "no tool filter, show everything that matches surface". Cleaner — go with this.

Update `SkillsIndex.get_index`:

```python
        for s in skills:
            if s.applies_to and surface not in s.applies_to:
                continue
            if toolset and s.tools_required and not set(s.tools_required).issubset(toolset):
                continue
            result.append(s)
```

Now `toolset=set()` means "don't filter by tools". This is intuitive. Re-run the `test_index_filters_by_tools_required` test — it passes an explicit toolset, so behavior is unchanged.

Apply this change in Task 10's implementation AND update the test if needed (it should still pass because the test provides a non-empty toolset).

- [ ] **Step 3: Run tests**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_prompt_builder.py tests/test_skills_index.py -v 2>&1 | tail -15
```

- [ ] **Step 4: Commit**

```bash
git add apps/agent/hermes/prompt_builder.py apps/agent/hermes/skills/index.py apps/agent/tests/test_prompt_builder.py
git commit -m "feat(agent): wire PromptBuilder._skills_snippet to SkillsIndex"
```

---

### Task 13: Seed `apps/agent/skills/defaults/` with 3 example skills

**Files:**
- Create: `apps/agent/skills/defaults/notebook-literature-summary.md`
- Create: `apps/agent/skills/defaults/conference-recommendation.md`
- Create: `apps/agent/skills/defaults/memory-bootstrap.md`
- Create: `apps/agent/skills/README.md`

These are reference skills. Ops / dev docs will tell users to copy them to `~/.sparkflow/skills/` to activate.

- [ ] **Step 1: `notebook-literature-summary.md`**

```markdown
---
name: notebook-literature-summary
description: Summarize the cited sources in a notebook, organized by theme.
applies_to: [notebook]
tools_required: [wiki_search, source_read]
---

# Notebook literature summary

When the user asks for a summary of the notebook's sources or "what do my
papers say about X", follow this approach:

1. Call ``wiki_search`` (if available) with the topic keyword to surface
   the relevant wiki pages and their source ids.
2. Group matching sources by theme (method, dataset, result).
3. For each group, call ``source_read(notebook_id, source_id)`` on the
   strongest 1-2 representative sources and quote exact passages.
4. Produce a 3-section summary: **Consensus**, **Disagreements**,
   **Open questions**. Cite `[source:id]` inline for every claim.
5. End with a one-line "what to read next" suggestion if any source stood
   out as a deeper dive.

If ``wiki_search`` is unavailable, fall back to ``source_list`` + manual
filtering by title keyword.
```

- [ ] **Step 2: `conference-recommendation.md`**

```markdown
---
name: conference-recommendation
description: Recommend conferences or sessions matching the user's research interests.
applies_to: [hub]
tools_required: [search_conferences, search_sessions]
---

# Conference recommendation

When the user asks "which conferences should I attend" or "suggest
sessions about X":

1. Read user memory (``memory_read(scope="user", category="preference")``)
   to surface stated research interests.
2. Call ``search_conferences`` for recent / upcoming venues matching the
   topic; take the top 5 by recency + relevance.
3. For each candidate conference, call ``search_sessions`` filtered by the
   conference id.
4. Present via ``show_table`` with columns: Conference, Session title,
   Date, Relevance-why (1-line reason).
5. Offer a follow-up: "save to memory" via ``memory_write`` for any
   confirmed attendance or interest.
```

- [ ] **Step 3: `memory-bootstrap.md`**

```markdown
---
name: memory-bootstrap
description: Seed user-level memory with preferences inferred from the current conversation.
applies_to: []
tools_required: [memory_read, memory_write]
---

# Memory bootstrap

When the user is new (no user-level memory entries yet) and mentions
something that looks like a lasting preference:

1. Check with ``memory_read(scope="user", category="preference")`` to
   avoid duplicates.
2. If genuinely new, confirm with the user in one line: "I'll remember
   you prefer X — okay?"
3. On confirmation, call ``memory_write(scope="user", category="preference",
   content="<short statement>", user_id=<current>)``.
4. Do NOT seed memory for one-off facts or things that won't matter next
   session. Err on NOT writing.
```

- [ ] **Step 4: `apps/agent/skills/README.md`**

```markdown
# SparkFlow skills

These Markdown files are example skills for the hermes harness.

## Installation

Copy any file you want to activate into `~/.sparkflow/skills/`:

```bash
mkdir -p ~/.sparkflow/skills
cp apps/agent/skills/defaults/*.md ~/.sparkflow/skills/
```

The hermes `SkillsLoader` scans that directory at first use and caches the
index in-memory.

## Authoring

Each skill is a Markdown file with YAML frontmatter:

```yaml
---
name: short-kebab-name
description: One-line summary shown in the system prompt.
applies_to: [notebook, hub]  # empty = any surface
tools_required: [wiki_search, source_read]  # only listed skills appear when ALL required tools are available to the surface
---

# Free-form body — only fetched via ``skill_read(name)`` at the LLM's request.
```

The body is shown to the LLM only when it explicitly calls `skill_read(name)`
(progressive disclosure).
```

- [ ] **Step 5: Commit**

```bash
git add apps/agent/skills/
git commit -m "docs(agent): seed example skills (literature summary, conf recommend, memory bootstrap)"
```

---

### Task 14: Full-suite verification

- [ ] **Step 1: Run all agent tests**

```bash
cd apps/agent && .venv/bin/python -m pytest -v 2>&1 | tail -15
```

Expected: P1's 46 + P2's 11 + P3's additions = **~80-90 tests passing**.

- [ ] **Step 2: Verify tool registry**

```bash
cd apps/agent && .venv/bin/python -c "
from hermes.registry import discover_builtin_tools, registry
discover_builtin_tools()
for ts in ('wiki', 'hub', 'wechat', 'navigation', 'ui', 'memory', 'skills', '_test'):
    print(f'{ts}: {len(registry.get_tools(toolset={ts}))}')
print('total:', len(registry._tools))
"
```

Expected: `memory: 3`, `skills: 1`, plus counts from P2.

- [ ] **Step 3: Verify graphs still import**

```bash
cd apps/agent && .venv/bin/python -c "
import graphs.rag_agent, graphs.hub_agent, graphs.search_agent
from graphs.surface import notebook_graph, hub_graph
print('all graphs OK')
"
```

- [ ] **Step 4: Verify Prisma schema parses + migration applied**

```bash
cd apps/web && npx prisma validate 2>&1 | tail -3
cd apps/web && npx prisma migrate status 2>&1 | tail -10
```

Expected: validate clean; `migrate status` shows `add_memory_tables` as applied.

- [ ] **Step 5: No commit — acceptance gate.**

---

## Self-review checklist (run before push)

- [ ] Every task ends with a commit. `git log --oneline main..HEAD` shows ~14 new commits.
- [ ] All agent tests pass.
- [ ] `apps/web/prisma/schema.prisma` has `UserMemory` and `NotebookMemory` models with `@@map("user_memory")` / `@@map("notebook_memory")` and proper `onDelete: Cascade`.
- [ ] Migration file lives under `apps/web/prisma/migrations/<timestamp>_add_memory_tables/migration.sql` and contains only `CREATE TABLE`/`CREATE INDEX`/`ALTER TABLE ADD CONSTRAINT` — no `DROP`.
- [ ] `apps/agent/tools/memory.py` and `apps/agent/tools/skills.py` both have module-top-level `registry.register(...)` calls.
- [ ] `apps/agent/surfaces/notebook.py`'s toolset includes `"memory"` and `"skills"`.
- [ ] `apps/agent/surfaces/hub.py`'s toolset includes `"memory"` and `"skills"`.
- [ ] `PromptBuilder._memory_snippet` reads from `_get_memory_store()` and returns `""` on any error.
- [ ] `PromptBuilder._skills_snippet` reads from `_get_skills_index()` and returns `""` on any error.
- [ ] `apps/agent/skills/defaults/` contains 3 example skills + README.
- [ ] `apps/agent/pyproject.toml` and `requirements.txt` both include `PyYAML>=6.0`.
- [ ] No placeholder text in any committed file.

## What's NOT done after P3

- Level-2 on-disk skills cache (`.skills_index_snapshot.json`) — in-memory only for now.
- Memory/skills seen in frontend UI — memories are behind the agent; no settings page work.
- External memory provider adapters (mem0 / honcho) — structure exists (`memory/provider.py` if we ever need it) but nothing wired.
- Automated seeding of `~/.sparkflow/skills/` — dev docs point users to `cp` the defaults.
- Search workflow (`workflows/search.py`) — that's P4.
- Matcher workflow extraction (`workflows/matcher.py`) — P5.
- Digest orchestrator Python port — P6.
