# Daily Digest — Design

**Date:** 2026-04-21
**Scope:** Per-user daily digest of curated content (WeChat articles in v1; pluggable for Twitter/RSS later), on-demand generation, in-app presentation at `/digest`.
**Architectural side effect:** `apps/matcher` is renamed to `apps/semops` and refactored so its public surface is a generic "semantic operators" API that both the existing Conference Matcher UI and the new Digest feature consume.

---

## 1. Goals

- A user configures one or more natural-language **interest queries** (e.g., "LLM Agent 在企业法务的落地实践") and a list of **subscribed content sources** per content type.
- At any time the user can click **生成今日 Digest** on `/digest` and, within seconds, see a magazine-style report of the top-N items from each source that best match their interests, each annotated with a reason for the recommendation.
- The user can navigate to any prior date and generate (or view an already-generated) digest for that day.
- The digest surface is source-agnostic: adding Twitter or RSS later requires only new data-fetching glue, not new ranking or storage infrastructure.

## 2. Non-goals (v1)

- No email delivery, push notifications, or cron-driven generation. All generation is user-initiated.
- No "since-last-seen" content windows, no fallback to previous days when today is sparse, no digest-level summary paragraph.
- No Twitter / RSS / paper-recommendation sources. Only WeChat. The data model and APIs are pluggable so these can be added without schema migration on the digest side, but no non-WeChat code lands in v1.
- No per-query weighting or interest priority. All enabled queries are treated equally.
- No per-article user actions beyond "open original link" (no save-to-notebook, no thumbs-up, no hide-source). These are easy additions later but not in v1.

## 3. User flows

### 3.1 First-time flow

