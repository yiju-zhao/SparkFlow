# Hermes Harness — P6 (Daily Digest Backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Context:** The daily digest feature was designed in `docs/superpowers/specs/2026-04-21-daily-digest-design.md` but never shipped. The hermes-harness spec's §11 amended that design so the orchestration lives in **Python** (`apps/agent/workflows/daily_digest.py`) rather than Node (`apps/web/lib/services/digest/`). This plan implements the **backend** per both specs combined: schema, migration, Python workflow, Node thin API proxies. Frontend `/digest` page + settings UI is a separate follow-up phase (per P6's scope boundary).

**Goal:** Backend-complete daily digest:

1. Prisma `DailyDigest` + `DigestSection` models + `digestConfig` JSON on `UserSettings`, with a migration.
2. Python `apps/agent/workflows/daily_digest.py` — fully implements the per-section pipeline (wechat pool → semops rank → DigestItem construction) + HTTP callback to Node on completion.
3. Node thin API routes under `apps/web/app/api/digest/`:
   - `POST /api/digest/generate` — validate request, create `DailyDigest` + `DigestSection` rows in GENERATING state, fire workflow HTTP (fire-and-forget), return 202.
   - `GET /api/digest?date=YYYY-MM-DD` — read cached digest.
   - `GET /api/digest/[digestId]/sections/[sectionId]/status` — poll section status.
   - `POST /api/digest/sections/[sectionId]/complete` — **internal**; called by the Python workflow on completion to write items + status.
4. Type definitions + thin lib helpers in `apps/web/lib/digest/`.

**OUT of scope (→ later P6b or parallel UI work):**
- `/digest` frontend page (magazine layout).
- `/settings#daily-digest` UI.
- Any non-WeChat source type (the schema is pluggable but v1 only indexes the `WECHAT` enum value).
- Regenerate endpoint (`POST /api/digest/regenerate`) — defer; users work around with delete+generate for v1.

**Architecture highlight:** The Python workflow calls back to Node via `POST /api/digest/sections/{id}/complete` to persist results. Node owns the DB; Python does the semantic orchestration. This matches P4 / P5 pattern (workflow in Python, DB persistence via Node RPC).

**Spec references:**
- `docs/superpowers/specs/2026-04-21-daily-digest-design.md` — UI/UX, data model, API contracts.
- `docs/superpowers/specs/2026-04-22-hermes-harness-design.md` §11 — orchestration-layer amendment.

---

## Phase A — Schema + migration (Tasks 1-3)

### Task 1: Prisma schema changes

**Files:** `apps/web/prisma/schema.prisma`

- [ ] Add two enums + two models + relation on `User` + `digestConfig` JSON on `UserSettings`:

```prisma
enum DigestSourceType {
  WECHAT
}

enum DigestStatus {
  GENERATING
  COMPLETED
  EMPTY
  FAILED
}

model DailyDigest {
  id          String          @id @default(cuid())
  userId      String
  digestDate  DateTime        @db.Date
  generatedAt DateTime        @default(now())

  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  sections    DigestSection[]

  @@unique([userId, digestDate])
  @@index([userId, digestDate(sort: Desc)])
  @@map("daily_digest")
}

model DigestSection {
  id            String            @id @default(cuid())
  digestId      String
  sourceType    DigestSourceType
  status        DigestStatus      @default(GENERATING)
  items         Json              @default("[]")
  candidatePool Int               @default(0)
  modelUsed     String?
  error         String?
  startedAt     DateTime          @default(now())
  completedAt   DateTime?

  digest        DailyDigest       @relation(fields: [digestId], references: [id], onDelete: Cascade)

  @@unique([digestId, sourceType])
  @@map("digest_section")
}
```

On `User` model, add:
```prisma
  dailyDigests DailyDigest[]
```

On `UserSettings`, add:
```prisma
  digestConfig Json @default("{}")
```

- [ ] **Validate**: `cd apps/web && npx prisma validate`.
- [ ] **Commit**: `feat(web): add DailyDigest + DigestSection schema + digestConfig JSON`.

### Task 2: Hand-craft migration SQL

Because the pre-existing shadow-DB issue (`20260422000000_rename_matcher_to_semops`) still blocks `prisma migrate dev`, hand-craft the migration:

**File:** `apps/web/prisma/migrations/20260423120000_add_daily_digest/migration.sql`

