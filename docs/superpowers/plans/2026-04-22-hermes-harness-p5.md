# Hermes Harness — P5 (Matcher Workflow Extraction) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move matcher-specific code out of `apps/semops` into `apps/agent/workflows/matcher/`. Leave `apps/semops` as a **pure semantic-operator library** with only the `sem_rank` etc. operators and their RPC wrapper. The matcher workflow consumes semops operators over HTTP (same pattern as P4's search workflow).

**Architectural principle (from spec §8):** `apps/semops` = pure operator definitions + thin RPC shell. Anything that composes operators is a workflow and lives in `apps/agent/workflows/`.

**Migration strategy:** Additive-then-flip, in three phases.

- **Phase A — Backend migration (Tasks 1-5):** Copy matcher code to `apps/agent/workflows/matcher/`. Change Python imports so matcher calls the semops `/api/operators/rank` endpoint instead of importing `SemanticOperators` directly. Mount matcher routes under `/v1/workflows/matcher/jobs/*` on the P4 FastAPI server.
- **Phase B — Frontend flip (Tasks 6-7):** Update `apps/web/lib/matcher/client.ts` + `apps/web/app/api/matcher/jobs/*` to call the new workflow URL.
- **Phase C — Legacy teardown (Tasks 8-10):** Delete matcher files from `apps/semops`; trim `apps/semops/api/main.py` to only expose operators; verify.

**Tech Stack:** Same as P4 — FastAPI, LOTUS, PostgreSQL via Prisma, httpx. No new deps.

**Spec:** `docs/superpowers/specs/2026-04-22-hermes-harness-design.md` §7.4, §8, §10 (P5 row).

---

## Scope boundaries

**IN scope:**
- `apps/agent/workflows/matcher/__init__.py` (empty)
- `apps/agent/workflows/matcher/lotus.py` (port of `lotus_matcher.py`; refactored to call semops via HTTP)
- `apps/agent/workflows/matcher/job_runner.py` (port of `job_runner.py`)
- `apps/agent/workflows/matcher/query_optimizer.py` (verbatim port)
- `apps/agent/workflows/matcher/excel_processor.py` (verbatim port)
- `apps/agent/workflows/matcher/job_store.py` (verbatim port)
- `apps/agent/server/app.py` (MOD) — mount `matcher_jobs_router`
- `apps/agent/server/routes/__init__.py` (empty), `apps/agent/server/routes/matcher_jobs.py` (port of `apps/semops/api/routes/jobs.py`)
- `apps/agent/tests/test_matcher_workflow.py` (ported from `apps/semops/tests/test_jobs_route.py`)
- `apps/web/lib/matcher/client.ts` (MOD) — env var + endpoint URL
- `apps/web/app/api/matcher/jobs/route.ts` (MOD) — upstream URL
- `apps/web/app/api/matcher/jobs/[jobId]/route.ts` (MOD)
- `apps/web/app/api/matcher/jobs/[jobId]/stream/route.ts` (MOD)

**Legacy deletions (Phase C):**
- `apps/semops/services/{lotus_matcher,job_runner,query_optimizer,excel_processor}.py`
- `apps/semops/api/routes/jobs.py`
- `apps/semops/tools/job_store.py`
- `apps/semops/tests/test_jobs_route.py`
- `apps/semops/api/main.py` — trimmed to mount only `operators` router; LOTUS LM lifespan stays (operators still need it)

**OUT of scope:**
- `daily_digest` workflow (P6)
- Renaming matcher-related Prisma models (`MatchJob`, etc.) — keep the existing table names
- Database migration work — matcher persistence stays on the existing tables

**Rollback:** All Phase A changes are additive. Phase B frontend flip is one-line revert. Phase C deletions are staged only after Phase A + B prove out.

---

## Phase A — Backend migration (Tasks 1-5)

### Task 1: Create matcher workflow package + verbatim file ports

**Files:**
- Create: `apps/agent/workflows/matcher/__init__.py` (empty)
- Copy: `apps/semops/services/query_optimizer.py` → `apps/agent/workflows/matcher/query_optimizer.py` (no changes)
- Copy: `apps/semops/services/excel_processor.py` → `apps/agent/workflows/matcher/excel_processor.py` (no changes)
- Copy: `apps/semops/tools/job_store.py` → `apps/agent/workflows/matcher/job_store.py` (no changes)

