# Wiki Ingest — Port to Python (Path Y) — Design

**Date:** 2026-04-27
**Status:** Design only. Phase 1 (LLM gateway in `9793c32`) is the production hot-fix while
this port is pending. Do not extend the gateway in the meantime.
**Scope:** Move the wiki-ingest pipeline (`apps/web/lib/services/graph-service.ts`, ~720 LOC TS)
into Python (`apps/agent/workflows/wiki_ingest.py`), aligning with the existing Python
home for every other LLM-driven workflow in the repo (chat, daily digest, search, matcher).
**Outcome:** Delete `apps/web/lib/services/graph-service.ts` AND
`apps/agent/server/routes/llm_gateway.py`. The repo loses the only Node→LLM path and the
"transparent forwarding" gateway that exists solely to keep that path alive. Net code change
is **negative** (more lines deleted than added).

---

## 1. Why this exists

### 1.1 The immediate trigger

apps/web (Node) cannot reach LLM providers from the SparkFlow corporate network
— outbound TLS to `api.openai.com` / `api.deepseek.com` / etc. is intercepted, and we
spent ~1 day proving that patching Node's TLS trust chain didn't get DeepSeek talking.
Python on the same host has working httpx + CA trust because that path is already
proven by `digest-worker`, `langgraph-api`, and the matcher service.

Phase 1 (commit `9793c32`) shipped a thin Python gateway (`/v1/llm/chat/completions`,
`/v1/llm/models`) so the existing TS wiki-ingest code keeps "calling LLMs" through
indirection. **It works, but it's the wrong long-term shape:**

* The OpenAI Node SDK is being lied to (`apiKey: "passthrough"`, BYOK key smuggled in
  custom headers) — a smell that the abstraction is misaligned.
* `assertSafeUrl` is implemented twice (TS + Python) and will drift.
* `litellm` is added as a dep purely to hide an abstraction we never use — every
  provider in PROVIDER_MAP is OpenAI-compatible, so litellm always dispatches via
  the openai adapter (`f"openai/{model}"` in `llm_gateway.py:257`).
* graph-service.ts becomes "the weird file" — every other LLM workflow already lives
  in Python.

### 1.2 The strategic alignment

Existing Python homes for LLM workflows:

| Workflow | File |
|---|---|
| Chat / agent reasoning | `apps/agent/graphs/surface.py` (LangGraph) |
| Daily digest | `apps/agent/workflows/daily_digest.py` |
| Search | `apps/agent/workflows/search.py` |
| Matcher | `apps/agent/workflows/matcher/` |
| **Wiki ingest** | **HOLDOUT** — `apps/web/lib/services/graph-service.ts` |

A new contributor seeing this layout and asked "where should a knowledge-graph
ingest pipeline that calls an LLM 5+ times, runs Louvain, and ends with one
transactional DB write live?" would put it in `apps/agent/workflows/wiki_ingest.py`.
Phase 2 closes that gap.

---

## 2. Goals / Non-goals

### 2.1 Goals

* Remove the only Node→LLM direct-call site and the `/v1/llm/*` gateway that
  currently keeps it alive.
* Wiki ingest sits next to `daily_digest.py` and `search.py` in `apps/agent/workflows/`
  — same idiomatic shape, same observability surface, same BYOK plumbing.
* Net DELETE more lines than added. Any green signal that the diff stat is positive
  is a sign the design grew bloat — go re-trim.
* Keep the existing public Prisma schema (`NotebookGraph`, `WikiPage`, `Source`)
  untouched. The Python side never writes to the DB directly. Node still owns the
  transactional commit, just hands the LLM payload to Python and writes the result.
* Preserve the existing public behaviour from the user's POV: same upload → same
  wait → same wiki page output. No frontend changes required.

### 2.2 Non-goals