```sql
-- CreateEnum
CREATE TYPE "DigestSourceType" AS ENUM ('WECHAT');

-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('GENERATING', 'COMPLETED', 'EMPTY', 'FAILED');

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN "digestConfig" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "daily_digest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digestDate" DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "digest_section" (
    "id" TEXT NOT NULL,
    "digestId" TEXT NOT NULL,
    "sourceType" "DigestSourceType" NOT NULL,
    "status" "DigestStatus" NOT NULL DEFAULT 'GENERATING',
    "items" JSONB NOT NULL DEFAULT '[]',
    "candidatePool" INTEGER NOT NULL DEFAULT 0,
    "modelUsed" TEXT,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "digest_section_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "daily_digest_userId_digestDate_key" ON "daily_digest"("userId", "digestDate");

-- CreateIndex
CREATE INDEX "daily_digest_userId_digestDate_idx" ON "daily_digest"("userId", "digestDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "digest_section_digestId_sourceType_key" ON "digest_section"("digestId", "sourceType");

-- AddForeignKey
ALTER TABLE "daily_digest" ADD CONSTRAINT "daily_digest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "digest_section" ADD CONSTRAINT "digest_section_digestId_fkey" FOREIGN KEY ("digestId") REFERENCES "daily_digest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Commit**: `feat(web): migration — create daily_digest + digest_section tables`.

### Task 3: TypeScript types

**File:** `apps/web/lib/types/digest.ts` (new)

```typescript
import type { DigestSourceType, DigestStatus } from "@prisma/client";

export type { DigestSourceType, DigestStatus };

/** One entry inside DigestSection.items (JSON). */
export interface DigestItem {
  rank: number;                  // 1..topN
  externalId: string;            // source-native id as string
  sourceRefId: string | number;
  sourceName: string;
  title: string;
  author?: string;
  publishedAt: string;           // ISO 8601
  url: string;
  score: number;                 // 0..1
  matchedQueries: string[];
  reason: string;
  summary: string;
  meta?: Record<string, unknown>;
}

/** User's `digestConfig` JSON on UserSettings. */
export interface DigestConfig {
  queries: {
    id: string;                  // stable uuid
    text: string;                // <= 200 chars
    enabled: boolean;
    createdAt: string;           // ISO 8601
  }[];
  sources: {
    wechat?: {
      subscribedSourceIds: number[];   // empty = all
      topN: number;                     // 1..10, default 5
    };
  };
}

export interface DigestSectionStatus {
  id: string;
  sourceType: DigestSourceType;
  status: DigestStatus;
  items: DigestItem[];
  candidatePool: number;
  modelUsed: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface DigestGenerateRequest {
  date: string;                  // "YYYY-MM-DD"; defaults to today server-side
  sources?: DigestSourceType[];  // defaults to all configured
}
```

- [ ] **Commit**: `feat(web): add digest TypeScript types`.

---

## Phase B — Python workflow (Tasks 4-5)

### Task 4: `workflows/daily_digest.py`

**Files:**
- `apps/agent/workflows/daily_digest.py` (new)
- `apps/agent/tests/test_workflows_daily_digest.py` (new)

**Shape:** `async def generate_section(req: GenerateSectionRequest)` — accepts a section id + config + model config, does:

1. Build wechat candidate pool by calling back to Next.js `/api/explore/search/wechat/prefilter` for each enabled query; union+dedupe by article id; cap at 30.
2. If pool is empty, call `/api/digest/sections/{sectionId}/complete` with `{status: "EMPTY", items: []}` and return.
3. Assemble candidate text: `"Title: {t} | Author: {a} | Source: {s} | Summary: {c[:300]}"`.
4. Call semops `/api/operators/rank` with the candidates, `text_field="text"`, joint query (all enabled queries concatenated), top_k from config, `include_reasons=True`, `model_config`.
5. Transform semops output into DigestItem-shaped dicts; attach `meta.cover_url` from the original wechat row.
6. HTTP POST results to `/api/digest/sections/{sectionId}/complete` with `{status: "COMPLETED", items: [...], model_used: "provider/model", completed_at: ISO}`.

Error path: if any step raises, call `/api/digest/sections/{sectionId}/complete` with `{status: "FAILED", error: str(exc)}`.

Mount on FastAPI: `POST /v1/workflows/daily_digest/sections/{section_id}/generate` triggers `asyncio.create_task(generate_section(...))` and returns 202 immediately.

**Tests**:

```python
# apps/agent/tests/test_workflows_daily_digest.py
"""Tests for workflows.daily_digest — all HTTP calls are mocked."""

import pytest
from unittest.mock import AsyncMock, patch

from workflows.daily_digest import GenerateSectionRequest, generate_section


@pytest.mark.asyncio
async def test_empty_pool_posts_empty_status(monkeypatch):
    monkeypatch.setattr("workflows.daily_digest._prefilter_wechat",
                         AsyncMock(return_value=[]))
    complete_mock = AsyncMock()
    monkeypatch.setattr("workflows.daily_digest._complete_section", complete_mock)