- [ ] **Step 1: Create package init**

```bash
touch apps/agent/workflows/matcher/__init__.py
```

(Note: `apps/agent/workflows/__init__.py` already exists from P4.)

- [ ] **Step 2: Copy files verbatim**

```bash
cp apps/semops/services/query_optimizer.py apps/agent/workflows/matcher/query_optimizer.py
cp apps/semops/services/excel_processor.py apps/agent/workflows/matcher/excel_processor.py
cp apps/semops/tools/job_store.py apps/agent/workflows/matcher/job_store.py
```

- [ ] **Step 3: Fix imports**

Inside each copied file, update any intra-package imports. Common changes:

- `from services.X import Y` → `from workflows.matcher.X import Y`
- `from tools.job_store import Y` → `from workflows.matcher.job_store import Y`

Scan each copied file:
```bash
grep -n "from services\|from tools\|import services\|import tools" apps/agent/workflows/matcher/*.py
```

Fix each hit.

- [ ] **Step 4: Verify imports cleanly**

```bash
cd apps/agent && .venv/bin/python -c "
from workflows.matcher import query_optimizer, excel_processor, job_store
print('3 verbatim ports import OK')
"
```

- [ ] **Step 5: Commit**

```bash
git add apps/agent/workflows/matcher/
git commit -m "feat(agent): port verbatim matcher helpers (query_optimizer, excel, job_store)"
```

---

### Task 2: Port `lotus_matcher.py` — refactor to call semops via HTTP

**Files:**
- Create: `apps/agent/workflows/matcher/lotus.py` (ported with HTTP refactor)

The semops `SemanticOperators.rank` call inside `LotusMatcher.run_pipeline` becomes an HTTP POST to `${SEMOPS_API_URL}/api/operators/rank`, paralleling the pattern used by `apps/agent/workflows/search.py`.

- [ ] **Step 1: Copy `apps/semops/services/lotus_matcher.py` to `apps/agent/workflows/matcher/lotus.py`**

- [ ] **Step 2: Identify in-process semops calls and replace with HTTP calls**

Look for:
```python
from services.semantic_operators import SemanticOperators
# ...
ops = SemanticOperators(...)
ranked = ops.rank(candidates=..., text_field=..., query=..., top_k=..., include_reasons=True, model_config=...)
```

Replace with `httpx` call:
```python
import httpx, os
SEMOPS_API_URL = os.getenv("SEMOPS_API_URL", "http://localhost:2025")

def _rank_via_semops(*, candidates, text_field, query, top_k, model_config):
    with httpx.Client(timeout=120) as client:
        resp = client.post(
            f"{SEMOPS_API_URL}/api/operators/rank",
            json={"candidates": candidates, "text_field": text_field, "query": query,
                  "top_k": top_k, "include_reasons": True, "model_config": model_config},
        )
        resp.raise_for_status()
        return resp.json()
```

If the matcher's `run_pipeline` uses async, make the HTTP call async too (`httpx.AsyncClient`).

- [ ] **Step 3: Update intra-package imports** in the file (e.g., `from services.query_optimizer import ...` → `from workflows.matcher.query_optimizer import ...`).

- [ ] **Step 4: Verify import**

```bash
cd apps/agent && .venv/bin/python -c "
from workflows.matcher.lotus import LotusMatcher
print('LotusMatcher port imports OK')
"
```

- [ ] **Step 5: Run basic unit test (if reasonable without LOTUS dep)**

