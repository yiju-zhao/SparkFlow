# Daily-Digest ARQ Worker (PR-C) Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fire-and-forget `asyncio.create_task` in the daily-digest endpoint with an ARQ-backed job queue so digest section generation is durable, retryable, and observable. User-triggered only (no cron).

**Architecture:** ARQ worker runs in its own process (same Redis instance as PR-A's BullMQ). FastAPI `/v1/workflows/daily_digest/sections/{id}/generate` enqueues a job and returns `{ accepted, job_id }` immediately. Worker drains the queue, calls the existing `generate_section(req)` (unchanged business logic), and invokes the existing Node callback on completion. No changes to the callback protocol; purely durability + observability.

**Tech Stack:** Python 3.12, [arq](https://arq-docs.helpmanual.io/) ≥ 0.25 (async-native Redis queue), FastAPI, existing httpx.AsyncClient, pytest + pytest-asyncio.

---

## Audit reference (from repo exploration)

- `apps/agent/server/app.py:34-38` — FastAPI route fires `asyncio.create_task(run_generate_section(req))`. **This is what changes.**
- `apps/agent/workflows/daily_digest.py:34-47` — `GenerateSectionRequest` dataclass (reusable for ARQ serialization).
- `apps/agent/workflows/daily_digest.py:236-316` — `generate_section(req)` business logic (unchanged).
- `apps/agent/workflows/daily_digest.py:184-191` — Python → Node callback using `INTERNAL_CALLBACK_TOKEN`. Unchanged.
- `apps/web/app/api/digest/generate/route.ts:213-228` — Web-side fire-and-forget fetch. Unchanged externally; response shape gets a `jobId` added.
- `apps/web/prisma/schema.prisma:537-553` — `DigestSection` with `DigestStatus` enum. Unchanged.
- No `_LOTUS_LOCK`-style globals in daily_digest.py — ARQ-safe out of the box.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/agent/requirements.txt` | Modify | Add `arq>=0.25`. |
| `apps/agent/workflows/digest_tasks.py` | Create | ARQ task functions — thin adapters over `generate_section`. Serialize/deserialize `GenerateSectionRequest` as a dict payload. |
| `apps/agent/workflows/digest_worker.py` | Create | `arq.Worker`-compatible `WorkerSettings` — registers functions, sets Redis URL, concurrency, max_tries, keep_result. |
| `apps/agent/server/app.py` | Modify | Replace fire-and-forget with ARQ enqueue. Add `/v1/workflows/daily_digest/jobs/{job_id}/status` GET endpoint. Wire ARQ pool into FastAPI lifespan. |
| `apps/agent/tests/test_workflows_digest_tasks.py` | Create | Unit tests for the ARQ task adapter — monkeypatch `generate_section`, assert request is deserialized correctly. |
| `apps/agent/.env.example` | Modify | Document `REDIS_URL`, `DIGEST_WORKER_CONCURRENCY`. |
| `apps/web/app/api/digest/generate/route.ts` | Modify | Capture `jobId` from the agent response; pass it through to the client in the JSON payload. No URL changes. |
| `apps/web/app/api/digest/sections/[sectionId]/status/route.ts` | Create | GET endpoint — proxies to the agent's ARQ status endpoint; ACL'd by notebook/digest ownership. |
| `apps/web/docker-compose.yml` | Modify | Add `digest-worker` service (python container, runs `arq` command). |

---

## Task 1: ARQ dep + `digest_tasks.py` adapter

**Files:**
- Modify: `apps/agent/requirements.txt`
- Create: `apps/agent/workflows/digest_tasks.py`
- Create: `apps/agent/tests/test_workflows_digest_tasks.py`

- [ ] **Step 1: Add arq to requirements.txt**

Append `arq>=0.25` to `apps/agent/requirements.txt` (or merge with any existing block). Do NOT run `pip install` — the implementer venv already has `arq` (or will be updated separately). If it's not available, flag BLOCKED.

Verify:
```
grep -n "^arq" /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/agent/requirements.txt
/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/agent/.venv/bin/python3.12 -c "import arq; print(arq.__version__)"
```
Both must print something non-empty. If the venv import fails, run `.venv/bin/python3.12 -m pip install 'arq>=0.25'` and retry.

- [ ] **Step 2: Write failing test**

Create `apps/agent/tests/test_workflows_digest_tasks.py`:

```python
"""Tests for the ARQ task adapter."""

from unittest.mock import AsyncMock

import pytest


@pytest.mark.asyncio
async def test_arq_generate_section_deserializes_payload_and_calls_workflow(monkeypatch):
    """The ARQ task must convert the dict payload back into GenerateSectionRequest
    and invoke the existing generate_section() business logic unchanged."""
    from workflows import daily_digest

    captured: dict = {}

    async def fake_generate_section(req):
        captured["req"] = req
        return {"status": "ok", "items_count": 3}

    monkeypatch.setattr(daily_digest, "generate_section", fake_generate_section)

    from workflows.digest_tasks import arq_generate_section

    payload = {
        "section_id": "sec-123",
        "user_id": "user-abc",
        "source_type": "wechat",
        "queries": ["ai trends", "llm benchmarks"],
        "source_refs": [1, 2, 3],
        "top_k": 10,
        "model_provider": "openai",
        "model_name": "gpt-4o-mini",
        "api_key": "sk-test",
        "api_base": None,
    }

    # ARQ workers pass `ctx` as first positional arg.
    result = await arq_generate_section({}, payload)

    assert result == {"status": "ok", "items_count": 3}
    req = captured["req"]
    assert req.section_id == "sec-123"
    assert req.user_id == "user-abc"
    assert req.queries == ["ai trends", "llm benchmarks"]
    assert req.api_key == "sk-test"


@pytest.mark.asyncio
async def test_arq_generate_section_propagates_exceptions(monkeypatch):
    """A failure inside generate_section must bubble up so ARQ can record it
    against max_tries and move the job to the failed-jobs list."""
    from workflows import daily_digest

    async def boom(req):  # noqa: ARG001
        raise RuntimeError("section generation failed")

    monkeypatch.setattr(daily_digest, "generate_section", boom)

    from workflows.digest_tasks import arq_generate_section

    payload = {
        "section_id": "sec-err",
        "user_id": "user",
        "source_type": "wechat",
        "queries": ["q"],
        "source_refs": [],
        "top_k": 5,
        "model_provider": "openai",
        "model_name": "gpt-4o-mini",
        "api_key": "sk",
        "api_base": None,
    }

    with pytest.raises(RuntimeError, match="section generation failed"):
        await arq_generate_section({}, payload)
```

Run it — expect FAIL with ModuleNotFoundError:
```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/agent
.venv/bin/python3.12 -m pytest tests/test_workflows_digest_tasks.py -v
```

- [ ] **Step 3: Create `workflows/digest_tasks.py`**

```python
"""ARQ task adapters for daily-digest generation.

Kept intentionally thin: each `arq_*` function deserializes the payload back
into the existing `GenerateSectionRequest` dataclass and delegates to the
unchanged business logic in `workflows.daily_digest`. No new workflow
semantics live here — this module is the persistence / retry boundary only.
"""

from __future__ import annotations

from typing import Any

from workflows import daily_digest
from workflows.daily_digest import GenerateSectionRequest


async def arq_generate_section(ctx: dict, payload: dict[str, Any]) -> dict[str, Any]:
    """ARQ task entrypoint: run a daily-digest section generation.

    Args:
        ctx: ARQ worker context (unused by this task — present for ARQ's
            function-signature contract).
        payload: Serialized `GenerateSectionRequest` fields. Must contain
            section_id, user_id, source_type, queries, source_refs, top_k,
            model_provider, model_name, api_key. `api_base` is optional.

    Returns:
        Whatever `generate_section` returns — a status dict the caller can
        poll after the job completes.
    """
    _ = ctx  # ARQ protocol; unused here.
    req = GenerateSectionRequest(**payload)
    return await daily_digest.generate_section(req)
```

Run the test again:
```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/agent
.venv/bin/python3.12 -m pytest tests/test_workflows_digest_tasks.py -v
```
Both tests PASS. Also run the full suite — pre-existing tests must still pass.

- [ ] **Step 4: Commit**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker
git add apps/agent/requirements.txt apps/agent/workflows/digest_tasks.py apps/agent/tests/test_workflows_digest_tasks.py
git commit -m "feat(digest): ARQ task adapter for generate_section"
```

---

## Task 2: ARQ `WorkerSettings`

**Files:**
- Create: `apps/agent/workflows/digest_worker.py`
- Modify: `apps/agent/.env.example`

- [ ] **Step 1: Create `workflows/digest_worker.py`**

```python
"""ARQ worker configuration for daily-digest jobs.

Run the worker:
    cd apps/agent
    arq workflows.digest_worker.WorkerSettings

The worker connects to the same Redis instance used by the web app's
BullMQ queue (PR-A) — different keyspaces, no collision.
"""

from __future__ import annotations

import os

from arq.connections import RedisSettings

from workflows.digest_tasks import arq_generate_section


def _redis_settings() -> RedisSettings:
    """Parse REDIS_URL into ARQ's RedisSettings. Falls back to localhost:6379."""
    url = os.getenv("REDIS_URL", "redis://localhost:6379")
    return RedisSettings.from_dsn(url)


class WorkerSettings:
    """ARQ picks this up via `arq <module>.WorkerSettings`."""

    functions = [arq_generate_section]
    redis_settings = _redis_settings()
    # How many concurrent digest sections this worker process will process.
    # Each section issues a handful of LLM calls — `4` is a safe default.
    max_jobs = int(os.getenv("DIGEST_WORKER_CONCURRENCY", "4"))
    # Each attempt retries up to 3 times total, with exponential backoff.
    max_tries = 3
    # Keep completed job results for 24h so status polling can see outcomes
    # after the job finishes.
    keep_result = 24 * 3600
```

- [ ] **Step 2: Env-example**

Append to `apps/agent/.env.example`:

```
# Daily-digest ARQ worker.
# Max digest sections this worker process handles concurrently.
DIGEST_WORKER_CONCURRENCY=4
```

If `REDIS_URL` is not already in `.env.example`, add it as well with value `redis://localhost:6379`.

- [ ] **Step 3: Import smoke**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/agent
.venv/bin/python3.12 -c "from workflows.digest_worker import WorkerSettings; print('functions=', [f.__name__ for f in WorkerSettings.functions], 'max_jobs=', WorkerSettings.max_jobs)"
```
Expected: prints `functions= ['arq_generate_section'] max_jobs= 4` with no errors.

- [ ] **Step 4: Run full pytest**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/agent
.venv/bin/python3.12 -m pytest -q
```
Expected: all pre-existing + new tests pass.

- [ ] **Step 5: Commit**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker
git add apps/agent/workflows/digest_worker.py apps/agent/.env.example
git commit -m "feat(digest): ARQ WorkerSettings with REDIS_URL + concurrency env"
```

---

## Task 3: FastAPI — enqueue + status endpoints, ARQ pool in lifespan

**Files:**
- Modify: `apps/agent/server/app.py`

Read the current file first:
```
cat /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/agent/server/app.py
```

- [ ] **Step 1: Add ARQ pool to FastAPI lifespan**

At the top of the file:
```python
from contextlib import asynccontextmanager

from arq import create_pool
from arq.connections import ArqRedis

from workflows.digest_worker import WorkerSettings
```

Define the lifespan (or merge with any existing one):
```python
@asynccontextmanager
async def _lifespan(app: FastAPI):
    app.state.arq_pool = await create_pool(WorkerSettings.redis_settings)
    try:
        yield
    finally:
        await app.state.arq_pool.aclose()
```

Wire `lifespan=_lifespan` into the `FastAPI(...)` constructor. Preserve all other constructor args.

- [ ] **Step 2: Replace fire-and-forget with enqueue**

Find the existing route `/v1/workflows/daily_digest/sections/{section_id}/generate` (around line 34-38). The current body calls `asyncio.create_task(run_generate_section(req))` and returns 202. Replace the body with:

```python
@app.post("/v1/workflows/daily_digest/sections/{section_id}/generate")
async def generate_daily_digest_section(
    section_id: str,
    req: GenerateSectionRequest,
    request: Request,
):
    """Enqueue a daily-digest section generation job.

    Durable: survives this FastAPI process dying. ARQ retries up to
    max_tries before landing the job in the failed list.
    """
    pool: ArqRedis = request.app.state.arq_pool
    # The dataclass wasn't the same object type pydantic expects? We pass via
    # dataclasses.asdict so the ARQ worker can reconstruct it identically.
    from dataclasses import asdict

    payload = asdict(req)
    # section_id should match req.section_id; enforce defensively.
    if req.section_id != section_id:
        raise HTTPException(status_code=400, detail="section_id mismatch")

    job = await pool.enqueue_job(
        "arq_generate_section",
        payload,
        _job_id=f"digest:section:{section_id}",
    )
    if job is None:
        # enqueue_job returns None when a job with the same _job_id is already
        # queued. Return the existing id — idempotent retry.
        return {"accepted": True, "job_id": f"digest:section:{section_id}", "reused": True}
    return {"accepted": True, "job_id": job.job_id, "reused": False}
```

Also `from fastapi import Request, HTTPException` if missing. Do NOT delete the `run_generate_section` helper if other tests import it — leave it in place; it's simply no longer wired to the route.

- [ ] **Step 3: Add job-status endpoint**

Append a new route:

```python
@app.get("/v1/workflows/daily_digest/jobs/{job_id}/status")
async def digest_job_status(job_id: str, request: Request):
    """Return ARQ job status for a digest section generation.

    Status strings: `deferred`, `queued`, `in_progress`, `complete`, `not_found`.
    For `complete` jobs, `result` holds the return value of generate_section.
    For failures, `error` carries the exception repr.
    """
    from arq.jobs import Job, JobStatus

    pool: ArqRedis = request.app.state.arq_pool
    job = Job(job_id, redis=pool)
    status = await job.status()

    response: dict = {"job_id": job_id, "status": status.value if isinstance(status, JobStatus) else str(status)}

    if status == JobStatus.complete:
        try:
            result = await job.result(timeout=0)
        except Exception as exc:  # noqa: BLE001
            response["error"] = repr(exc)
        else:
            response["result"] = result
    return response
```

- [ ] **Step 4: Run tests**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/agent
.venv/bin/python3.12 -m pytest -q
```
Pre-existing daily-digest tests may still assert on the old 202 path. If they break, update them to assert the new shape (`{"accepted": True, "job_id": "..."}` ). Do NOT skip them — they are the regression suite.

- [ ] **Step 5: Commit**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker
git add apps/agent/server/app.py apps/agent/tests/
git commit -m "feat(digest): enqueue to ARQ instead of asyncio.create_task; add /jobs/{id}/status"
```

---

## Task 4: Web — plumb jobId through + status endpoint

**Files:**
- Modify: `apps/web/app/api/digest/generate/route.ts`
- Create: `apps/web/app/api/digest/sections/[sectionId]/status/route.ts`

- [ ] **Step 1: Plumb `job_id` through the existing web endpoint**

In `apps/web/app/api/digest/generate/route.ts`, find the fire-and-forget fetch (around line 213-228). The agent's `/generate` endpoint now returns `{ accepted, job_id, reused }`. Capture that:

```typescript
  const agentResp = await fetch(
    `${process.env.WORKFLOWS_API_URL}/v1/workflows/daily_digest/sections/${section.id}/generate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Token": process.env.INTERNAL_CALLBACK_TOKEN ?? "",
      },
      body: JSON.stringify(agentPayload),
    },
  );

  if (!agentResp.ok) {
    console.error("[digest/generate] agent enqueue failed:", agentResp.status, await agentResp.text());
    // Surface as a 502 so the client knows the server-to-server enqueue failed.
    return NextResponse.json(
      { error: "Digest enqueue failed. Try again shortly." },
      { status: 502 },
    );
  }

  const { job_id: jobId } = (await agentResp.json()) as { job_id?: string };
  return NextResponse.json(
    { accepted: true, sectionId: section.id, jobId: jobId ?? null },
    { status: 202 },
  );
```

Replace the existing fire-and-forget `.catch(...)` block with this awaited call. Keep all upstream argument construction (the `agentPayload` with BYOK etc.) exactly as-is.

- [ ] **Step 2: Status endpoint**

Create `apps/web/app/api/digest/sections/[sectionId]/status/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sectionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sectionId } = await params;
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required" }, { status: 400 });
  }

  // ACL: caller must own the digest that owns this section.
  const section = await prisma.digestSection.findFirst({
    where: {
      id: sectionId,
      digest: { userId: session.user.id },
    },
    select: { id: true },
  });
  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }

  const workflowsUrl = process.env.WORKFLOWS_API_URL;
  if (!workflowsUrl) {
    return NextResponse.json({ error: "WORKFLOWS_API_URL not configured" }, { status: 500 });
  }

  const STATUS_TIMEOUT_MS = 3_000;
  try {
    const agentResp = await fetch(
      `${workflowsUrl}/v1/workflows/daily_digest/jobs/${encodeURIComponent(jobId)}/status`,
      {
        headers: { "X-Internal-Token": process.env.INTERNAL_CALLBACK_TOKEN ?? "" },
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      },
    );
    if (!agentResp.ok) {
      return NextResponse.json(
        { error: "Status unavailable" },
        { status: 503 },
      );
    }
    const body = await agentResp.json();
    return NextResponse.json(body);
  } catch (err) {
    console.error("[digest status] agent call failed:", err);
    return NextResponse.json(
      { error: "Status unavailable" },
      { status: 503 },
    );
  }
}
```

- [ ] **Step 3: Type-check and build**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/web
npx tsc --noEmit
```

If the project's pre-existing type errors (e.g. `admin/instances/page.tsx` implicit-any on `v`) fail the build, DO NOT fix them here — they're not in this PR's scope. Confirm by checking they're identical to main.

- [ ] **Step 4: Commit**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker
git add 'apps/web/app/api/digest/generate/route.ts' 'apps/web/app/api/digest/sections/[sectionId]/status/route.ts'
git commit -m "feat(digest): thread job_id to client; add section status polling endpoint"
```

---

## Task 5: Docker-compose digest-worker + final PR

**Files:**
- Modify: `apps/web/docker-compose.yml` (add `digest-worker` service)
- Modify: `apps/agent/Dockerfile` if needed

- [ ] **Step 1: Confirm apps/agent has a Dockerfile**

```
ls /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/agent/Dockerfile*
```
If one exists, note its stages / CMD. If not, create a minimal one:

```dockerfile
FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

FROM base AS deps
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

FROM base AS runtime
COPY --from=deps /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=deps /usr/local/bin /usr/local/bin
COPY . .
# Default command (overridden by docker-compose for the worker):
CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "2024"]
```

Adjust only if what exists is clearly wrong. If the existing Dockerfile is the thing that runs the langgraph dev server, leave it — the digest worker can be a separate Dockerfile (`Dockerfile.digest-worker`) with a stripped-down image, or reuse the same image with a `command:` override.

- [ ] **Step 2: Add digest-worker to docker-compose**

Edit `apps/web/docker-compose.yml` — append after the existing `ingest-worker:` block:

```yaml
  digest-worker:
    build:
      context: ../agent
      dockerfile: Dockerfile
    container_name: sparkflow-digest-worker
    command: ["arq", "workflows.digest_worker.WorkerSettings"]
    env_file: ../agent/.env
    environment:
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
      SPARKFLOW_API_URL: ${SPARKFLOW_API_URL}
      SEMOPS_API_URL: ${SEMOPS_API_URL}
      INTERNAL_CALLBACK_TOKEN: ${INTERNAL_CALLBACK_TOKEN}
    depends_on:
      redis:
        condition: service_healthy
    restart: unless-stopped
```

Validate:
```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/web
docker compose config > /dev/null
```
Expect no errors. The pre-existing `.env` gripe (if any) is out of scope — document in the PR body, don't fix here.

- [ ] **Step 3: Grep smoke**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker
grep -rn "asyncio.create_task" apps/agent/server/
```
Expect: no hits (fire-and-forget gone). If something else in `server/` still uses `asyncio.create_task` for unrelated endpoints, that's fine — check its scope. The digest endpoint specifically must be gone.

- [ ] **Step 4: Full pytest + web tsc**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/agent
.venv/bin/python3.12 -m pytest -q

cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker/apps/web
npx tsc --noEmit
```
Pytest all green. tsc failures on pre-existing code (`admin/instances/page.tsx` etc.) are OK; call them out in the PR body.

- [ ] **Step 5: Push + PR**

```
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/.worktrees/digest-arq-worker
git push -u origin feat/digest-arq-worker
gh pr create --title "feat(digest): ARQ worker for durable daily-digest generation (PR-C)" --body "..."
```
PR body references the spec (on refactor/hermes-agent), describes the shift from fire-and-forget to durable queue, documents the new env vars and docker-compose service, and notes that the callback protocol is unchanged.

---

## Out of scope (follow-ups)

- **Scheduled digests.** User confirmed "user-triggered only" for now. When we add cron, ARQ supports it natively — just add a `cron_jobs` list to `WorkerSettings`.
- **Frontend polling / SSE UI.** Status endpoint is ready; front-end wiring is a separate small PR.
- **ARQ admin dashboard.** Several third-party tools exist; not shipped here.
- **Migrating the existing `run_generate_section` helper.** Left in place if any tests import it; the route no longer calls it. If no imports remain post-merge, a cleanup PR can delete it.