    req = GenerateSectionRequest(
        section_id="sec_1", source_type="WECHAT", digest_date="2026-04-22",
        queries=[{"id": "q1", "text": "agents", "enabled": True}],
        subscribed_source_ids=[], top_n=5,
        model_provider="openai", model_name="gpt-4o-mini", api_key=None,
    )
    await generate_section(req)

    assert complete_mock.await_args.kwargs["status"] == "EMPTY"


@pytest.mark.asyncio
async def test_successful_pipeline(monkeypatch):
    monkeypatch.setattr("workflows.daily_digest._prefilter_wechat",
                         AsyncMock(return_value=[
                             {"id": 1, "title": "t1", "source_name": "s1",
                              "author": "a", "content_text": "x", "url": "u1",
                              "publish_time": "2026-04-22T00:00:00Z",
                              "cover_url": None, "matched_queries": ["q1"], "score": 0.9},
                         ]))
    monkeypatch.setattr("workflows.daily_digest._semops_rank",
                         AsyncMock(return_value={
                             "ranked": [{"id": 1, "text": "Title: t1"}],
                             "reasons": {"1": "relevant"},
                         }))
    complete_mock = AsyncMock()
    monkeypatch.setattr("workflows.daily_digest._complete_section", complete_mock)

    req = GenerateSectionRequest(
        section_id="sec_ok", source_type="WECHAT", digest_date="2026-04-22",
        queries=[{"id": "q1", "text": "agents", "enabled": True}],
        subscribed_source_ids=[1, 2], top_n=5,
        model_provider="openai", model_name="gpt-4o-mini", api_key=None,
    )
    await generate_section(req)

    call_kwargs = complete_mock.await_args.kwargs
    assert call_kwargs["status"] == "COMPLETED"
    assert len(call_kwargs["items"]) == 1
    assert call_kwargs["items"][0]["reason"] == "relevant"


@pytest.mark.asyncio
async def test_failure_posts_failed_status(monkeypatch):
    monkeypatch.setattr("workflows.daily_digest._prefilter_wechat",
                         AsyncMock(side_effect=RuntimeError("db down")))
    complete_mock = AsyncMock()
    monkeypatch.setattr("workflows.daily_digest._complete_section", complete_mock)

    req = GenerateSectionRequest(
        section_id="sec_err", source_type="WECHAT", digest_date="2026-04-22",
        queries=[], subscribed_source_ids=[], top_n=5,
        model_provider="openai", model_name="gpt-4o-mini", api_key=None,
    )
    await generate_section(req)

