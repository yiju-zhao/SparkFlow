# Task Parallelization — Multi-Tenant Worker Design

**Date:** 2026-04-24
**Branch:** `refactor/hermes-agent`
**Status:** Approved, ready for implementation plan

## Problem

Four user-initiated task types run on SparkFlow and today they interfere with each other under multi-user load:

| Task | Current state | Interference source |
|------|---------------|---------------------|
| `wiki-ingest` (upload source → extract graph → regenerate wiki) | Fire-and-forget on Next.js server; recently moved to BullMQ but reviewers found 5 correctness blockers | Same-notebook races, shared Next.js event loop |
| `matcher rank` (LOTUS-based semantic ranking) | Synchronous HTTP to `apps/semops`, serialized behind a module-level `threading.Lock()` (`_LOTUS_LOCK`) | LOTUS stores LM config on `lotus.settings.lm` as module-level global |
| `search top-X` (Tavily-backed web search) | Synchronous HTTP; Tavily API key read from env, not BYOK | Shared Tavily key quota; no real state interference otherwise |
| `daily-digest section generation` | FastAPI `BackgroundTasks` fire-and-forget in `apps/agent`, callback to Node on completion | No persistence, no retry, no observability — lost on process restart |

Goal: make each task run **in parallel, independently, without interfering with any other** — both across task types and across users.

## Design

### Topology

```
                    ┌────────────────────────────────┐
                    │ Redis (single instance)         │
                    │                                 │
apps/web  ──BullMQ──►│ ├─ bullmq:wiki-ingest         │◄── ingest-worker (Node, tsx)
                    │                                 │
apps/web  ──ARQ─────►│ └─ arq:daily-digest           │◄── digest-worker (Python, arq)
                    └────────────────────────────────┘

apps/web  ──HTTP (sync)──►  apps/semops (FastAPI)
                               └─ ProcessPoolExecutor
                                    N LOTUS subprocesses, each per-request configured

apps/web  ──HTTP (sync)──►  Tavily (per-user BYOK)
```

Single Redis; two worker processes (one Node, one Python) side by side; semops stays HTTP-synchronous but internally parallel.

### Principle: queue only where it earns its keep

A queue is justified when at least one of these is true:
- Task duration exceeds an HTTP request lifecycle (≥ tens of seconds).
- Task must survive web-process restarts (durability).
- Task needs retry / backpressure / scheduling.

Applying this:
- **wiki-ingest** — yes. 30s–2 min, must survive restarts. Already queued; needs the 5 fixes.
- **matcher rank** — no queue. Typical 2–10s, fits a sync request. The real problem (`_LOTUS_LOCK`) is inside the Python process; fix it with a process pool.
- **search top-X** — no queue. Typical 1–3s, no shared state. Fix BYOK threading.
- **daily-digest** — yes. Minutes-long, multiple LLM calls per section, must retry. User-triggered only (confirmed — no cron).

### Replica model

Single replica per worker for now, **but code written to multi-replica standards** so scaling is a `docker compose up --scale` away:
- Fairness counters live in Redis, not process memory.
- Acquire/release sequences are atomic Lua scripts.
- Per-notebook locks have TTL heartbeat to survive long jobs without losing mutual exclusion.

## Component-by-component

### 1. wiki-ingest — fix the 5 blockers

Reviewers (3 independent) converged on 5 must-fix issues in the already-shipped BullMQ refactor. Each has a concrete fix:

| # | Problem | Fix |
|---|---------|-----|
| B1 | `generateWikiPages` upserts community + index pages *outside* `prisma.$transaction`. Crash between its writes and the tx leaves DB inconsistent. | Refactor `generateWikiPages` to return `{slug, title, content, sourceRefs}[]` (plus the index-page payload) instead of writing. Caller does all upserts inside the `$transaction` alongside graph upsert, orphan delete, and log append — one atomic commit. |
| B2 | `throw new Error("per-user concurrency limit hit; re-queued")` after `moveToDelayed` counts as a failed attempt. Three contention bounces exhaust `attempts: 3`. | Replace with BullMQ's `Worker.RateLimiterError` / `DelayedError` sentinel — reschedule without incrementing `attemptsMade`. |
| B3 | Per-user semaphore (`acquireUserSlot`) uses 3 separate Redis commands, not atomic. Also per-process, so `N replicas × limit = effective N × limit` per user. | Replace with a single `EVAL` Lua script: `zremrangebyscore + zadd + zrange 0 PER_USER_LIMIT-1 + conditional zrem-if-not-top + return ok/slotId`. Counter stays in Redis → correct across replicas. |
| B4 | `tsx` is in `devDependencies` but `worker:ingest` script requires it at runtime. No supervisor (pm2/systemd/docker) for the worker. | Promote `tsx` to `dependencies`. Add `ingest-worker` service to `docker-compose.yml` with the same image, different command. |
| B5 | `SLOT_TTL_MS` = 30 min, `LOCK_TTL_MS` = 15 min. A 20-min ingest auto-releases its notebook lock mid-run, allowing a second job to race the graph. | Add lock heartbeat: `setInterval` every 5 min that extends the lock TTL by 5 min via a Lua `if get==token then pexpire end` script. Cleared in the same `finally` that releases the lock. |

