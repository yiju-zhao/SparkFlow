# Blue/Green Deployment — Design

**Date:** 2026-04-29
**Scope:** Zero-downtime deploys on the single corp-network host, with a smoke-test window where QA hits the new color before public traffic gets swapped.
**Constraint:** No Kubernetes, no managed cloud LB, single Linux host, single Docker daemon. Whatever ships must work with `docker compose -p <project> up -d`.

---

## 1. Goals

- Public traffic experiences no observable downtime during a normal release. "Normal" = app code, prompts, frontend bundle, agent code, worker code, BYOK encryption format unchanged. Most releases.
- Operators can hit the new color through a separate hostname (`sparkflow-qa.<corp>.internal`) and run a fixed smoke-test script before swapping production traffic.
- Rollback is one command and faster than a fresh deploy. Default 30-minute window where blue is stopped-but-not-removed.
- The strategy is opt-in per release; small/safe changes can still ship via the same compose plumbing without going through the green-promote-blue dance if the operator prefers.

## 2. Non-goals

- Not a true canary. No %-traffic split. Promote is all-or-nothing.
- No multi-region or multi-host fail-over. Single host = single point of failure.
- No per-user sticky-session pinning. A user mid-CopilotKit-stream gets their stream cut at promote and reconnects to green; "zero downtime" is a page-load metric, not connection-continuity.
- Postgres / Redis / SearXNG major-version upgrades are out of scope and stay manual maintenance windows.
- LangGraph CLI / runtime minor-version bumps don't go through blue/green either (see §6).

## 3. Constraints (existing repo state to respect)

- `docker-compose.server.yml` defines the prod stack today: postgres, postgres-init, redis, searxng, ingest-worker, digest-worker, semops, plus `--profile prod` services workflows-api, migrate, web. The blue/green plan splits this file (§5).
- `apps/langgraph/Makefile` uses `langgraph up` (langgraph-cli) which generates its own internal compose file. Per `libs/cli/langgraph_cli/cli.py:921`, the user's `-d <override>` is passed as the FIRST `-f` and the cli's stdin compose as the SECOND — so the cli's defaults always win (image, ports). The cli also hardcodes `5433:5432` (postgres sibling) and `6379:6379` (redis sibling) host port bindings, both of which collide if two `langgraph up` projects run side-by-side.
- `apps/langgraph/docker-compose.override.yml.example` already wires `extra_hosts: host.docker.internal:host-gateway`, NO_PROXY, SSL_CERT_FILE, and in-container `DATABASE_URL` / `CHECKPOINT_DB_URL` / `SPARKFLOW_API_URL` rewrites. These survive into the new design.
- `apps/web/lib/queue/notebook-lock.ts` and `apps/web/lib/queue/user-slot.ts` are already designed for **multi-replica workers** (Lua-atomic semaphore + Redis `SET NX PX` mutex with heartbeat). Blue+green workers consuming the same queue is a supported posture, not a new risk.
- `apps/web/lib/services/wiki-ingest.ts` commits the entire wiki update in one `prisma.$transaction([...])` (graph + pages + log + orphan-delete) — atomic regardless of replica count.
- BYOK encryption uses `API_KEY_ENCRYPTION_SECRET` from a single `.env`. Blue and green share the same secret.
- Corp-network: Docker daemon trusts corp CA (already installed). `~/.docker/config.json` may inject HTTP_PROXY into containers. Embedded DNS sometimes flaky for sibling resolution **across separate** compose projects; reliable **within** a single user-defined network.

## 4. Topology

```
                  Public ingress (corp LAN)
                          │
                          ▼  :443
          ┌──────────────────────────────────┐
          │   caddy (single-instance)         │
          │   reads caddy/active.color file   │  ← public toggle
          │   reads caddy/qa.color    file    │  ← QA toggle (defaults inverse)
          └─────┬───────────────────┬─────────┘
                │ public hostname   │ qa.* hostname
        ┌───────▼──────┐    ┌───────▼──────┐
        │ BLUE stack   │    │ GREEN stack  │
        │  web-blue    │    │  web-green   │
        │  wfapi-blue  │    │  wfapi-green │
        │  agent-blue  │    │  agent-green │
        │  ingest-blue │    │  ingest-green│
        │  digest-blue │    │  digest-green│
        └──────┬───────┘    └──────┬───────┘
               │                   │
               └──────┬────────────┘
                      ▼  shared (single-instance)
        postgres (5433) ─ redis (6379) ─ searxng ─ semops
```

