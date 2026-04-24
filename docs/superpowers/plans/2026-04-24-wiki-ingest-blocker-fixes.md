# Wiki-Ingest Blocker Fixes (PR-A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 5 correctness blockers plus 4 cross-cutting issues that three independent reviewers found in the BullMQ wiki-ingest refactor; thread Tavily BYOK as the small side-task. No scope creep beyond what the spec calls for.

**Architecture:** All changes stay within the existing BullMQ + Redis topology. `apps/web` gets a Lua-scripted semaphore, a lock-heartbeat, a transaction-scoped `generateWikiPages`, BullMQ sentinel errors for reschedule, a tsx→dependency bump, and a `ingest-worker` docker-compose service. `apps/agent` gets per-call Tavily key threading.

**Tech Stack:** TypeScript (Node 20), BullMQ 5, ioredis, Prisma 7, Python (pytest for agent-side changes), Docker Compose.

**Testing note:** `apps/web` has no Jest/Vitest setup today. Per project convention, verification is via `npx tsc --noEmit` + `npm run lint` + `npm run build` + targeted standalone scripts run through `tsx`. Do NOT add a test framework as part of this PR. `apps/agent` has pytest; use it there.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/lib/queue/user-slot.ts` | Create | Atomic per-user semaphore via a single Redis `EVAL` (Lua). |
| `apps/web/lib/queue/notebook-lock.ts` | Modify | Add heartbeat / extend-TTL function (Lua). |
| `apps/web/workers/ingest.ts` | Modify | Use new semaphore + heartbeat; switch reschedule to BullMQ `DelayedError`. |
| `apps/web/lib/services/graph-service.ts` | Modify | Split `generateWikiPages` into pure content-builder + tx-scoped writer. All DB writes inside a single `prisma.$transaction`. |
| `apps/web/lib/queue/ingest-queue.ts` | Modify | `enqueueWikiIngest({..., force: true})` cleans any stale completed/failed job with the same id before adding. |
| `apps/web/app/api/notebooks/[id]/sources/route.ts` | Modify | Sanitize enqueue-failure messages. |
| `apps/web/app/api/notebooks/[id]/ingest/[sourceId]/route.ts` | Modify | Sanitize + accept `?force=1` to retry a failed job. |
| `apps/web/app/api/notebooks/[id]/ingest/status/route.ts` | Modify | Add short Redis timeout; return 503 if Redis is unhealthy. |
| `apps/web/package.json` | Modify | Promote `tsx` to `dependencies`. |
| `apps/web/Dockerfile` | Create | Multi-stage Node image used by both `web` and `ingest-worker` services. |
| `apps/web/docker-compose.yml` | Modify | Add `ingest-worker` service. |
| `apps/web/scripts/verify-user-slot.ts` | Create | Standalone script that runs the Lua semaphore against a live Redis and asserts behavior. |
| `apps/agent/tools/web.py` | Modify | `search_web` accepts an optional `api_key` kwarg; `TavilyClient` uses it before falling back to env. |
| `apps/agent/workflows/search.py` | Modify | Thread `tavily_api_key` from `SearchRequest` through to `tools.web.search_web`. |
| `apps/agent/tests/test_tools_web.py` | Modify | New test: explicit `api_key` kwarg wins over env. |

---

## Task 1: Lua-atomic per-user semaphore

**Files:**
- Create: `apps/web/lib/queue/user-slot.ts`
- Create: `apps/web/scripts/verify-user-slot.ts`

- [ ] **Step 1: Write the semaphore module**

Create `apps/web/lib/queue/user-slot.ts`:

```typescript
import { getBullmqConnection } from "./redis";

/**
 * Per-user slot counter backed by a Redis sorted set, acquired and released
 * via atomic Lua scripts. Works correctly across worker replicas because all
 * state lives in Redis.
 */

const SLOT_TTL_MS = 30 * 60 * 1000;

function slotKey(userId: string): string {
  return `ingest:slots:${userId}`;
}

/**
 * Atomic acquire:
 *   1. Drop slots older than TTL (crash recovery).
 *   2. Add our candidate slot with score = now.
 *   3. Take the oldest `limit` slots; if we're not among them, remove ourselves.
 * Returns the slot token on success, "" on rejection. All four steps happen
 * inside a single EVAL, so no interleaving with another caller is possible.
 */
const ACQUIRE_SCRIPT = `
  local key   = KEYS[1]
  local now   = tonumber(ARGV[1])
  local ttl   = tonumber(ARGV[2])
  local limit = tonumber(ARGV[3])
  local token = ARGV[4]

  redis.call("ZREMRANGEBYSCORE", key, "-inf", now - ttl)
  redis.call("ZADD", key, now, token)

  local winners = redis.call("ZRANGE", key, 0, limit - 1)
  for i = 1, #winners do
    if winners[i] == token then
      return token
    end
  end
  redis.call("ZREM", key, token)
  return ""
`;

const RELEASE_SCRIPT = `
  redis.call("ZREM", KEYS[1], ARGV[1])
  return 1
`;