If LOTUS-lite imports are pulled in at module load and fail (e.g., `import lotus` missing from apps/agent's venv), either:

a. Add `lotus-ai` to `apps/agent/requirements.txt` + `pyproject.toml` (mirrors apps/semops).

b. Lazy-import LOTUS inside the function body so module-load doesn't fail.

Decide per what fails first. Prefer (a) — matcher needs LOTUS at runtime anyway. If choosing (a), add `lotus-ai>=0.1.0`, `pandas>=2.0.0`, `faiss-cpu>=1.7.4`, `sentence-transformers>=2.2.0` to `apps/agent`'s requirements.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/workflows/matcher/lotus.py apps/agent/pyproject.toml apps/agent/requirements.txt
git commit -m "feat(agent): port LotusMatcher to workflows/matcher; call semops via HTTP"
```

---

### Task 3: Port `job_runner.py`

**Files:**
- Create: `apps/agent/workflows/matcher/job_runner.py`

- [ ] **Step 1: Copy `apps/semops/services/job_runner.py`**

- [ ] **Step 2: Fix imports**

- `from services.lotus_matcher import LotusMatcher` → `from workflows.matcher.lotus import LotusMatcher`
- `from services.query_optimizer import ...` → `from workflows.matcher.query_optimizer import ...`
- `from tools.job_store import ...` → `from workflows.matcher.job_store import ...`

- [ ] **Step 3: Verify import**

- [ ] **Step 4: Commit**

```bash
git add apps/agent/workflows/matcher/job_runner.py
git commit -m "feat(agent): port matcher job_runner to apps/agent/workflows"
```

---

### Task 4: Port `jobs.py` route → `server/routes/matcher_jobs.py` + mount

**Files:**
- Create: `apps/agent/server/routes/__init__.py` (empty)
- Create: `apps/agent/server/routes/matcher_jobs.py` (from `apps/semops/api/routes/jobs.py`)
- Modify: `apps/agent/server/app.py` — include the router at prefix `/v1/workflows/matcher`

- [ ] **Step 1: Copy the route file**

```bash
cp apps/semops/api/routes/jobs.py apps/agent/server/routes/matcher_jobs.py
```

- [ ] **Step 2: Fix imports**

- `from services.X` → `from workflows.matcher.X`
- `from tools.X` → `from workflows.matcher.X`

- [ ] **Step 3: Include the router on the FastAPI app**

In `apps/agent/server/app.py`, after existing imports/routes:

```python
from server.routes.matcher_jobs import router as matcher_jobs_router

app.include_router(matcher_jobs_router, prefix="/v1/workflows/matcher")
```

Check the router's existing `prefix` attribute in `matcher_jobs.py` — if it's already `/jobs`, the combined prefix becomes `/v1/workflows/matcher/jobs/*` (ideal). Adjust if needed.

- [ ] **Step 4: Verify boot**

```bash
cd apps/agent && .venv/bin/python -c "
from server.app import app
print('routes:', [r.path for r in app.routes if r.path.startswith('/v1')])
"
```

Expected: `/v1/healthz`, `/v1/workflows/search`, `/v1/workflows/matcher/jobs`, etc.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/server/routes/ apps/agent/server/app.py
git commit -m "feat(agent): mount matcher jobs router on workflow server"
```

---

### Task 5: Port matcher tests

**Files:**
- Create: `apps/agent/tests/test_matcher_workflow.py` (from `apps/semops/tests/test_jobs_route.py`)

- [ ] **Step 1: Copy test file**

- [ ] **Step 2: Fix imports**

- `from api.main import app` → `from server.app import app`
- Intra-matcher imports → workflows.matcher

- [ ] **Step 3: Run**

```bash
cd apps/agent && .venv/bin/python -m pytest tests/test_matcher_workflow.py -v 2>&1 | tail -15
```

Fix any test failures that stem from the HTTP-semops refactor (tests may need to mock httpx calls instead of `SemanticOperators`).

- [ ] **Step 4: Full-suite regression**

```bash
cd apps/agent && .venv/bin/python -m pytest -q 2>&1 | tail -3
```

Expected: 102 + N new = higher count, all passing.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/tests/test_matcher_workflow.py
git commit -m "test(agent): port matcher jobs tests to workflows layer"
```

---

## Phase B — Frontend flip (Tasks 6-7)

### Task 6: Update `apps/web/lib/matcher/client.ts`

- [ ] **Step 1: Replace the upstream URL**

Current (relevant snippet):
```typescript
const SEMOPS_API_URL =
  process.env.NEXT_PUBLIC_SEMOPS_API_URL ||
  process.env.NEXT_PUBLIC_MATCHER_API_URL ||
  "http://localhost:2025";
```

Replace with:
```typescript
const WORKFLOWS_API_URL =
  process.env.NEXT_PUBLIC_WORKFLOWS_API_URL ||
  "http://localhost:2027";
```

Update any internal `${SEMOPS_API_URL}/api/jobs/...` usage to `${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/...`.

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/matcher/client.ts
git commit -m "feat(web): matcher client calls workflow endpoint at /v1/workflows/matcher"
```

---

### Task 7: Update Next.js matcher API routes

**Files:**
- Modify: `apps/web/app/api/matcher/jobs/route.ts`
- Modify: `apps/web/app/api/matcher/jobs/[jobId]/route.ts`
- Modify: `apps/web/app/api/matcher/jobs/[jobId]/stream/route.ts`

- [ ] **Step 1: Find each upstream URL**

```bash
grep -n "SEMOPS_API_URL\|MATCHER_API_URL\|localhost:2025" apps/web/app/api/matcher/jobs/*/route.ts apps/web/app/api/matcher/jobs/route.ts
```

- [ ] **Step 2: Replace with `WORKFLOWS_API_URL` + new path prefix**

Each route currently proxies to `${SEMOPS_API_URL}/api/jobs/...`. Change to `${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/...`.

- [ ] **Step 3: Verify `npm run lint` (if available)**

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/matcher/jobs/
git commit -m "feat(web): matcher Next.js routes proxy to workflow endpoint"
```

---

## Phase C — Legacy teardown (Tasks 8-10)

### Task 8: Delete matcher code from `apps/semops`

**Files to delete:**
- `apps/semops/services/lotus_matcher.py`
- `apps/semops/services/job_runner.py`
- `apps/semops/services/query_optimizer.py`
- `apps/semops/services/excel_processor.py`
- `apps/semops/api/routes/jobs.py`
- `apps/semops/tools/job_store.py`
- `apps/semops/tests/test_jobs_route.py`

Also remove `apps/semops/tools/` if it becomes empty after deleting `job_store.py`.

- [ ] **Step 1: git rm** the files.
- [ ] **Step 2: Verify `apps/semops` still parses** (`apps/semops/.venv/bin/python -c "from api.main import app; print(app)"` — may need semops venv path).
- [ ] **Step 3: Commit.**

### Task 9: Trim `apps/semops/api/main.py`

**File:** `apps/semops/api/main.py`

- [ ] **Step 1: Remove the matcher-specific lifespan init** (`LotusMatcher()` on startup); keep LOTUS LM configuration inside `semantic_operators.py`.
- [ ] **Step 2: Remove `from api.routes import jobs`** and the corresponding `app.include_router(jobs.router)` call.
- [ ] **Step 3: Leave operators route intact.**
- [ ] **Step 4: Commit.**

### Task 10: Final verification gate

- [ ] **Step 1: Apps/agent test suite passes.**
- [ ] **Step 2: Apps/semops test suite still passes for operators.**
- [ ] **Step 3: FastAPI workflow server boots + exposes both `/v1/workflows/search` and `/v1/workflows/matcher/jobs`.**
- [ ] **Step 4: No dead imports** (`grep -r "from services.lotus_matcher\|from services.job_runner\|from tools.job_store" apps/semops/ apps/agent/` returns nothing).
- [ ] **Step 5: No commit — acceptance gate.**

---

## Self-review checklist

- [ ] All matcher Python code lives under `apps/agent/workflows/matcher/`; nothing matcher-specific remains in `apps/semops/services/` or `apps/semops/tools/`.
- [ ] `apps/agent/server/app.py` mounts both workflow routes (`/v1/workflows/search` + `/v1/workflows/matcher/jobs/*`).
- [ ] `apps/semops` tests still pass for operators.
- [ ] `apps/agent` tests pass, including new `test_matcher_workflow.py`.
- [ ] Frontend `lib/matcher/client.ts` + `app/api/matcher/jobs/*` all target `NEXT_PUBLIC_WORKFLOWS_API_URL`.
- [ ] `apps/semops/api/main.py` no longer imports LotusMatcher or jobs routes.
- [ ] No placeholder text; no TBD in any committed file.

## What's NOT done after P5

- `daily_digest` workflow port (P6).
- `NEXT_PUBLIC_MATCHER_API_URL` env var fallback — remove in a later cleanup PR once all callers and docs confirm they're off it.
- `apps/semops/api/main.py` CORS tightening or other ops hardening.
- Frontend UX changes — the matcher UI at `/explore/toolbox/matcher` remains unchanged in behavior.