Both colors live on the **same docker network** (`sparkflow-net`, declared `external: true` in both `-color` and `-shared` files). This avoids the "DNS flaky between projects" gotcha — caddy can always resolve `web-blue` and `web-green`.

## 5. Service-by-service strategy

| Service | Mode | Notes |
|---|---|---|
| postgres | shared | Migrations must be expand-contract. See §7. |
| redis | shared | BullMQ + ARQ + notebook-lock keyspaces. |
| searxng | shared | Stateless, identical config across colors. |
| postgres-init | one-shot | Color-agnostic. |
| semops | shared | Stateless ProcessPoolExecutor. If a release breaks the matcher contract, version it as a per-color pair too — but normally shared. |
| **web** | per-color (`web-blue`, `web-green`) | Internal port only (`127.0.0.1:3101` / `:3102`); caddy fans in. |
| **workflows-api** | per-color | Internal port (`:2127` / `:2128`). |
| **ingest-worker** | per-color | Both drain `wiki-ingest`. Per-notebook lock + per-user slot already tolerate multi-replica. Green starts with `INGEST_WORKER_CONCURRENCY=0` (paused) until smoke-test passes; concurrency env raised at promote. |
| **digest-worker** | per-color | ARQ `_job_id` dedup (key `digest:section:{id}`) makes it idempotent. |
| **langgraph-api** (agent) | per-color, **custom-built compose service** | Built via `langgraph build -t sparkflow-agent:<sha>` (image-only; no `langgraph up`). Run as a normal compose service. **No host port published** — caddy reaches it through the shared network. This sidesteps the cli's `5433`/`6379` collisions. The override.yml.example env block (NO_PROXY, host.docker.internal, etc.) moves into the per-color compose definition. |
| **migrate** | one-shot per release | Runs as part of `deploy-green`; separate compose run that exits 0. Must be expand-only — see §7. |
| **caddy** | shared | The router. |

Why `langgraph up` is dropped: cli-managed compose is convenient locally but a hindrance in production. Bypassing it (we already have `langgraph build`) gives full control over ports, networks, and env, and removes a class of port-collision bugs we've already hit.

## 6. The four operator commands

A new repo-root `Makefile` wraps `docker compose`:

### `make deploy-green TAG=<git-sha>`

1. `git fetch && git checkout <sha>`.
2. `docker compose -f docker-compose.shared.yml up -d` (idempotent — already up in steady state).
3. Build all per-color images:
   - `docker compose -f docker-compose.shared.yml -f docker-compose.color.yml -p sparkflow-green --env-file .env.green build`
   - `make -C apps/langgraph build IMAGE_TAG=sparkflow-agent:<sha>` (uses existing `langgraph build`, **not** `up`).
4. Run migrations — must be expand-only (§7):
   - `docker compose -p sparkflow-green up -d migrate-green`
   - Wait for `service_completed_successfully`.
5. `docker compose -p sparkflow-green up -d` brings green app tier on internal ports. `INGEST_WORKER_CONCURRENCY=0` keeps green's worker idle so it can't pick up real users' jobs yet.
6. `caddy/qa.color` is set to `green`; `docker exec sparkflow-caddy caddy reload --config /etc/caddy/Caddyfile`. QA hostname now routes to green.

### `make smoke-test-green`

Runs `scripts/smoke-test-green.sh`:

1. `curl -fsS https://sparkflow-qa.<corp>.internal/api/health` (web-green).
2. Agent: hit a known-stable test notebook's wiki: `GET /api/notebooks/<TEST_NB>/wiki`.
3. Workflows: `curl -fsS https://sparkflow-qa.<corp>.internal/api/workflows/health`.
4. **Mutating fixture**: enqueue an ingest for a fixture source (`POST /api/notebooks/<TEST_NB>/sources` with a small dummy doc). The fixture is wired to a synthetic test user whose jobs the green worker is allowed to consume even with `INGEST_WORKER_CONCURRENCY=0` for real users (a per-user override, not a global toggle). Poll status; assert `state=completed`.
5. Exit non-zero on any failure.

### `make promote-green`