export async function acquireUserSlot(
  userId: string,
  limit: number,
): Promise<string | null> {
  const token = `${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
  const result = await getBullmqConnection().eval(
    ACQUIRE_SCRIPT,
    1,
    slotKey(userId),
    String(Date.now()),
    String(SLOT_TTL_MS),
    String(limit),
    token,
  );
  return result ? String(result) : null;
}

export async function releaseUserSlot(
  userId: string,
  token: string,
): Promise<void> {
  await getBullmqConnection().eval(
    RELEASE_SCRIPT,
    1,
    slotKey(userId),
    token,
  );
}
```

- [ ] **Step 2: Write a standalone verification script**

Create `apps/web/scripts/verify-user-slot.ts`:

```typescript
/**
 * Standalone check for the Lua semaphore in lib/queue/user-slot.ts.
 * Usage: REDIS_URL=redis://localhost:6379 npx tsx scripts/verify-user-slot.ts
 * Exits 0 on success, 1 on failure.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { acquireUserSlot, releaseUserSlot } from "../lib/queue/user-slot";
import { getBullmqConnection } from "../lib/queue/redis";

async function main() {
  const userId = `verify-${Date.now()}`;
  const limit = 2;

  // Clean any leftover state for this id.
  await getBullmqConnection().del(`ingest:slots:${userId}`);

  // Fire 5 concurrent acquires; exactly `limit` should get tokens.
  const results = await Promise.all(
    Array.from({ length: 5 }, () => acquireUserSlot(userId, limit)),
  );
  const admitted = results.filter(Boolean);
  if (admitted.length !== limit) {
    console.error(`FAIL: expected ${limit} admits, got ${admitted.length}`, results);
    process.exit(1);
  }

  // Releasing one should free a slot for a new acquire.
  await releaseUserSlot(userId, admitted[0] as string);
  const next = await acquireUserSlot(userId, limit);
  if (!next) {
    console.error("FAIL: expected acquire after release to succeed");
    process.exit(1);
  }

  await getBullmqConnection().del(`ingest:slots:${userId}`);
  await getBullmqConnection().quit();
  console.log("PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify against live Redis**

Run:
```bash
cd apps/web
docker compose up -d redis
REDIS_URL=redis://localhost:6379 npx tsx scripts/verify-user-slot.ts
```
Expected stdout: `PASS`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/queue/user-slot.ts apps/web/scripts/verify-user-slot.ts
git commit -m "feat(queue): atomic per-user slot semaphore via Lua script"
```

---

## Task 2: Notebook-lock heartbeat

**Files:**
- Modify: `apps/web/lib/queue/notebook-lock.ts`

- [ ] **Step 1: Add extend-TTL Lua + heartbeat helper**

Replace the contents of `apps/web/lib/queue/notebook-lock.ts` with:

```typescript
import { getBullmqConnection } from "./redis";

/**
 * Per-notebook mutex backed by Redis SET NX PX. The heartbeat extends the
 * TTL while the holder is still alive; this lets the ingest pipeline run
 * longer than the base TTL without losing mutual exclusion.
 */

const BASE_TTL_MS = 5 * 60 * 1000;          // 5 min
const HEARTBEAT_INTERVAL_MS = 60 * 1000;    // extend every 60s
const HEARTBEAT_EXTEND_MS = 5 * 60 * 1000;  // push TTL to now + 5 min

function lockKey(notebookId: string): string {
  return `lock:notebook:${notebookId}`;
}

export type NotebookLockHandle = {
  notebookId: string;
  token: string;
  stopHeartbeat: () => void;
};

export async function acquireNotebookLock(
  notebookId: string,
): Promise<NotebookLockHandle | null> {
  const token = `${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
  const result = await getBullmqConnection().set(
    lockKey(notebookId),
    token,
    "PX",
    BASE_TTL_MS,
    "NX",
  );
  if (result !== "OK") return null;

  const heartbeat = setInterval(() => {
    void extendLock(notebookId, token, HEARTBEAT_EXTEND_MS).catch((err) => {
      console.warn(`[notebook-lock] heartbeat failed for ${notebookId}:`, err);
    });
  }, HEARTBEAT_INTERVAL_MS);
  // Don't hold the Node event loop open just for a heartbeat.
  heartbeat.unref?.();

  return {
    notebookId,
    token,
    stopHeartbeat: () => clearInterval(heartbeat),
  };
}

const EXTEND_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("PEXPIRE", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

async function extendLock(
  notebookId: string,
  token: string,
  extendMs: number,
): Promise<void> {
  await getBullmqConnection().eval(
    EXTEND_SCRIPT,
    1,
    lockKey(notebookId),
    token,
    String(extendMs),
  );
}

const RELEASE_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

export async function releaseNotebookLock(handle: NotebookLockHandle): Promise<void> {
  handle.stopHeartbeat();
  try {
    await getBullmqConnection().eval(
      RELEASE_SCRIPT,
      1,
      lockKey(handle.notebookId),
      handle.token,
    );
  } catch (err) {
    console.warn(`[notebook-lock] release failed for ${handle.notebookId}:`, err);
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Quick heartbeat check via redis-cli**

Run:
```bash
cat > /tmp/check-heartbeat.ts <<'EOF'
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { acquireNotebookLock, releaseNotebookLock } from "./lib/queue/notebook-lock";
import { getBullmqConnection } from "./lib/queue/redis";

async function main() {
  const id = `verify-${Date.now()}`;
  const lock = await acquireNotebookLock(id);
  if (!lock) { console.error("FAIL: couldn't acquire"); process.exit(1); }

  const redis = getBullmqConnection();
  const ttl1 = await redis.pttl(`lock:notebook:${id}`);
  await new Promise((r) => setTimeout(r, 61_000)); // wait past one heartbeat tick
  const ttl2 = await redis.pttl(`lock:notebook:${id}`);
  // TTL should be refreshed close to HEARTBEAT_EXTEND_MS (5 min), not 4 min decayed.
  if (ttl2 < ttl1 - 30_000) {
    console.error(`FAIL: heartbeat did not extend TTL (ttl1=${ttl1}, ttl2=${ttl2})`);
    process.exit(1);
  }
  await releaseNotebookLock(lock);
  await redis.quit();
  console.log("PASS");
}
main().catch((e) => { console.error(e); process.exit(1); });
EOF
cd apps/web && REDIS_URL=redis://localhost:6379 npx tsx /tmp/check-heartbeat.ts
```
Expected stdout: `PASS` (takes ~61 s).

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/queue/notebook-lock.ts
git commit -m "feat(queue): add heartbeat to notebook-lock so long ingests keep mutex"
```

---

## Task 3: Worker uses new primitives + BullMQ sentinel for reschedule

**Files:**
- Modify: `apps/web/workers/ingest.ts`

- [ ] **Step 1: Replace worker semaphore + reschedule logic**

Overwrite `apps/web/workers/ingest.ts` with:

```typescript
/**
 * Wiki-ingest BullMQ worker.
 *
 * Run locally:   npm run worker:ingest
 * Concurrency is tuned by two env vars:
 *   INGEST_WORKER_CONCURRENCY    — total jobs in flight in this process
 *   INGEST_PER_USER_CONCURRENCY  — max jobs a single user can occupy
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { DelayedError, UnrecoverableError, Worker, type Job } from "bullmq";
import { getBullmqConnection } from "../lib/queue/redis";
import {
  INGEST_QUEUE_NAME,
  type WikiIngestJobData,
  type WikiIngestJobResult,
} from "../lib/queue/ingest-queue";
import { ingestSourceToWiki } from "../lib/services/wiki-ingest";
import { acquireNotebookLock, releaseNotebookLock } from "../lib/queue/notebook-lock";
import { acquireUserSlot, releaseUserSlot } from "../lib/queue/user-slot";

const CONCURRENCY = Number(process.env.INGEST_WORKER_CONCURRENCY ?? 4);
const PER_USER_LIMIT = Number(process.env.INGEST_PER_USER_CONCURRENCY ?? 2);

async function processJob(
  job: Job<WikiIngestJobData, WikiIngestJobResult>,
  token?: string,
): Promise<WikiIngestJobResult> {
  const { notebookId, sourceId, userId } = job.data;
  if (!notebookId || !sourceId || !userId) {
    throw new UnrecoverableError("missing notebookId / sourceId / userId on job");
  }

  const slotToken = await acquireUserSlot(userId, PER_USER_LIMIT);
  if (!slotToken) {
    // Reschedule without burning the attempts budget.
    await job.moveToDelayed(Date.now() + 2_000, token);
    throw new DelayedError();
  }

  const notebookLock = await acquireNotebookLock(notebookId);
  if (!notebookLock) {
    await releaseUserSlot(userId, slotToken).catch(() => undefined);
    await job.moveToDelayed(Date.now() + 3_000, token);
    throw new DelayedError();
  }

  const startedAt = Date.now();
  try {
    await job.updateProgress({ phase: "extracting", started: startedAt });
    const result = await ingestSourceToWiki(notebookId, sourceId, userId);
    await job.updateProgress({ phase: "done", pagesWritten: result.pagesWritten });
    return result;
  } finally {
    await releaseNotebookLock(notebookLock).catch(() => undefined);
    await releaseUserSlot(userId, slotToken).catch(() => undefined);
  }
}

const worker = new Worker<WikiIngestJobData, WikiIngestJobResult>(
  INGEST_QUEUE_NAME,
  processJob,
  {
    connection: getBullmqConnection(),
    concurrency: CONCURRENCY,
  },
);

worker.on("ready", () => {
  console.log(
    `[ingest-worker] ready — concurrency=${CONCURRENCY} perUserLimit=${PER_USER_LIMIT}`,
  );
});
worker.on("active", (job) => {
  console.log(`[ingest-worker] active job=${job.id} user=${job.data.userId}`);
});
worker.on("completed", (job, result) => {
  console.log(
    `[ingest-worker] completed job=${job.id} user=${job.data.userId} pages=${result.pagesWritten}`,
  );
});
worker.on("failed", (job, err) => {
  console.error(
    `[ingest-worker] failed job=${job?.id} user=${job?.data.userId}: ${err.message}`,
  );
});
worker.on("error", (err) => {
  console.error(`[ingest-worker] error: ${err.message}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[ingest-worker] ${signal} received, closing...`);
  await worker.close();
  await getBullmqConnection().quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
```

Key changes vs. the previous version:
- Imports `DelayedError` from BullMQ.
- Processor takes `token?: string` (BullMQ v5 signature).
- Uses `acquireUserSlot(userId, PER_USER_LIMIT)` + `releaseUserSlot(userId, token)` from the new module.
- On contention it calls `moveToDelayed` then throws `DelayedError()` — BullMQ treats this as a "not yet, try again" and does NOT increment `attemptsMade`.
- Dropped the old in-file sorted-set helpers (now in `lib/queue/user-slot.ts`).

- [ ] **Step 2: Type-check + build**

Run:
```bash
cd apps/web
npx tsc --noEmit
npm run build
```
Expected: no errors. Build finishes with the route table listing.

- [ ] **Step 3: Manual end-to-end smoke**

Run in one terminal:
```bash
cd apps/web
docker compose up -d postgres redis
npm run dev
```
Run in another terminal:
```bash
cd apps/web
npm run worker:ingest
```
Expected: worker prints `[ingest-worker] ready — concurrency=4 perUserLimit=2`. Upload a source in the UI; both logs show `active` → `completed`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/workers/ingest.ts
git commit -m "fix(ingest-worker): use DelayedError + Lua semaphore, no more attempt-budget burn"
```

---

## Task 4: Transaction-scoped `generateWikiPages`

**Files:**
- Modify: `apps/web/lib/services/graph-service.ts`

The current `generateWikiPages` writes community pages + index page using the module-level `prisma` client outside any transaction. The caller (`runGraphPipeline`) then opens a `$transaction` for graph upsert + orphan delete + log append. A crash between those produces orphaned/inconsistent wiki pages. Fix: split content generation from persistence, and fold all writes into the one `$transaction`.

- [ ] **Step 1: Split `generateWikiPages` into a pure builder**

In `apps/web/lib/services/graph-service.ts`, replace the `generateWikiPages` function (currently around lines 266-414) with the following two functions. Do NOT change `extractGraph`, `mergeGraph`, `clusterGraph`, or `removeSourceFromGraph`.

```typescript
// ============================================================
// 4. Build wiki page content — pure, no DB writes
// ============================================================

export type BuiltWikiPage = {
  slug: string;
  title: string;
  content: string;
  sourceRefs: string[];
};

export type BuiltWikiPayload = {
  communityPages: BuiltWikiPage[];
  indexPage: BuiltWikiPage;
};

export async function buildWikiPagePayload(
  graphData: GraphData,
  communities: CommunityMap,
  userId: string,
): Promise<BuiltWikiPayload> {
  const { client: openai, model: wikiModel } = await resolveWikiClient(userId);

  const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));
  const communityEntries = Object.entries(communities).filter(([, ids]) => ids.length > 0);

  const preparations = communityEntries.map(([communityId, nodeIds]) => {
    const communityNodes = nodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
    const communityEdges = graphData.edges.filter(
      (e) => nodeIds.includes(e.source) && nodeIds.includes(e.target),
    );
    const bridgeEdges = graphData.edges.filter(
      (e) =>
        (nodeIds.includes(e.source) && !nodeIds.includes(e.target)) ||
        (!nodeIds.includes(e.source) && nodeIds.includes(e.target)),
    );

    const degreeMap: Record<string, number> = {};
    for (const id of nodeIds) degreeMap[id] = 0;
    for (const e of communityEdges) {
      degreeMap[e.source] = (degreeMap[e.source] || 0) + 1;
      degreeMap[e.target] = (degreeMap[e.target] || 0) + 1;
    }
    const topNode = Object.entries(degreeMap).sort((a, b) => b[1] - a[1])[0];
    const communityLabel =
      (topNode ? nodeMap.get(topNode[0])?.label : null) ||
      communityNodes[0]?.label ||
      `Community ${communityId}`;

    const nodesText = communityNodes
      .map((n) => `- **${n.label}** (${n.type}): ${n.summary}`)
      .join("\n");
    const edgesText = communityEdges
      .map((e) => {
        const src = nodeMap.get(e.source)?.label || e.source;
        const tgt = nodeMap.get(e.target)?.label || e.target;
        return `- ${src} --${e.relation}--> ${tgt} (${e.confidence}, ${e.weight})`;
      })
      .join("\n");
    const bridgeText =
      bridgeEdges.length > 0
        ? bridgeEdges
            .slice(0, 5)
            .map(
              (e) =>
                `- ${nodeMap.get(e.source)?.label || e.source} --${e.relation}--> ${nodeMap.get(e.target)?.label || e.target}`,
            )
            .join("\n")
        : "(none)";

    return {
      communityId,
      communityLabel,
      communityNodes,
      nodesText,
      edgesText,
      bridgeText,
      sourceRefs: [...new Set(communityNodes.flatMap((n) => n.sourceRefs))],
    };
  });

  const completions = await Promise.all(
    preparations.map((p) =>
      openai.chat.completions.create({
        model: wikiModel,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `Write a wiki page for a knowledge graph community. Output markdown.
Use [[node-id]] for wiki links to other entities.
Include "Relationships" with confidence (✓ extracted, ~ inferred, ? ambiguous).
Include "Connections to Other Topics" for bridge edges. Be concise.
Do NOT include a References section — source attribution is handled separately.`,
          },
          {
            role: "user",
            content: `## Community: ${p.communityLabel}\n\n### Entities\n${p.nodesText}\n\n### Internal Relationships\n${p.edgesText || "(none)"}\n\n### Bridge Connections\n${p.bridgeText}`,
          },
        ],
      }),
    ),
  );

  const communityPages: BuiltWikiPage[] = preparations.map((p, i) => ({
    slug: `community-${p.communityId}`,
    title: p.communityLabel,
    content: completions[i].choices[0]?.message?.content || "",
    sourceRefs: p.sourceRefs,
  }));

  // Index page — lists every community with its top entities.
  const indexLines = ["# Wiki Index\n"];
  for (const [communityId, nodeIds] of Object.entries(communities)) {
    if (nodeIds.length === 0) continue;
    const nodes = nodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
    const sorted = [...nodes].sort((a, b) => {
      const degA = graphData.edges.filter((e) => e.source === a.id || e.target === a.id).length;
      const degB = graphData.edges.filter((e) => e.source === b.id || e.target === b.id).length;
      return degB - degA;
    });
    const label = sorted[0]?.label || `Community ${communityId}`;
    indexLines.push(`## [[community-${communityId}]] — ${label}`);
    indexLines.push(
      `${nodeIds.length} entities: ${nodes
        .slice(0, 5)
        .map((n) => `[[${n.id}]]`)
        .join(", ")}${nodeIds.length > 5 ? "..." : ""}\n`,
    );
  }

  const indexPage: BuiltWikiPage = {
    slug: "index",
    title: "Wiki Index",
    content: indexLines.join("\n"),
    sourceRefs: [],
  };

  return { communityPages, indexPage };
}
```

Also remove the old `export async function generateWikiPages(...)` in its entirety — nothing should call it once Step 2 is done.

- [ ] **Step 2: Fold all DB writes into one transaction in `runGraphPipeline`**

In the same file, replace the body of `runGraphPipeline` from the existing `// 2. Merge` marker through `return {...}` (roughly lines 609-690) with:

```typescript
  // 2. Merge
  await updateWikiStatus("merging");
  const merged = mergeGraph(existing, extraction);

  // 3. Cluster
  await updateWikiStatus("clustering");
  const { graphWithCommunities, communities } = await clusterGraph(merged);

  // 4. Build wiki page content OUTSIDE any transaction.
  //    LLM calls here take 10s-60s; never hold a tx across them.
  await updateWikiStatus("generating");
  const { communityPages, indexPage } = await buildWikiPagePayload(
    graphWithCommunities,
    communities,
    userId,
  );

  // 5. Commit everything atomically: graph upsert, wiki-page upserts,
  //    orphan delete, and log append in one short transaction.
  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] ingest | ${extraction.normalizedTitle || sourceTitle}\nNodes: +${extraction.nodes.length}, Edges: +${extraction.edges.length}, Communities: ${Object.keys(communities).length}`;
  const writtenSlugs = communityPages.map((p) => p.slug);

  await prisma.$transaction(
    async (tx) => {
      await tx.notebookGraph.upsert({
        where: { notebookId },
        create: {
          notebookId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          graphData: graphWithCommunities as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          communities: communities as any,
        },
        update: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          graphData: graphWithCommunities as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          communities: communities as any,
        },
      });

      for (const p of communityPages) {
        await tx.wikiPage.upsert({
          where: { notebookId_slug: { notebookId, slug: p.slug } },
          create: {
            notebookId,
            slug: p.slug,
            title: p.title,
            content: p.content,
            pageType: "CONCEPT",
            sourceRefs: p.sourceRefs,
          },
          update: { title: p.title, content: p.content, sourceRefs: p.sourceRefs },
        });
      }

      await tx.wikiPage.upsert({
        where: { notebookId_slug: { notebookId, slug: indexPage.slug } },
        create: {
          notebookId,
          slug: indexPage.slug,
          title: indexPage.title,
          content: indexPage.content,
          pageType: "INDEX",
          sourceRefs: [],
        },
        update: { content: indexPage.content },
      });

      await tx.wikiPage.deleteMany({
        where: {
          notebookId,
          slug: { startsWith: "community-" },
          NOT: { slug: { in: writtenSlugs } },
        },
      });

      const logPage = await tx.wikiPage.findUnique({
        where: { notebookId_slug: { notebookId, slug: "log" } },
        select: { id: true, content: true },
      });
      if (logPage) {
        await tx.wikiPage.update({
          where: { id: logPage.id },
          data: { content: logPage.content + logEntry },
        });
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  await updateWikiStatus("done");

  return {
    nodesAdded: extraction.nodes.length,
    edgesAdded: extraction.edges.length,
    communities: Object.keys(communities).length,
    pagesWritten: writtenSlugs.length,
    extractionReport,
  };
}
```

- [ ] **Step 3: Update all callers of the old `generateWikiPages`**

Search for remaining callers:
```bash
cd apps/web && grep -rn "generateWikiPages" --include="*.ts" --include="*.tsx"
```

For every hit that is NOT the deleted function itself, either (a) replace with a call to `buildWikiPagePayload` plus a local `$transaction` that mirrors Step 2, or (b) if the caller is the same code path as `runGraphPipeline` already covered, just remove the stale import. There should be no remaining references when you're done.

- [ ] **Step 4: Type-check + build**

```bash
cd apps/web
npx tsc --noEmit
npm run build
```
Expected: clean. If there are stale `generateWikiPages` imports, fix them now.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/graph-service.ts
git commit -m "fix(wiki): move all page writes into the ingest tx, preventing orphans"
```

---

## Task 5: Sanitize enqueue errors + timeout on status endpoint

**Files:**
- Modify: `apps/web/app/api/notebooks/[id]/sources/route.ts`
- Modify: `apps/web/app/api/notebooks/[id]/ingest/[sourceId]/route.ts`
- Modify: `apps/web/app/api/notebooks/[id]/ingest/status/route.ts`

- [ ] **Step 1: Sanitize enqueue failure message in the sources route**

In `apps/web/app/api/notebooks/[id]/sources/route.ts`, find the enqueue block added in the previous PR (the one that calls `enqueueWikiIngest`) and change its `catch` so we log the real error but return a generic message:

Replace:
```typescript
  let ingestJobId: string | null = null;
  if (finalMarkdown) {
    try {
      ingestJobId = await enqueueWikiIngest({
        notebookId,
        sourceId: source.id,
        userId: session.user.id,
      });
    } catch (err) {
      console.error("[POST sources] Failed to enqueue wiki ingest:", err);
    }
  }
```

With:
```typescript
  let ingestJobId: string | null = null;
  let ingestEnqueueError: string | null = null;
  if (finalMarkdown) {
    try {
      ingestJobId = await enqueueWikiIngest({
        notebookId,
        sourceId: source.id,
        userId: session.user.id,
      });
    } catch (err) {
      console.error("[POST sources] Failed to enqueue wiki ingest:", err);
      ingestEnqueueError = "ingest queue unavailable";
    }
  }

  return NextResponse.json(
    { ...source, ingestJobId, ingestEnqueueError },
    { status: 201 },
  );
```

Delete the previous `return NextResponse.json({ ...source, ingestJobId }, { status: 201 });` line so there's exactly one return at the end.

- [ ] **Step 2: Sanitize the ingest route**

In `apps/web/app/api/notebooks/[id]/ingest/[sourceId]/route.ts`, replace the final `try/catch`:

```typescript
  try {
    const jobId = await enqueueWikiIngest({
      notebookId,
      sourceId,
      userId: session.user.id,
    });
    return NextResponse.json({ accepted: true, jobId }, { status: 202 });
  } catch (error) {
    console.error("[POST ingest] enqueue failed:", error);
    return NextResponse.json(
      { error: "Ingest queue unavailable. Try again shortly." },
      { status: 503 },
    );
  }
```

- [ ] **Step 3: Add a short Redis timeout on the status endpoint**

In `apps/web/app/api/notebooks/[id]/ingest/status/route.ts`, wrap the `getWikiIngestJobStatus` call so it returns 503 within ~2 s if Redis is unhealthy.

Replace:
```typescript
  const status = await getWikiIngestJobStatus(jobId);
  if (!status) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
```

With:
```typescript
  const STATUS_TIMEOUT_MS = 2_000;
  let status: Awaited<ReturnType<typeof getWikiIngestJobStatus>>;
  try {
    status = await Promise.race([
      getWikiIngestJobStatus(jobId),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("redis status timeout")), STATUS_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    console.error("[GET ingest status] redis unhealthy:", err);
    return NextResponse.json(
      { error: "Status unavailable, retry shortly." },
      { status: 503 },
    );
  }
  if (!status) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
```

- [ ] **Step 4: Type-check + build**

```bash
cd apps/web && npx tsc --noEmit && npm run build
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/notebooks/\[id\]/sources/route.ts \
        apps/web/app/api/notebooks/\[id\]/ingest/\[sourceId\]/route.ts \
        apps/web/app/api/notebooks/\[id\]/ingest/status/route.ts
git commit -m "fix(api): sanitize enqueue errors; fail-fast on redis-unhealthy status polls"
```

---

## Task 6: Retry-after-failed doesn't get deduped to the corpse

**Files:**
- Modify: `apps/web/lib/queue/ingest-queue.ts`
- Modify: `apps/web/app/api/notebooks/[id]/ingest/[sourceId]/route.ts`

- [ ] **Step 1: `enqueueWikiIngest` supports a `force` flag**

In `apps/web/lib/queue/ingest-queue.ts`, replace the existing `enqueueWikiIngest` function with:

```typescript
export async function enqueueWikiIngest(
  data: WikiIngestJobData,
  opts: JobsOptions & { force?: boolean } = {},
): Promise<string> {
  const id = jobId(data);
  const queue = getWikiIngestQueue();

  if (opts.force) {
    // Drop any prior instance of this jobId — completed, failed, or delayed —
    // so `queue.add` doesn't silently return the old corpse.
    try {
      await queue.remove(id);
    } catch {
      // `remove` throws if the job is active; that's fine — don't re-enqueue
      // while an attempt is in flight.
    }
  }

  const { force: _force, ...addOpts } = opts;
  const job = await queue.add(INGEST_QUEUE_NAME, data, {
    jobId: id,
    ...addOpts,
  });
  return job.id ?? id;
}
```

- [ ] **Step 2: Manual-retry endpoint accepts `?force=1`**

In `apps/web/app/api/notebooks/[id]/ingest/[sourceId]/route.ts`, change the `POST` handler so `?force=1` flows through. Locate the existing block that calls `enqueueWikiIngest`:

Replace:
```typescript
    const jobId = await enqueueWikiIngest({
      notebookId,
      sourceId,
      userId: session.user.id,
    });
```

With:
```typescript
    const force = _request.nextUrl.searchParams.get("force") === "1";
    const jobId = await enqueueWikiIngest(
      {
        notebookId,
        sourceId,
        userId: session.user.id,
      },
      { force },
    );
```

Note the leading-underscore `_request` needs its underscore removed so we can read `nextUrl`. Update the parameter name from `_request` to `request` and the first-line reference to match.

- [ ] **Step 3: Type-check + build**

```bash
cd apps/web && npx tsc --noEmit && npm run build
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/queue/ingest-queue.ts \
        apps/web/app/api/notebooks/\[id\]/ingest/\[sourceId\]/route.ts
git commit -m "fix(ingest): force flag drops prior job before re-enqueue so retries actually run"
```

---

## Task 7: tsx as dependency + ingest-worker service

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/Dockerfile`
- Modify: `apps/web/docker-compose.yml`

- [ ] **Step 1: Promote tsx to dependencies**

Edit `apps/web/package.json`. Move the `"tsx": "^4.21.0"` entry from `devDependencies` to `dependencies`. After the edit, run:

```bash
cd apps/web
npm install
grep -n '"tsx"' package.json
```
Expected: `"tsx": "^4.21.0"` appears once, under `"dependencies"`.

- [ ] **Step 2: Create a minimal Dockerfile**

Create `apps/web/Dockerfile`:

```dockerfile
# Shared image for both the Next.js web server and the ingest worker.
# Built once, run with different commands.
FROM node:20-bookworm-slim AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS runtime
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma client is emitted to node_modules/.prisma at build time.
RUN npx prisma generate
# web server uses `npm start`; worker overrides the command.
EXPOSE 3001
CMD ["npm", "start"]
```

- [ ] **Step 3: Add the ingest-worker service**

In `apps/web/docker-compose.yml`, append after the existing `redis:` service:

```yaml
  ingest-worker:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: sparkflow-ingest-worker
    command: ["npm", "run", "worker:ingest"]
    env_file: .env
    environment:
      REDIS_URL: ${REDIS_URL:-redis://redis:6379}
      DATABASE_URL: ${DATABASE_URL}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
```

- [ ] **Step 4: Validate compose + build**

```bash
cd apps/web
docker compose config > /dev/null
docker compose build ingest-worker
```
Expected: `docker compose config` prints nothing (no errors); build completes and tags `sparkflow-web-ingest-worker`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json \
        apps/web/Dockerfile apps/web/docker-compose.yml
git commit -m "build: ingest-worker docker service; promote tsx to runtime dep"
```

---

## Task 8: Tavily BYOK threading (apps/agent)

**Files:**
- Modify: `apps/agent/tools/web.py`
- Modify: `apps/agent/workflows/search.py`
- Modify: `apps/agent/tests/test_tools_web.py`

- [ ] **Step 1: Write the failing test**

In `apps/agent/tests/test_tools_web.py`, add this test at the bottom of the file:

```python
def test_search_web_explicit_api_key_beats_env(monkeypatch):
    """Explicit api_key kwarg must override the TAVILY_API_KEY env var."""
    import sys
    from unittest.mock import MagicMock
    captured = {}

    fake_tavily = MagicMock()
    fake_tavily.search.return_value = {"results": []}

    def make_client(api_key):
        captured["api_key"] = api_key
        return fake_tavily

    tavily_mod = MagicMock()
    tavily_mod.TavilyClient = MagicMock(side_effect=make_client)
    monkeypatch.setitem(sys.modules, "tavily", tavily_mod)
    monkeypatch.setenv("TAVILY_API_KEY", "env_key")

    from tools.web import search_web
    search_web.invoke({"query": "x", "api_key": "user_key"})
    assert captured["api_key"] == "user_key"
```

- [ ] **Step 2: Run the test and confirm it fails**

```bash
cd apps/agent
pytest tests/test_tools_web.py::test_search_web_explicit_api_key_beats_env -v
```
Expected: FAIL with `TypeError` or similar — `search_web` does not accept `api_key`.

- [ ] **Step 3: Add `api_key` kwarg to `search_web`**

In `apps/agent/tools/web.py`, replace the `search_web` function with:

```python
@tool
def search_web(
    query: str,
    domains: list[str] | None = None,
    api_key: str | None = None,
) -> str:
    """Search the web for relevant pages via Tavily.

    Args:
        query: Search keywords (reformulated for best results).
        domains: Optional list of domains to restrict search to
            (e.g. ["arxiv.org"]).
        api_key: Tavily API key. If omitted, falls back to TAVILY_API_KEY env.
    """
    try:
        from tavily import TavilyClient  # type: ignore

        resolved_key = api_key or os.getenv("TAVILY_API_KEY", "")
        if not resolved_key:
            return json.dumps({"error": "TAVILY_API_KEY not configured"})

        client = TavilyClient(api_key=resolved_key)
        kwargs: dict = {
            "query": query,
            "max_results": 15,
            "search_depth": "advanced",
        }
        if domains:
            kwargs["include_domains"] = domains

        response = client.search(**kwargs)
        results = response.get("results", [])
        return json.dumps(
            [
                {
                    "title": r.get("title", ""),
                    "url": r.get("url", ""),
                    "content": r.get("content", ""),
                }
                for r in results
            ]
        )
    except Exception as e:  # noqa: BLE001
        return json.dumps({"error": str(e)})
```

- [ ] **Step 4: Run the test and confirm it passes**

```bash
cd apps/agent
pytest tests/test_tools_web.py -v
```
Expected: all tests in this file PASS, including `test_search_web_explicit_api_key_beats_env`.

- [ ] **Step 5: Thread the key through the search workflow**

In `apps/agent/workflows/search.py`, locate the Tavily invocation (around line 72 where the comment `"reuses the API key"` lives) and change the `.invoke(...)` call to pass an explicit `api_key` from the request context. The `SearchRequest` shape already includes BYOK for LLM; add a sibling `tavily_api_key` field.

Apply this diff pattern (adjust names to match the real request model; the key change is: resolve a `tavily_api_key` from the request and pass it into `search_web.invoke`):

Find the existing `search_web.invoke({"query": ...})` call and replace with:

```python
search_web.invoke(
    {
        "query": rewritten_query,
        "api_key": getattr(req, "tavily_api_key", None),
    }
)
```

Then, in the `SearchRequest` Pydantic model (same file), add:

```python
tavily_api_key: str | None = None
```

Alongside the existing BYOK fields.

- [ ] **Step 6: Run the full agent test suite**

```bash
cd apps/agent
pytest -q
```
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/tools/web.py apps/agent/workflows/search.py \
        apps/agent/tests/test_tools_web.py
git commit -m "feat(search): per-request Tavily BYOK key overrides env"
```

---

## Task 9: Final verification + PR

- [ ] **Step 1: Run every check from a clean state**

```bash
cd apps/web
npx tsc --noEmit
npm run lint
npm run build
docker compose config > /dev/null
```
Expected: all pass silently / cleanly.

- [ ] **Step 2: Run the standalone verification scripts**

```bash
cd apps/web
docker compose up -d redis postgres
REDIS_URL=redis://localhost:6379 npx tsx scripts/verify-user-slot.ts
```
Expected: `PASS`.

- [ ] **Step 3: End-to-end ingest smoke**

Start the web server + worker + docker services, upload a PDF through the UI, confirm:
- `POST /api/notebooks/[id]/sources` returns `{ ingestJobId: "nb:...:src:..." }` within < 1 s.
- `GET /api/notebooks/[id]/ingest/status?jobId=...` returns progress updates.
- Worker logs show `active` → `completed` with `pages=N`.
- Wiki panel in the UI reflects the new graph + community pages.

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin refactor/hermes-agent
gh pr create --title "fix(wiki-ingest): reviewer blockers + Tavily BYOK" \
  --body "See docs/superpowers/specs/2026-04-24-task-parallelization-design.md for design. Fixes B1–B5 from the code review plus error-message leaks, retry-after-failed dedup, and Tavily BYOK threading."
```

---

## What this plan intentionally does NOT do

- **PR-B (semops LOTUS ProcessPoolExecutor)** and **PR-C (daily-digest ARQ worker)** have their own plans.
- No Prisma schema change for Tavily user-key storage — the key flows via request context today. A follow-up PR adds a dedicated `UserSettings.tavilyApiKey` column and the corresponding settings-UI wiring.
- No Bull Board, no Prometheus metrics, no PgBouncer. All follow-ups tracked in the spec's "Out of scope" section.
- No new test framework in `apps/web`. Changes are verified via `tsc` + standalone `tsx` scripts + manual smoke. This matches current project practice.