    call_kwargs = complete_mock.await_args.kwargs
    assert call_kwargs["status"] == "FAILED"
    assert "db down" in call_kwargs["error"]
```

- [ ] Write the module with full TDD; aim for ~300 lines of code.
- [ ] **Commit**: `feat(agent): add workflows/daily_digest.py (per-section pipeline)`.

### Task 5: Mount daily_digest route

**File:** `apps/agent/server/app.py`

Add:
```python
from workflows.daily_digest import GenerateSectionRequest, generate_section as run_generate_section

@app.post("/v1/workflows/daily_digest/sections/{section_id}/generate", status_code=202)
async def daily_digest_generate(section_id: str, req: GenerateSectionRequest) -> dict[str, str]:
    import asyncio
    # fire-and-forget; Python posts results back via callback on completion
    asyncio.create_task(run_generate_section(req))
    return {"section_id": section_id, "status": "accepted"}
```

- [ ] Verify routes: `.venv/bin/python -c "from server.app import app; print([r.path for r in app.routes if r.path.startswith('/v1')])"` — should include the new path.
- [ ] **Commit**: `feat(agent): mount daily_digest workflow route on FastAPI server`.

---

## Phase C — Node API routes (Tasks 6-9)

### Task 6: `POST /api/digest/generate`

**File:** `apps/web/app/api/digest/generate/route.ts` (new)

- Auth via NextAuth session.
- Parse body `{ date?: string, sources?: DigestSourceType[] }`.
- Fetch user's digestConfig; default sources to configured.
- Inside a transaction:
  - Upsert `DailyDigest` by `(userId, digestDate)`.
  - For each requested source, check if a `DigestSection` already exists with `status=COMPLETED` — return 409 if so (client must call regenerate endpoint, which is v1-deferred).
  - Otherwise create `DigestSection` with `status=GENERATING`.
- For each new section, POST to `${WORKFLOWS_API_URL}/v1/workflows/daily_digest/sections/{sectionId}/generate` with the full `GenerateSectionRequest` body (fire-and-forget).
- Return `{ digestId, sections: [{ id, sourceType, status }] }` with 202.

### Task 7: `GET /api/digest[?date=YYYY-MM-DD]`

**File:** `apps/web/app/api/digest/route.ts` (new)

- Auth.
- Find `DailyDigest` by `(userId, date ?? today)` with `include: { sections: true }`.
- If not found → 404.
- Return the shape per spec §5.

### Task 8: `GET /api/digest/[digestId]/sections/[sectionId]/status`

**File:** `apps/web/app/api/digest/[digestId]/sections/[sectionId]/status/route.ts` (new)

- Auth + verify digest.userId === session.user.id.
- Return `DigestSectionStatus` shape (id, sourceType, status, items, error, timings).

### Task 9: `POST /api/digest/sections/[sectionId]/complete` (internal callback)

**File:** `apps/web/app/api/digest/sections/[sectionId]/complete/route.ts` (new)

- **No NextAuth session check.** Protect with a shared secret header (`X-Internal-Token`) set via env `INTERNAL_CALLBACK_TOKEN`. Python workflow reads the same env from `.env`.
- Parse body: `{ status: "COMPLETED" | "EMPTY" | "FAILED", items: DigestItem[], model_used?: string, error?: string, completed_at?: string }`.
- Update `DigestSection` row by id with the fields.
- Return 200.

- [ ] **Commit each route as its own commit** (Tasks 6, 7, 8, 9 = 4 commits).

---

## Phase D — Client helper lib (optional, but useful) (Task 10)

**File:** `apps/web/lib/digest/client.ts` (new)

Thin fetch wrappers `createDigest`, `pollSectionStatus`, `readDigest` mirroring the matcher client pattern. Used later by the `/digest` page.

- [ ] **Commit**: `feat(web): add apps/web/lib/digest/client.ts stub for future UI`.

---

## Phase E — Verification (Task 11)

- [ ] `cd apps/agent && .venv/bin/python -m pytest -q` — all tests pass.
- [ ] FastAPI routes list includes `/v1/workflows/daily_digest/sections/{section_id}/generate`.
- [ ] `cd apps/web && npx prisma validate` — schema valid.
- [ ] `grep -rn "DailyDigest\|DigestSection" apps/web/lib/ apps/web/app/api/digest/ | wc -l` — nonzero (new code exists).
- [ ] Inspect migration SQL manually — no DROP statements.
- [ ] Frontend lint passes on the 4 new API route files.

---

## Self-review checklist

- [ ] Prisma schema: 2 enums, 2 models, 1 back-relation on User, 1 new column on UserSettings.
- [ ] Migration file: additive only, no drops, correct `@@map` table names.
- [ ] `apps/agent/workflows/daily_digest.py`: ≥3 tests (empty pool, success path, failure path).
- [ ] FastAPI mounts `/v1/workflows/daily_digest/sections/{section_id}/generate`.
- [ ] 4 Node routes: `POST /api/digest/generate`, `GET /api/digest`, `GET /api/digest/:id/sections/:id/status`, `POST /api/digest/sections/:id/complete`.
- [ ] Internal callback route uses shared-secret header, NOT NextAuth session.
- [ ] `INTERNAL_CALLBACK_TOKEN` documented in `.env.example` (or at least mentioned in a commit message for ops).
- [ ] TypeScript types in `apps/web/lib/types/digest.ts`.
- [ ] No frontend UI work (deferred).

## What's NOT done after P6

- `/digest` page UI (magazine layout with hero + grid cards).
- `/settings#daily-digest` interests/sources configuration UI.
- `POST /api/digest/regenerate` endpoint.
- `GET /api/digest/{id}/stream` SSE endpoint (polling suffices for v1).
- Twitter, RSS, paper-recommendation sources.
- Cron / scheduler for auto-generation (spec non-goal).