* Streaming the wiki extraction. (Future work; orthogonal.)
* Storing the LLM intermediate results separately from the final WikiPage upsert.
  (Current implementation doesn't, this design preserves that.)
* Replacing BullMQ. The Node ingest-worker stays as the queue consumer — the only
  thing that changes is what it does with the source after MinerU finishes.
* Switching off LangChain in favour of raw OpenAI Python SDK in the new module.
  Use whichever (langchain-openai or LiteLLM) is already installed and consistent
  with `daily_digest.py` / `search.py`.
* Migrating `removeSourceFromWiki` to a separate Python endpoint. Either fold it
  into the same endpoint (with a `mode: "remove"` flag) or have Node trigger a
  full re-ingest of the remaining sources. See §6.3.

---

## 3. Architecture

### 3.1 Components after the migration

```
┌──────────────────────────────────────────────────────────────────────────┐
│  apps/web (Next.js + BullMQ ingest-worker)                               │
│                                                                          │
│  workers/ingest.ts  ─── per-job:                                         │
│    1. SELECT Source / NotebookGraph from Prisma                          │
│    2. POST /v1/workflows/wiki/extract  (sourceContent, byok, …)          │
│    3. RECEIVE { graph, communities, communityPages, indexPage, … }       │
│    4. prisma.$transaction(...) — graph upsert + WikiPage upserts +       │
│       orphan delete + log append   ← UNCHANGED, stays in Node            │
│                                                                          │
└────────────────────────────────┬─────────────────────────────────────────┘
                                 │ (HTTP, in-network in compose)
┌────────────────────────────────▼─────────────────────────────────────────┐
│  apps/agent (FastAPI workflows-api on :2027)                             │
│                                                                          │
│  POST /v1/workflows/wiki/extract                                         │
│    workflows/wiki_ingest.py                                              │
│      • extract_graph(content, title, sourceId, existingLabels, byok)     │
│      • merge_graph(existing, new)                                        │
│      • cluster_graph(merged)        ← networkx.community.louvain_…       │
│      • build_wiki_pages(graph, communities, sourceMap, byok)             │
│      • returns ExtractResult (pure data, no DB)                          │
│                                                                          │
│  Uses BYOK key/baseUrl from request body. LLM calls go through whatever  │
│  the rest of apps/agent already uses (langchain-openai or litellm) —     │
│  Python's httpx + corporate CA already proven.                           │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 What goes / what stays

| Concern | Current (Phase 1) | After Phase 2 |
|---|---|---|
| LLM calls (extract, summarize, build pages) | Node OpenAI SDK → `/v1/llm/chat/completions` gateway → Python httpx → provider | Python langchain/litellm directly → provider |
| Louvain clustering | Node `graphology` + `graphology-communities-louvain` | Python `networkx.community.louvain_communities` |
| Prompt assembly | TS template literals | Python f-strings or Jinja templates next to `daily_digest.py` style |
| Graph merging (`mergeGraph`) | Pure TS `Map`/`Set` operations | Pure Python dict/set, ~equivalent line count |
| Source filtering on remove | `removeSourceFromGraph` (pure TS) | Python pure function (or simplified — see §6.3) |
| Status writes (`Source.status = PROCESSING/READY/FAILED`) | Node Prisma | **Stays Node** |
| `prisma.$transaction` (graph upsert + WikiPage + orphan delete + log append) | Node Prisma | **Stays Node** — Python returns a payload, Node commits |
| BullMQ job pickup, per-user fairness, per-notebook lock, retry budget | Node `workers/ingest.ts` | **Stays Node** |
| BYOK key resolution + decrypt | Node `lib/services/api-key-resolver.ts` | **Stays Node** — passes resolved `{apiKey, baseUrl}` to Python in request body |

The `prisma.$transaction` block (graph-service.ts:651-718 today) is **already** structured
as a discrete final phase with a comment explicitly saying LLM calls happen outside it.
The seam is drawn — Phase 2 is just stepping through it.

### 3.3 Data contract — the Python endpoint

```http
POST /v1/workflows/wiki/extract
X-Internal-Token: ${INTERNAL_CALLBACK_TOKEN}
Content-Type: application/json

{
  "notebookId": "cmoxxx",
  "sourceId": "cmoyyy",
  "userId": "cmozzz",                 // for telemetry / audit only; Python never DB-writes
  "sourceTitle": "...",
  "sourceContent": "<markdown, already MinerU-extracted>",
  "existingNodeLabels": ["Llama", "DPO", ...],
  "existingGraph": { "nodes": [...], "edges": [...] } | null,
  "byok": {
    "provider": "deepseek",
    "model": "deepseek-v4-pro",
    "apiKey": "sk-...",
    "baseUrl": "https://api.deepseek.com/v1"     // optional, mostly for custom endpoints
  }
}
```

```http
200 OK

{
  "normalizedTitle": "...",
  "extraction": {
    "nodes": [{"id":"...","label":"...","type":"...","summary":"...","sourceRefs":["cmoyyy"]}],
    "edges": [{"source":"...","target":"...","relation":"...","confidence":"EXTRACTED","weight":1,"sourceRef":"cmoyyy"}]
  },
  "mergedGraph": { "nodes": [...], "edges": [...] },
  "communities": { "0": ["NodeA","NodeB"], "1": ["NodeC", ...] },
  "communityPages": [
    {"slug":"community-0","title":"...","markdown":"...","sourceIds":["cmoyyy",...]}
  ],
  "indexPage": {"slug":"index","title":"Wiki Index","markdown":"..."},
  "logEntry": "2026-04-27 ... extracted N nodes, M edges from cmoyyy"
}
```

Errors are structured:

```json
{
  "error": {
    "code": "INVALID_KEY" | "TIMEOUT" | "UPSTREAM_ERROR" | "BAD_INPUT" | "EXTRACTION_FAILED",
    "providerId": "deepseek",
    "message": "..."
  }
}
```

Same envelope as `/v1/workflows/daily_digest/*` — keep the surface consistent across
workflows-api endpoints.

### 3.4 Worker flow after the migration

`apps/web/workers/ingest.ts` (sketch):

```ts
async function processJob(job) {
  const source = await prisma.source.findUniqueOrThrow({ where: { id: sourceId } });
  const graph = await prisma.notebookGraph.findUnique({ where: { notebookId } });
  const byok = await resolveApiKey(userId, settings.wikiModelProvider);

  await prisma.source.update({ where: { id: sourceId }, data: { status: "INGESTING" } });

  const result = await fetch(`${WORKFLOWS_API_URL}/v1/workflows/wiki/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": INTERNAL_CALLBACK_TOKEN },
    body: JSON.stringify({
      notebookId, sourceId, userId,
      sourceTitle: source.title,
      sourceContent: source.markdown,
      existingNodeLabels: graph?.graphData?.nodes.map(n => n.label) ?? [],
      existingGraph: graph?.graphData ?? null,
      byok: { provider: settings.wikiModelProvider, model: settings.wikiModelName, ...byok },
    }),
  }).then(r => r.json());

  // The same transactional commit graph-service.ts has today, just consuming
  // `result` instead of computing it locally.
  await prisma.$transaction(async (tx) => {
    await tx.notebookGraph.upsert({...});
    for (const page of [result.indexPage, ...result.communityPages]) {
      await tx.wikiPage.upsert({...});
    }
    await tx.wikiPage.deleteMany({ where: orphanFilter });
    await tx.wikiPageLog.create({ data: { content: result.logEntry, ... } });
  });

  await prisma.source.update({ where: { id: sourceId }, data: { status: "READY" } });
  return { pagesWritten: result.communityPages.length + 1 };
}
```

The worker file shrinks to ~80 LOC (from currently ~110, plus pulls graph-service.ts's
~720 LOC out of the bundle entirely).

---

## 4. Files

### 4.1 NEW

* `apps/agent/workflows/wiki_ingest.py` — port of graph-service.ts. Estimated
  300-400 LOC Python (~70% the volume of equivalent TS for this kind of work
  because Pydantic models compress the type definitions).
* `apps/agent/server/routes/wiki_ingest.py` — FastAPI router with `POST /v1/workflows/wiki/extract`,
  `INTERNAL_CALLBACK_TOKEN` auth, structured error mapping. ~80 LOC.
* `apps/agent/tests/test_wiki_ingest.py` — at minimum: round-trip test with a
  mocked `litellm.acompletion` returning canned graph extractions, verify the
  returned shape matches the data contract; one test for `community-*` slug
  generation; one for orphan-page filter inputs.

### 4.2 MODIFIED

* `apps/agent/server/app.py` — `app.include_router(wiki_ingest_router)`.
* `apps/agent/pyproject.toml` — add `networkx>=3.0` (or `python-louvain` if you
  prefer the standalone package; networkx 3+ has `louvain_communities` built in
  and is the lower-friction option).
* `apps/web/workers/ingest.ts` — body becomes the snippet in §3.4. ~80 LOC.
* `apps/web/lib/services/wiki-ingest.ts` — currently 203 LOC. After Phase 2 it's
  ~60 LOC: status-marker writes + the Python call + the transactional commit
  helper. The orchestration logic moves to Python.
* `apps/web/components/deepdive/wiki/...` — **no changes.** UI consumes the same
  `WikiPage` rows from Prisma.

### 4.3 DELETED

* `apps/web/lib/services/graph-service.ts` — entire file. ~720 LOC gone.
* `apps/agent/server/routes/llm_gateway.py` — entire file. ~299 LOC gone.
  Removed once `wiki_ingest.py` is the only consumer of the BYOK forwarding
  pattern, and that consumer calls upstream directly.
* `apps/web/lib/providers/list-models.ts` — replaced by a thin client that calls
  a new `/v1/llm/models`-equivalent endpoint **inside** `wiki_ingest.py`'s
  router (or a separate small router for "BYOK key validation" — TBD; either
  way the `litellm` dep and the Node-side fake OpenAI client go away).
* `apps/agent/pyproject.toml` — remove `litellm>=1.50` (only added in `9793c32`
  for the gateway, can be replaced by langchain-openai which apps/agent already
  uses elsewhere — verify there's no other consumer first).
* OpenAI Node SDK from `apps/web/package.json` — once graph-service.ts is gone
  and nothing else imports `openai`, drop the dep.

### 4.4 Net diff projection

| | LOC added | LOC removed | Net |
|---|---|---|---|
| `wiki_ingest.py` (new) | ~350 | — | +350 |
| `wiki_ingest_router.py` (new) | ~80 | — | +80 |
| `app.py` (router include) | ~2 | — | +2 |
| `pyproject.toml` (networkx + remove litellm) | ~1 | ~1 | 0 |
| `workers/ingest.ts` | ~30 | ~30 | 0 |
| `wiki-ingest.ts` | — | ~140 | -140 |
| `graph-service.ts` (delete) | — | ~720 | **-720** |
| `llm_gateway.py` (delete) | — | ~299 | -299 |
| `list-models.ts` (slim down) | ~40 | ~225 | -185 |
| openai SDK dep | — | ~1 line in package.json | 0 (lockfile delta) |
| **TOTAL** | **+503** | **+1416** | **-913** |

Roughly **900 fewer net lines** in the repo after Phase 2 lands.

---

## 5. Implementation order

1. **Spike Python port of `extract_graph` + `merge_graph` + `cluster_graph`** as a
   self-contained module (no FastAPI route yet). Validate against a known input
   (use a real source from a dev notebook): assert the output has the expected
   shape, comparable graph structure to current TS output. ~half day.
2. **Port `build_wiki_page_payload`** (the heaviest TS function). ~half day.
3. **Wire FastAPI route** + auth + error envelope + Pydantic models. ~quarter day.
4. **Tests** with mocked `litellm.acompletion`. ~quarter day.
5. **Rewrite `workers/ingest.ts`** to call the new endpoint. ~half day, mostly
   verifying the transactional commit still produces identical DB state for a
   given input.
6. **Cutover behind a feature flag**: `WIKI_INGEST_BACKEND=python` env, default
   `node` (Phase 1 path) for one release. Once verified, flip default + remove
   the flag in the next release. ~half day for the flag wiring.
7. **Delete graph-service.ts + llm_gateway.py + Node `openai` SDK dep** in the
   commit AFTER the cutover. Keep them around during the soak window so a
   rollback is just env-var flip.

Total: **~2.5 person-days** of focused work.

---

## 6. Risks & mitigations

### 6.1 Louvain community-id stability

`graphology-communities-louvain` (TS) and `networkx.community.louvain_communities`
(Python) don't necessarily produce the same community IDs for the same input —
random tie-breaks differ. **Why this is fine:** `community-{id}` slugs are already
regenerated every ingest, and the orphan-page deletion (`deleteMany` on stale
`community-*` slugs) handles re-numbering atomically. UI components shouldn't be
relying on community ID stability across runs because it isn't stable across
runs in the current Node implementation either.

**Verify before cutover:** grep `apps/web/components/deepdive/wiki/` for any code
that caches community IDs across requests. If found, file a separate issue —
don't bundle the fix into this migration.

### 6.2 BYOK key in transit

The wiki extraction body now carries `byok.apiKey` over HTTP from Node to Python.
Mitigation:

* HTTP traffic stays inside the docker compose network (`workflows-api:2027`),
  never on the public internet.
* `INTERNAL_CALLBACK_TOKEN` already gates the entire `/v1/workflows/*` surface.
* Python side **never logs the body** at INFO level; only structured stages
  (e.g. "extracted N nodes from sourceId=...") are logged. Add a pytest that
  triggers an LLM error and asserts the apiKey doesn't appear in `caplog`.
* Same threat model that already applies to the Phase 1 gateway — no new exposure.

### 6.3 `removeSourceFromWiki` path

The current Node code path (`graph-service.ts:removeSourceFromGraph` → re-cluster
→ rebuild affected pages) is ~50 LOC of pure TS. Two options:

* **Option A (recommended):** Add `mode: "remove"` to the Python extract endpoint;
  body carries the removed `sourceId` instead of `sourceContent`. Python re-clusters
  and rebuilds pages from the existing graph minus that source. Node still does the
  transactional commit. Adds ~80 LOC to wiki_ingest.py, removes the corresponding
  TS path entirely.
* **Option B (lazy):** Drop the surgical-remove path. Mark the source removed,
  flag the notebook as "wiki dirty", and force a full re-ingest of remaining
  sources on the next user action. Simpler but worse UX. Not recommended unless
  the surgical path turns out to be brittle to port.

Decision: A. Mention it in the implementation order step 2.

### 6.4 Testing without a live LLM

`apps/agent/tests/` already has the pattern (see `test_tools_web.py` and
`test_matcher_workflow.py`): mock the LLM call at the boundary, assert on the
returned shape. Adopt the same pattern in `test_wiki_ingest.py`. No new test
infrastructure needed.

### 6.5 Concurrent in-flight migrations

The user is currently refactoring the agent + workflow framework. Schedule
this Phase 2 to land **after** that refactor is stable, so we're not chasing
two moving targets. If this design doc gets stale (e.g. the refactor changes
how routers are mounted, or moves `apps/agent/workflows/` somewhere else),
update §3.1 and §4 before kickoff — the rest of the document stays valid.

---

## 7. Out of scope for Phase 2

* Streaming wiki extraction. Defer.
* Switching wiki ingest off BullMQ (e.g. onto ARQ to match digest-worker).
  Keep the queue boundary where it is; the migration is about **what runs
  inside the worker**, not where the queue lives.
* Telemetry overhaul. Once the work is in Python, LangSmith tracing and
  `langchain.callbacks` come along for free with langchain-openai. Adopt
  them in a follow-up.
* Refactoring `apps/web/lib/services/wiki-ingest.ts` further (e.g. moving
  the transactional commit into a Prisma extension). Keep it minimal.

---

## 8. Demolition checklist

When Phase 2 is fully soaked and Phase 1 is being torn out:

- [ ] `WIKI_INGEST_BACKEND` env flag default is `python` for ≥ 1 week
- [ ] Zero rollback events to `node` backend in production logs
- [ ] `git rm apps/web/lib/services/graph-service.ts`
- [ ] `git rm apps/agent/server/routes/llm_gateway.py`
- [ ] Remove `app.include_router(llm_gateway_router)` from `apps/agent/server/app.py`
- [ ] Remove `litellm` from `apps/agent/pyproject.toml` (verify no other consumer)
- [ ] Remove `openai` from `apps/web/package.json` (verify no other consumer)
- [ ] `apps/web/lib/providers/list-models.ts` slimmed or deleted (depending on
      whether the BYOK validation endpoint moved to Python first)
- [ ] Remove the `WIKI_INGEST_BACKEND` flag itself
- [ ] Update `apps/web/CLAUDE.md` and `apps/agent/CLAUDE.md` — wiki ingest
      pipeline is now described under apps/agent

---

## Appendix A — Original review threads

Two parallel review agents converged on this path independently:

* **Agent A (first principles)** suggested trimming Phase 1's gateway to ~110
  net lines (drop litellm, drop double SSRF, drop 7-code error system, drop
  the OpenAI SDK passthrough trick). That's a valid intermediate step if the
  team can't afford 2.5 days right now — **save 65% of the gateway code while
  keeping wiki ingest in Node.**
* **Agent B (long-term architecture)** argued for this design (Path Y) on the
  grounds that ~70% of graph-service.ts is "LLM calls + pure graph algorithms
  + types" with zero affinity to Node/Prisma; the only Node-coupled part is
  the `prisma.$transaction` commit (~17%), and that's already factored as a
  discrete final phase. Net deletion of ~900 lines.

This document follows Agent B's recommendation, with Agent A's recommendation
recorded in `docs/superpowers/specs/...` (or the agent-team transcript) as the
fallback if the team capacity for Phase 2 doesn't materialize.

---

## Appendix B — Current Phase 1 state (commit 9793c32)

Until Phase 2 ships:

* Wiki ingest runs in Node (`graph-service.ts`); LLM calls go through
  `apps/agent/server/routes/llm_gateway.py` via `/v1/llm/chat/completions`.
* Settings UI's BYOK key validation also goes through `/v1/llm/models`.
* Both endpoints require `INTERNAL_CALLBACK_TOKEN`.
* Do **not** add features to either path. If a wiki-ingest improvement is
  requested, fold it into the Phase 2 port instead — see §5 step 1.