1. User opens `/digest`. The page sees that `UserSettings.digestConfig` has no queries and no enabled sources. It renders an empty state with a **"前往设置配置兴趣方向"** CTA linking to `/settings#daily-digest`.
2. In Settings → Daily Digest, the user adds one or more interest queries (max 5) and ticks one or more WeChat sources (or leaves the source list empty, which means "all sources"). Auto-save persists on change.
3. User returns to `/digest` (today's date by default). Sees a **"生成今日 Digest"** button. Clicks it.
4. Each configured source section renders a `GENERATING` skeleton. As each section completes (independently), its cards replace the skeleton. Total time is dominated by the semops LLM call (~5-15s for one section).
5. Sections that have zero candidates show "今日暂无匹配".

### 3.2 Returning-user flow

1. `/digest` opens to today. If a `COMPLETED` digest exists for today, it's shown immediately (cached).
2. If today's digest does not exist, the generate button is shown.
3. Date navigator (arrows + calendar picker) lets the user jump to any prior date. If that date's digest exists, it's shown; otherwise, the generate button is shown for that specific date.
4. Each section card has a **Regenerate this section** overflow action. The overall digest has a **Regenerate all** action for the displayed date.

## 4. Architecture

### 4.1 Components

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web (Next.js)                                         │
│                                                             │
│  /digest page  ──┐                                          │
│                  │                                          │
│  /settings#daily-digest ──┐                                 │
│                           │                                 │
│  /api/digest/*  ──────────┼───► lib/services/digest/        │
│                           │       • orchestrator            │
│                           │       • wechat-candidate-pool   │
│                           │       • section-generator       │
│                           │       (one per sourceType)      │
│                           │                                 │
│                           └───► pgvector (wechat_article_   │
│                                 embeddings, BGE-M3)         │
│                                                             │
└──────────────────┬──────────────────────────────────────────┘
                   │ HTTP POST /api/operators/rank
                   ▼
┌─────────────────────────────────────────────────────────────┐
│  apps/semops  (renamed from apps/matcher, port 2025)        │
│                                                             │
│  services/semantic_operators.py   (new, generic)            │
│    • rank(candidates, text_field, query, K, model_cfg)      │
│      → { ranked, reasons }                                  │
│    Internally uses LOTUS sem_topk + sem_map                 │
│                                                             │
│  services/lotus_matcher.py        (existing, refactored     │
│    to call SemanticOperators; still owns SESSION /          │
│    PUBLICATION build_text_column)                           │
│                                                             │
│  api/routes/operators.py          (new) — generic endpoint  │
│  api/routes/jobs.py               (existing, unchanged      │
│    externally; internally calls SemanticOperators)          │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Boundary principle

`apps/semops` knows nothing about SESSION, PUBLICATION, or WECHAT at the `SemanticOperators` level. Its unit of work is: **"given a list of dicts, a text field name, a query, a K, and a model config, return the top-K ranked with reasons."** Business-aware text assembly (how to turn a WeChat article row into a one-line semantic string) is the caller's responsibility — it lives in the caller's codebase.

For the existing Conference Matcher, `LotusMatcher.build_text_column` stays inside semops (it's a Conference Matcher concern that happens to be colocated). For digest, candidate-text assembly happens in `apps/web` inside `lib/services/digest/`.

## 5. Data model

### 5.1 New Prisma models

```prisma
enum DigestSourceType {
  WECHAT
  // Future: TWITTER, RSS, PAPER, ...
}

enum DigestStatus {
  GENERATING
  COMPLETED
  EMPTY          // pool was empty; legitimate "nothing matched today"
  FAILED
}

model DailyDigest {
  id          String          @id @default(cuid())
  userId      String
  user        User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  digestDate  DateTime        @db.Date
  generatedAt DateTime        @default(now())

  sections    DigestSection[]

  @@unique([userId, digestDate])
  @@index([userId, digestDate(sort: Desc)])
}

model DigestSection {
  id            String             @id @default(cuid())
  digestId      String
  digest        DailyDigest        @relation(fields: [digestId], references: [id], onDelete: Cascade)
  sourceType    DigestSourceType
  status        DigestStatus       @default(GENERATING)
  items         Json               // DigestItem[]
  candidatePool Int                @default(0)   // candidates passed to ranker
  modelUsed     String?            // "openai/gpt-4o-mini" etc
  error         String?
  startedAt     DateTime           @default(now())
  completedAt   DateTime?

  @@unique([digestId, sourceType])
}
```

### 5.2 Generic `DigestItem` shape (stored in `DigestSection.items` jsonb)

```ts
type DigestItem = {
  rank: number;                  // 1..topN
  externalId: string;            // source-native id (e.g., WeChat article.id as string)
  sourceRefId: string | number;  // e.g., wechat source_id
  sourceName: string;            // e.g., "机器之心"
  title: string;
  author?: string;
  publishedAt: string;           // ISO 8601
  url: string;
  score: number;                 // 0..1, from prefilter
  matchedQueries: string[];      // user query ids this item matched
  reason: string;                // generated by semops sem_map
  summary: string;               // short 1-2 sentence summary (derived from title + first N chars)
  meta?: Record<string, unknown>; // source-specific extras (e.g., cover_url for WeChat)
};
```

### 5.3 Changes to existing models

**`UserSettings`** (`apps/web/prisma/schema.prisma`):

- Rename `matcherModelProvider` → `semopsModelProvider` (RENAME COLUMN)
- Rename `matcherModelName` → `semopsModelName` (RENAME COLUMN)
- Add `digestConfig Json @default("{}")`

The rename captures that the preference now governs both apps that call semops. No separate `digestModelProvider` field is added in v1; digest inherits the same BYOK choice the user made for the conference matcher. This can be split later if evidence warrants it.

**Shape of `digestConfig` jsonb:**

```ts
type DigestConfig = {
  queries: {
    id: string;           // stable uuid
    text: string;         // natural-language interest, ≤ 200 chars
    enabled: boolean;
    createdAt: string;    // ISO 8601
  }[];                    // max 5 entries; UI enforces
  sources: {
    wechat?: {
      subscribedSourceIds: number[];  // empty array = all sources
      topN: number;                   // 1..10, default 5
    };
    // future: twitter?, rss?, ...
  };
};
```

The existing `UserSettings.wechatExcludedSourceIds` stays (governs the Explore page); digest uses the positive `subscribedSourceIds` from `digestConfig.sources.wechat` instead.

## 6. API surface

### 6.1 Digest APIs (`apps/web`)

| Method & Path | Purpose |
|---------------|---------|
| `GET /api/digest?date=YYYY-MM-DD` | Return cached digest for `(user, date)` or 404. If `date` omitted, defaults to today. |
| `POST /api/digest/generate` | Body: `{ date: "YYYY-MM-DD", sources?: DigestSourceType[] }`. Creates `DailyDigest` if missing, creates a `DigestSection` per requested/configured source in GENERATING state, kicks off background generation, returns the created digest. If a COMPLETED digest for the date already exists, returns 409; client must call regenerate explicitly. |
| `POST /api/digest/regenerate` | Body: `{ date, sources?: DigestSourceType[] }`. Same as generate but replaces existing sections (cascades delete, then creates fresh). |
| `GET /api/digest/:digestId/sections/:sectionId/status` | Poll endpoint for a single section's status/progress. Used while generation is in flight. |

Generation is async: `POST /api/digest/generate` returns quickly (with section rows in `GENERATING`), and a server-side background task runs each section through the pipeline. The client polls `/status` per section until each is `COMPLETED | EMPTY | FAILED`, or uses SSE (see §7.3).

### 6.2 Semops APIs (`apps/semops`, port 2025)

**New** (generic):

| Method & Path | Purpose |
|---------------|---------|
| `POST /api/operators/rank` | Body: `{ candidates: object[], text_field: string, query: string, top_k: number, include_reasons?: boolean, model_config: { provider, model, api_key, api_base? } }`. Returns `{ ranked: object[], reasons?: {[externalId]: string} }`. Synchronous; caller provides a manageable candidate set (≤ ~50). No FAISS index, no sem_search — operates directly on the given candidates. |

**Existing, unchanged externally:**

| Method & Path | Purpose |
|---------------|---------|
| `POST /api/jobs`, `GET /api/jobs/:id`, `GET /api/jobs/:id/stream`, `DELETE /api/jobs/:id`, `GET /api/jobs/:id/download` | Conference Matcher's job API. Internally refactored to call `SemanticOperators.rank` instead of inlining LOTUS calls, but input/output contract preserved so `/explore/toolbox/matcher` UI is unaffected. |

## 7. Pipeline

### 7.1 High-level per-section generation

For `sourceType = WECHAT`:

1. **Load config.** Read `UserSettings.digestConfig.sources.wechat`; read enabled queries from `digestConfig.queries`.
2. **Build candidate pool.** For each enabled query:
   - Compute its embedding (BGE-M3 via existing infra)
   - Run ANN on `wechat_article_embeddings` using the prefilter pattern in `app/api/explore/search/wechat/prefilter/route.ts`, **with two additional WHERE clauses**:
     - `publish_time >= :digestDate 00:00:00 AND publish_time < :digestDate 24:00:00` (filter today)
     - `source_id = ANY(:subscribedSourceIds)` if the user configured any; else no source filter
   - Take top 10 per query
3. **Union & dedupe** across queries by `article.id`. Attach each query that retrieved the article to `matchedQueries`. Cap pool at 30.
4. **If pool is empty:** set section status to `EMPTY`, persist, stop.
5. **Assemble candidate text.** Each candidate becomes a dict with `text` field constructed as `"Title: {title} | Author: {author} | Source: {source_name} | Summary: {content_text[:300]}"`.
6. **Compose joint query text** from the user's enabled queries (joined with blank lines — semops `rank` treats it as one compound query; per-query ranking is approximated by the prefilter step). This is a v1 simplification; see §14.
7. **Call semops** `/api/operators/rank` with the candidates, `text_field="text"`, the joint query, `top_k = config.topN`, `model_config` resolved via `resolveApiKey` against `UserSettings.semopsModelProvider/Name`.
8. **Persist results.** Transform semops output into `DigestItem[]` (attach `meta.cover_url` from the WeChat article row), update section row with items + status `COMPLETED` + `modelUsed` + `completedAt`.

### 7.2 Concurrency

- Sections within one digest run **in parallel** (each is an independent semops call).
- Multiple users' digests can run simultaneously — no global locks.
- A per-user lock on `(userId, digestDate, sourceType)` via a short-lived advisory lock (or a SELECT … FOR UPDATE on the `DigestSection` row) prevents double-generation when the user clicks twice.

### 7.3 Client progress UX

Two options, pick one during implementation:

- **Simple (polling):** the `/digest` page polls each section's `/status` endpoint every 1.5s while any section is `GENERATING`. Stops when all sections reach a terminal state.
- **Nicer (SSE):** a `GET /api/digest/:digestId/stream` SSE endpoint streams section status updates. Mirrors the pattern in `apps/matcher/api/routes/jobs.py:121`.

v1 default: **polling**. SSE is a later optimization.

## 8. UI

### 8.1 `/digest` page (magazine layout)

- Route: `app/[locale]/digest/page.tsx` (top-level, not under `/explore`).
- Header row:
  - Title: **每日精选** / **Daily Digest**
  - Date navigator: prev arrow — date label (click opens calendar picker) — next arrow (disabled if date is today).
  - Actions dropdown: **Regenerate all**, **Edit interests** (links to settings).
- Body: one section per configured source. Section header: source-type icon + label ("微信文章 · 5 条" / "WeChat Articles · 5").
- Within a section (Magazine layout):
  - **Hero card** (#1 item): large cover image (cover_url or gradient fallback), overlaid rank badge, title, reason block (1-2 sentences), source + time, tap opens `url` in new tab.
  - **Grid** (#2..#N): two-column grid of smaller cards with thumbnail, title, source, short reason.
- Empty section: "今日暂无匹配" with subtle icon; no cards.
- Generating section: 5 skeleton cards (1 hero + 4 grid).
- Failed section: inline error "生成失败" + Retry button triggering regenerate for that section only.

### 8.2 Cover image fallback

- When `meta.cover_url` is missing or loads zero-byte, render a gradient placeholder (deterministic from `externalId` hash) with the source name in light overlay.
- WeChat hotlink protection is handled by routing the image through `/api/wechat/images` (existing).

### 8.3 Settings → Daily Digest

- New section in `app/[locale]/settings/page.tsx`, anchor `#daily-digest`.
- **Interests card:**
  - List of queries (≤ 5). Each row: rank badge, query text (ellipsis past 1 line), enabled pill, edit / delete buttons.
  - "+ 添加新方向" button (disabled at 5).
  - Edit opens a dialog with a `<textarea>` (≤ 200 chars), placeholder with example.
  - Auto-save debounced (500ms); toast "已保存" on completion.
- **WeChat sources card:**
  - Search input on top, filters the list client-side (list of all WeChat sources already cached elsewhere in the app).
  - Checkbox grid (2 columns). Ticked boxes = subscribed; unticked = excluded.
  - "Top-N: 5 [调整]" next to the card header — opens a small popover with a number input (1–10).
  - Empty state hint: "不勾选任何一个 = 订阅全部".
- **Future sources card (Twitter, RSS):** disabled placeholder with "即将支持" tag — not shown in v1 unless trivially cheap.

### 8.4 i18n

All new user-facing strings added to `messages/en.json` and `messages/zh.json` under `digest.*` namespace. No English-only strings. The interest query text itself is user-authored (either language).

## 9. BYOK / model handling

- `UserSettings.semopsModelProvider` + `semopsModelName` (renamed from `matcherModel*`) govern which LLM both apps' semops calls use.
- At call time in `apps/web`: `resolveApiKey(userId, provider)` produces `{ apiKey, apiBase? }`. This plus provider/name goes into the `model_config` in the `/operators/rank` request body.
- In `apps/semops`, `SemanticOperators.rank` reads `model_config` and initializes a fresh LOTUS `LM` instance for that call: `LM(model=f"{provider}/{model}", api_base=api_base, api_key=api_key, max_batch_size=5, max_tokens=4096)`. It does **not** mutate `lotus.settings` globally for the request (see §10 on the refactor).
- If `resolveApiKey` returns no key (non-admin user without BYOK) and there's no admin fallback, `/api/digest/generate` returns 400 with a descriptive error pointing the user to BYOK settings.

## 10. `apps/semops` refactor detail

### 10.1 File moves

- `apps/matcher/**` → `apps/semops/**` (whole-directory rename).
- `NEXT_PUBLIC_MATCHER_API_URL` env var → `NEXT_PUBLIC_SEMOPS_API_URL` (but the existing var should be kept as a fallback for one release to avoid breaking local dev).
- Root CLAUDE.md, `apps/web/CLAUDE.md`, `apps/matcher/README.md` (if any) updated.
- `docker compose` / deploy scripts updated.

### 10.2 Code refactor inside `apps/semops`

- **New** `services/semantic_operators.py`:
  ```python
  class SemanticOperators:
      def rank(
          self,
          candidates: list[dict],
          text_field: str,
          query: str,
          top_k: int,
          include_reasons: bool,
          model_config: ModelConfig,
      ) -> RankResult: ...
  ```
  - Accepts an already-assembled candidate list (no FAISS, no sem_search).
  - Builds a DataFrame with the `text_field` as-is.
  - Configures a per-call LOTUS `LM` using `model_config`; does NOT rely on module-level `lotus.settings` state.
  - Runs `sem_topk` → optional `sem_map` for reasons.
  - Returns `{ ranked: list[dict], reasons: dict[id, str] | None }`.

- **Refactor** `services/lotus_matcher.py`:
  - Keeps `build_text_column` (SESSION / PUBLICATION).
  - Keeps `run_pipeline`, but `sem_topk + sem_map` are delegated to `SemanticOperators.rank`. `sem_search` (embedding prefilter) stays here as it's tied to the bulk matcher's use case.

- **Refactor** `services/job_runner.py`:
  - No external contract change.
  - Each BU's optimized query now flows through `LotusMatcher.run_pipeline` which internally uses `SemanticOperators`. Net behavior identical.

- **New** `api/routes/operators.py`:
  - `POST /api/operators/rank` — thin adapter that parses the request body into a call to `SemanticOperators.rank`.

### 10.3 LOTUS model-config scoping

The current singleton pattern (`lotus.settings.configure(lm=…)` at startup) must change. Either:

- **Option α** — call `lotus.settings.configure(lm=…)` per request with a request-scoped lock. Simple but serializes all operator calls globally.
- **Option β** — instantiate a fresh matcher-like context per request and set `lotus.settings` inside that context. Requires reading LOTUS internals to see if settings can be scoped.

v1 lands whichever works; this is the highest-risk implementation detail. If LOTUS refuses per-request scoping, fall back to **Option α with a semaphore** (max concurrency 4) since digest traffic is low.

## 11. Empty / error handling

- **Pool empty (no today's articles in subscribed sources):** section status `EMPTY`. UI: "今日暂无匹配".
- **Ranker returns fewer than topN** (semops decided fewer items were genuinely relevant): persist as-is with N items; UI renders N cards without explanation.
- **Semops call fails:** section status `FAILED` with `error` text. UI shows retry control scoped to that section.
- **BYOK key missing:** the API refuses the request before queuing with a clear error; no `FAILED` row is created.
- **WeChat cover image fails to load:** fallback gradient in the UI; no retry.
- **Pool size > 30:** trim to 30 by prefilter score; no user-visible error.

## 12. Migration plan

### 12.1 Schema migration

One Prisma migration `2026xxxxxxxxxx_add_daily_digest_and_rename_matcher_model`:

```sql
-- Rename matcher model columns on UserSettings
ALTER TABLE "UserSettings" RENAME COLUMN "matcherModelProvider" TO "semopsModelProvider";
ALTER TABLE "UserSettings" RENAME COLUMN "matcherModelName" TO "semopsModelName";

-- Add digest config
ALTER TABLE "UserSettings" ADD COLUMN "digestConfig" JSONB NOT NULL DEFAULT '{}';

-- Create digest enums and tables
CREATE TYPE "DigestSourceType" AS ENUM ('WECHAT');
CREATE TYPE "DigestStatus" AS ENUM ('GENERATING', 'COMPLETED', 'EMPTY', 'FAILED');

CREATE TABLE "DailyDigest" (…);
CREATE TABLE "DigestSection" (…);

-- Indexes
CREATE UNIQUE INDEX ON "DailyDigest" ("userId", "digestDate");
CREATE UNIQUE INDEX ON "DigestSection" ("digestId", "sourceType");
CREATE INDEX ON "DailyDigest" ("userId", "digestDate" DESC);
```

Per `apps/web/CLAUDE.md`, inspect the Prisma-generated SQL and hand-edit any `DROP COLUMN + ADD COLUMN` sequences into `RENAME COLUMN` before commit. The renames above are the critical case.

### 12.2 Rollout order

1. Land semops refactor PR (internal changes only; `/api/operators/rank` added, `/api/jobs` unchanged externally). Deploy and verify Conference Matcher still works end-to-end.
2. Rename `apps/matcher/` directory → `apps/semops/`, update env vars, deploy. Single deploy step; keep `MATCHER_API_URL` as a back-compat fallback for one release.
3. Land digest schema migration + API routes + settings UI (behind a feature flag if desired, but the feature is opt-in by nature — users without config see an empty state).
4. Land `/digest` page UI.
5. Announce to users.

## 13. Testing strategy

- **Semops unit:** `SemanticOperators.rank` with a synthetic candidate list + stub `LM` that records calls; assert it builds the right prompt and parses responses.
- **Semops regression:** at least one end-to-end test of `/api/jobs` (Conference Matcher) after refactor to prove no behavioral drift.
- **Digest service unit:** `lib/services/digest/section-generator.ts` with a mocked semops HTTP client and a seeded WeChat DB fixture — assert pool assembly, cap at 30, dedupe, and correct `DigestItem` construction.
- **Digest API integration:** `POST /api/digest/generate` → poll → `GET /api/digest` returns the expected shape. At least three cases: happy path, empty pool (asserts `EMPTY` status), and one section fails while another succeeds.
- **UI smoke:** Playwright script that logs in as a seeded user with prefilled config, clicks generate, waits for completion, snapshots the Magazine layout.

## 14. Known tensions & deferrals

- **Joint-query vs per-query ranking.** v1 concatenates enabled queries into one semops call. If a user's queries are genuinely diverse ("LLM agents" + "扩散模型" + "RAG"), one joint rank may over-concentrate on whichever direction the ranker finds strongest. If this shows up in real usage, split into N semops calls (one per query), then merge with round-robin dedupe. The data model (`matchedQueries: string[]` per item) is already shaped for that.
- **Embedding model mismatch.** `wechat_article_embeddings` uses BGE-M3 (1024d). Digest must compute query embeddings with the same model. If BGE-M3 inference isn't already a Node-accessible endpoint in the app, surface an explicit env/service dependency in the plan.
- **LOTUS per-request model config** (§10.3). Highest implementation risk; could need a small upstream LOTUS workaround.
- **BYOK-less users.** Admins fall back to env keys; non-admins must BYOK. This matches existing behavior elsewhere, but we should make sure `/digest`'s empty state explicitly surfaces that when relevant.

---

*Brainstormed via the Superpowers brainstorming flow on 2026-04-21. Design approved by user interactively. Stored under `docs/superpowers/specs/` (gitignored per project CLAUDE.md rule 4).*