1. Atomic file swap: `echo green > caddy/active.color`.
2. `docker exec sparkflow-caddy caddy reload --config /etc/caddy/Caddyfile`. Caddy graceful reload preserves existing connections; new requests start hitting green immediately.
3. Raise green's `INGEST_WORKER_CONCURRENCY` to production value (env reload via `docker compose ... up -d ingest-worker-green`).
4. Stop blue's app-tier (`docker compose -p sparkflow-blue stop web workflows-api langgraph-api`) — blue no longer receives public traffic.
5. **Workers stay running** for `BLUE_WORKER_DRAIN_SECONDS` (default 600s) so any in-flight job picked up by `ingest-worker-blue` can finish — per-notebook lock + heartbeat already protects correctness, but draining is cleaner than killing mid-flight.
6. After drain: `docker compose -p sparkflow-blue stop` (full stop, but **don't down**).
7. After `BLUE_KEEP_SECONDS` (default 1800s), an idle reaper runs `docker compose -p sparkflow-blue down`. The reaper logs a 5-minute warning before reaping.

### `make rollback`

- Same `caddy reload` mechanism, opposite direction. Blue stack is still warm (only `stop`'d during promote).
- Steps: `docker compose -p sparkflow-blue start` → `echo blue > caddy/active.color` → `caddy reload`. Done in a few seconds.
- **Hard limit**: rollback only works within `BLUE_KEEP_SECONDS`. After that, rollback becomes a fresh `make deploy-blue TAG=<prev-sha>`.

## 7. Migration discipline

### The rule

Any migration that lands while one color is still serving traffic must be backward-compatible with the older code. Operationally:

1. **Expand** — additive only (new nullable column, new table, new index `CONCURRENTLY`, new enum value at end). Lands on main, ships in green; blue keeps running fine because old code ignores the new shape.
2. **Backfill** (optional) — data migration script in `apps/web/scripts/backfill/<ts>-<name>.ts`, runnable as a one-shot `npx tsx` job; runs after green is promoted but before contract.
3. **Contract** — drops/renames/tightens-nullability. Only lands AFTER the previous color has been fully retired (next deploy cycle minimum).

For column **renames** specifically: the existing `apps/web/CLAUDE.md` calls out hand-editing to `RENAME COLUMN`. Under blue/green, even `RENAME COLUMN` is unsafe across the overlap window — must be expressed as add-new + dual-write in app code + backfill + drop-old across three releases.

### Enforcement

- `scripts/check-migration-expand-contract.sh` runs in CI on PRs touching `apps/web/prisma/migrations/`. Rejects `DROP COLUMN`, `DROP TABLE`, `ALTER COLUMN ... NOT NULL` without a default, `RENAME COLUMN`, unless the adjacent `MIGRATION_PLAN.md` is marked `phase: contract` and references a prior expand migration via `prior_release_sha:`.
- `apps/web/prisma/migrations/MIGRATION_PLAN.template.md` checked in as the canonical scaffolding.
- `apps/web/CLAUDE.md` "Prisma Migration Workflow" section gets an addendum.

### The same rule applies to queue payloads

BullMQ (`apps/web/lib/queue/ingest-queue.ts`) and ARQ (`apps/langgraph/workflows/digest_worker.py`) job payloads are crossed by both colors during overlap (blue may enqueue, green may consume; vice versa). Treat the payload type as a contract:

- Adding a field: **must be optional**; readers default safely; writers omit safely.
- Removing a field: spans two releases — first remove all reads/writes, then remove from the type.
- Renaming a field: same as DB column rename — dual-shape across three releases.
- Changing semantics (same field, new meaning): introduce a new value/field; deprecate the old.

Pydantic models in `apps/langgraph/workflows/*.py` need `model_config = ConfigDict(extra="ignore")` so old workers don't reject new optional fields. Zod / TypeScript schemas in `apps/web/lib/queue/*.ts` must avoid `.strict()` on payload validation.

## 8. Database atomicity & concurrent access — what blue/green does and doesn't break

A common worry is that "two colors writing the same DB" introduces race conditions. It doesn't, at the **database** layer. SparkFlow already runs multi-replica workers; blue/green is the same posture, just with different code on each replica.

### What's safe by construction

| Concern | Why it's already handled |
|---|---|
| Two clients UPDATE the same row | Postgres MVCC + row locks; last writer wins, no torn reads. |
| Multi-step write across rows must be all-or-nothing | Already inside a single `prisma.$transaction([...])` (e.g. `wiki-ingest.ts`). |
| Two workers race on the same notebook's wiki | `apps/web/lib/queue/notebook-lock.ts` Redis `SET NX PX` mutex with heartbeat. |
| Per-user fairness across worker replicas | `apps/web/lib/queue/user-slot.ts` Lua-atomic semaphore. |
| Two workers claiming the same job | BullMQ `BRPOPLPUSH` atomicity. |
| Digest job double-fires | ARQ `_job_id=digest:section:{id}` dedup makes it idempotent. |

### What blue/green DOES introduce — and how it's bounded

Not atomicity issues; **semantics** issues. The discipline in §7 covers them:

- **Schema mismatch** — blue reading a column green just added. Bounded by expand-contract.
- **JSONB shape drift** in columns like `notebook_graphs.graphData`, `notebooks.wikiSchema`, `user_settings.apiKeys`. These columns have no Postgres-level schema; the contract is in app code. Both colors must be lenient readers (unknown keys preserved verbatim, missing keys defaulted) and conservative writers (no breaking shape changes in a single release).
- **Encryption key rotation** of `API_KEY_ENCRYPTION_SECRET`. The two colors share `.env`, so the same secret is used — but rotating the secret is incompatible with blue/green: at least one color will fail to decrypt. Rotation must use a dual-key scheme (try new, fall back to old) introduced in a release that both colors run, before the actual rotation. Out of scope for v1; documented as a known limitation.
- **LangGraph runtime checkpoint format** in `sparkflow_checkpoints`. The langgraph runtime owns its tables; we don't control the schema. Different langgraph minor versions may write incompatible state. **Therefore: blue and green must run the same `langgraph-api` minor version.** Bumping langgraph minor is an out-of-band maintenance window: take both colors down briefly, run a checkpoint migration if available, bring both colors back on the new minor. Coded as: `apps/langgraph/pyproject.toml`'s langgraph-api version is pinned to a minor; bump requires a separate "langgraph-upgrade" release type, not a normal app release.
- **Cross-color time-skewed writes** — blue's old code path writes `Source.markdown`, green's new code reads from `Source.contentBytea`. Bounded by dual-write/dual-read transition, same as DB renames. The "must support both shapes" period spans the overlap window AND the BLUE_KEEP_SECONDS rollback window.

In short: **Postgres and Redis give us atomicity for free**. The rules in §7 give us the semantic compatibility on top.

## 9. Pre-deploy checklist

Run through this before `make deploy-green`. CI checks the asterisked items.

- [ ] **\*** Prisma schema diff: expand-only? Adjacent `MIGRATION_PLAN.md` valid?
- [ ] **\*** BullMQ `WikiIngestJobData` type unchanged, OR change is purely additive optional fields?
- [ ] **\*** ARQ digest payload (`apps/langgraph/workflows/digest_tasks.py`) Pydantic model unchanged or expanded?
- [ ] No JSONB column shape change in `notebook_graphs`, `notebooks.wikiSchema`, `user_settings.apiKeys` (or both colors lenient)?
- [ ] `apps/langgraph/pyproject.toml`'s langgraph-api version unchanged?
- [ ] `API_KEY_ENCRYPTION_SECRET` unchanged?
- [ ] Smoke-test fixture (`<TEST_NB>` notebook + dummy source) still ingests successfully on local?

5/5 pass → `make deploy-green TAG=<sha>`.

## 10. Failure modes & mitigations

| Failure | Mitigation |
|---|---|
| Prisma migration partially applied while blue is still running | Migrations are expand-only at deploy time; blue tolerates. Contract phase is gated to next release. CI guard. |
| Bug in green ingest-worker corrupts a real user's notebook (queue is shared) | Smoke phase: green's worker concurrency=0 for non-fixture users until promote. Per-notebook lock + idempotent job IDs. |
| Buggy green digest-worker double-runs a section | ARQ `_job_id` dedup. |
| LangGraph checkpoint schema drift between blue & green | Pin langgraph-api minor across colors. Bumping = out-of-band window. |
| Browser hard-cached old web bundle hitting new API | Next.js standalone hashes `BUILD_ID` per build; old bundle's `/_next/data/<old-id>/...` 404s → page reload. Verify `/api/*` has `Cache-Control: no-store`. |
| Caddy reload drops in-flight WebSocket / SSE | Caddy graceful reload preserves connections until they close. CopilotKit reconnects automatically. ~20 sec drift is acceptable. |
| Two ingest-worker replicas duplicate-claim the same job | BullMQ atomic claim. Already battle-tested by current multi-replica posture. |
| Operator forgets `make rollback` is time-limited | Reaper logs 5-minute warning before reaping; emits to stderr and `docker logs sparkflow-caddy`. |
| Corp-network DNS flake between separate compose projects | Both colors share one external network `sparkflow-net`; caddy resolves siblings via standard docker DNS. |
| `langgraph build` fails on corp-network | Daemon CA already in trust store. Verified by current `make up-fresh` workflow. |
| Job-data shape change breaks cross-color consumption | §7 "Same rule applies to queue payloads"; CI check on `WikiIngestJobData` shape diff. |

## 11. Concrete file changes (summary)

| File | Status | Purpose |
|---|---|---|
| `docker-compose.shared.yml` | NEW | postgres, postgres-init, redis, searxng, semops, caddy. Always up. |
| `docker-compose.color.yml` | NEW | Parameterized stack: web, workflows-api, ingest-worker, digest-worker, langgraph-api, migrate. Names suffixed `-${SPARKFLOW_COLOR}`; ports bound to `127.0.0.1:${INTERNAL_PORT}`. |
| `docker-compose.server.yml` | KEEP as alias OR delete | Replace with a thin shim that includes both, or delete in favor of Makefile being the entrypoint. |
| `.env.blue`, `.env.green` | NEW | Per-color overrides: `SPARKFLOW_COLOR`, internal ports, `RELEASE_SHA`. Both reference shared `.env` for secrets. |
| `caddy/Caddyfile` | NEW | Two server blocks (public + qa); each `import`s a sibling upstream-conf file. |
| `caddy/upstream-active.conf`, `caddy/upstream-qa.conf` | NEW | One `reverse_proxy web-{color}:3001 {…}` line each. Edited by promote/rollback. |
| `caddy/active.color`, `caddy/qa.color` | NEW | Single-word files (`blue` / `green`); read by Caddyfile templating. |
| `Makefile` (repo root) | NEW | `deploy-green`, `smoke-test-green`, `promote-green`, `rollback`, `reap-blue`. |
| `scripts/smoke-test-green.sh` | NEW | The curl loop in §6. |
| `scripts/check-migration-expand-contract.sh` | NEW | CI guard for migrations. |
| `apps/web/prisma/migrations/MIGRATION_PLAN.template.md` | NEW | Template for the per-migration `MIGRATION_PLAN.md`. |
| `.github/workflows/migration-guard.yml` | NEW | Runs the guard on PRs. |
| `apps/web/CLAUDE.md` | EDIT | Add Blue/Green section + checklist. |
| `apps/langgraph/CLAUDE.md` | EDIT (or create) | Note about queue payload expand-contract. |
| `.claude/CLAUDE.md` | EDIT | Add Deployment section pointing at the four make targets. |
| `apps/langgraph/Makefile` | EDIT | `up` / `up-recreate` / `up-fresh` retained for **local dev only**. Production stops using them. |
| `apps/langgraph/docker-compose.override.yml.example` | KEEP for local | Stays for `make up` local workflow. Production env now lives in `docker-compose.color.yml`. |

## 12. What this DOESN'T solve

- Not a true canary (no %-traffic split).
- Postgres / Redis / SearXNG major upgrades stay manual maintenance windows.
- LangGraph runtime minor upgrades are out-of-band, not blue/green.
- Per-user sticky session pinning isn't supported. CopilotKit streams are cut at promote.
- Database rollback is not real. If green ships a contract migration despite CI, `make rollback` flips traffic but blue's code may break on the new schema. Contract migrations are a one-way door — the rule's whole point is to make them rare and explicitly gated.
- Multi-region DR not addressed. Single host = single point of failure.
- Cost: running both colors warm is roughly 2× app-tier RAM. On a single corp host this needs to fit in the box's headroom; if not, accept that during steady state only one color is up and `deploy-green` brings the other up cold (~30s extra latency to first smoke test).