Also landing in the same PR (tagged PR-A):
- Error-message sanitation on enqueue failure paths (no leaking `"REDIS_URL is not set..."` to clients).
- `getJob` / status-endpoint Redis calls wrapped with a short `Promise.race` deadline so a down Redis fails fast (503), not hangs.
- When a user explicitly retries a failed ingest, `queue.remove(jobId)` first so the new enqueue isn't silently deduped to the failed corpse.
- `search top-X` — thread Tavily BYOK key from `UserSettings` (or `SurfaceRuntimeContext`) into `tools/web.py` and `workflows/search.py`. No queue added; purely a BYOK-plumbing fix.

### 2. matcher rank — eliminate `_LOTUS_LOCK`

Replace the module-level `threading.Lock()` in `apps/semops/services/semantic_operators.py` with a process pool. LOTUS's global `lotus.settings.lm` becomes per-process, so "global" state stops being cross-tenant.

Design:

- **Pool construction:** `ProcessPoolExecutor(max_workers=N, mp_context=multiprocessing.get_context("spawn"))`.
  - **`spawn` is mandatory**, not optional. Linux default is `fork`, which inherits torch / faiss / CUDA module state from the parent; that state is not fork-safe and has caused silent corruption in LOTUS-like stacks.
  - Pool size default: `min(4, os.cpu_count())`, env override `SEMOPS_RANK_POOL_SIZE`.
- **Task entrypoint (runs in subprocess):**
  ```python
  def _run_rank(lm_config: dict, candidates: list, op_args: dict) -> list:
      try:
          lm = _build_lm(lm_config)             # new LM instance per call
          lotus.settings.configure(lm=lm)
          return _lotus_rank(candidates, **op_args)
      finally:
          lotus.settings.configure(lm=None)     # reset even on exception
  ```
- **Poisoned-worker recovery:** `ProcessPoolExecutor` doesn't natively evict a worker after an exception. Wrap `pool.submit` with a thin shim that, on exception, calls `pool.shutdown(wait=False, cancel_futures=False)` and rebuilds the pool. Losing a few queued futures is acceptable; lingering mis-configured state is not. (Alternative considered: `max_tasks_per_child=1` — rejected because torch/sentence-transformers import takes 2–5 s and would pay that cost on every rank call.)
- **Cold-start amortization:** Warm one subprocess at startup by submitting a no-op `_init_lotus()` task per worker so the torch import happens before the first real request.

FastAPI handler becomes:
```python
@router.post("/api/operators/rank")
async def rank(req: RankRequest):
    future = rank_pool.submit(_run_rank, req.lm_config.dict(), req.candidates, req.op_args)
    return {"ranked": await asyncio.wrap_future(future)}
```

No lock, no serialization, N-way parallelism inside one semops container. Horizontal scaling (more semops replicas) further multiplies throughput without architectural change.

### 3. daily-digest — ARQ worker in apps/agent

ARQ is chosen over Celery because:
- Async-native, matches FastAPI/LangGraph codebase style.
- Single Redis backend (same instance), no extra broker.
- Lightweight (~500 LOC), no result-backend complexity.
- Built-in cron support (unused now; kept for future scheduled digests).

Structure:

```
apps/agent/
├─ workflows/
│   ├─ daily_digest.py              # existing workflow logic — extract into a pure function
│   ├─ digest_tasks.py   (new)      # ARQ task def: generate_section(ctx, section_id, user_id, lm_config)
│   └─ digest_worker.py  (new)      # ARQ WorkerSettings (redis_url, functions list, max_jobs)
└─ server/app.py                    # add POST /workflows/daily_digest/enqueue
```

Flow:
1. User clicks "generate" in the web UI → `POST /api/digest/sections/[id]/generate`.
2. Next.js route reads `UserSettings` for BYOK, POSTs to `apps/agent` `/workflows/daily_digest/enqueue` with `{ section_id, user_id, lm_config }` + `X-Internal-Token`.
3. Python handler calls `await arq_pool.enqueue_job("generate_section", ...)` and returns `{ job_id }`.
4. Next.js returns `{ jobId }` to the client; client polls `GET /api/digest/sections/[id]/status`.
5. ARQ worker picks up the job, runs the existing digest workflow, on completion HTTP-POSTs `/api/digest/sections/[id]/complete` on Node (existing `INTERNAL_CALLBACK_TOKEN` flow).

Retry: ARQ default `max_tries=3` with exponential backoff. Failed jobs land in a dead-letter list visible via `arq.jobs.Job.status()`.

### 4. Deploy

`apps/web/docker-compose.yml` grows two worker services. Both are single-replica, both scale via `--scale`:

```yaml
ingest-worker:
  build: apps/web
  command: npm run worker:ingest
  env_file: apps/web/.env
  depends_on: [postgres, redis]
  restart: unless-stopped

digest-worker:
  build: apps/agent
  command: arq workflows.digest_worker.WorkerSettings
  env_file: apps/agent/.env
  depends_on: [postgres, redis]
  restart: unless-stopped
```

`tsx` moves from `devDependencies` to `dependencies` in `apps/web/package.json` so `npm ci --omit=dev` production builds still have it. (Alternative considered: compile with `tsc` to `dist/` and run `node dist/workers/ingest.js` — rejected for simplicity; source-map-heavy `tsx` is fine for a single worker file at our scale.)

A minimal `apps/agent/Dockerfile` (if not already present) will be added to host the digest-worker.

### Error handling

- **Ingest worker crash mid-job**: BullMQ marks stalled after `stalledInterval` (default 30 s), re-queues. Notebook lock's heartbeat stops firing → TTL expires at most 5 min later → next attempt acquires clean. No manual intervention.
- **Digest worker crash mid-job**: ARQ marks `in_progress` jobs as `complete` by consensus with `max_tries`; retries follow. Failed jobs stay in `arq:failed` with full traceback.
- **Redis goes down**: BullMQ / ARQ reconnect; in-flight jobs pause. Web enqueue endpoints return 503 with a generic message (no internal-error leakage). Users see "try again later".
- **LOTUS subprocess crashes**: pool shim rebuilds the pool, pending futures fail fast with a clear error; client sees 500, can retry.

### Testing

- **Ingest transactional atomicity**: integration test that kills the process between `generateWikiPages` content build and `$transaction` commit — verify no orphaned wiki pages on reboot. (Test harness: Jest + Testcontainers for Postgres + Redis.)
- **Semaphore under contention**: Lua script unit-tested with a Redis-backed fixture; assert `PER_USER_LIMIT + 1` concurrent acquires → exactly `PER_USER_LIMIT` succeed.
- **LOTUS pool tenant isolation**: pytest test that interleaves two ranks with different `lm_config`, asserts each run sees only its own LM config during the call (monkey-patched `lotus.settings.lm.invoke`).
- **Digest enqueue → callback round-trip**: integration test — enqueue a digest, ARQ worker runs a stub that fires the Node callback, assert the section row transitions `processing → complete`.

## Implementation order — 3 PRs

Intentionally split small so reviewers can land each without waiting for the others.

**PR-A — wiki-ingest blocker fixes + search BYOK** (largest in LoC, but pure bug-fix on already-shipped code)
- 5 reviewer blockers (B1–B5)
- Error-message sanitation, Redis timeouts on status endpoint, retry-after-failure trap fix
- `tools/web.py` + `workflows/search.py` BYOK threading
- Adds `ingest-worker` service to docker-compose

**PR-B — semops LOTUS ProcessPoolExecutor** (Python-only, independent of PR-A)
- Remove `_LOTUS_LOCK`
- Add pool with spawn context + per-task configure/reset + poisoned-worker recovery
- Warm-up on startup
- Env var `SEMOPS_RANK_POOL_SIZE`

**PR-C — daily-digest ARQ worker** (new feature, independent of A/B)
- `digest_tasks.py`, `digest_worker.py`
- `POST /workflows/daily_digest/enqueue` in apps/agent
- `POST /api/digest/sections/[id]/generate` + `GET .../status` on Node (or reuse existing endpoints)
- `digest-worker` service in docker-compose

## Out of scope (tracked separately)

- **Postgres connection pooling (PgBouncer)** — flagged by SRE review; necessary before we scale workers to 3+ replicas. Separate infra PR.
- **Bull Board / ARQ admin UI** — operational visibility. Follow-up.
- **Structured logging + Prometheus metrics** — observability. Follow-up.
- **Per-user LLM provider rate limiting (token bucket upstream of OpenAI/Gemini)** — cost control. Follow-up.
- **Redis HA (Sentinel / Cluster)** — durability. Not needed at single-replica scale.
