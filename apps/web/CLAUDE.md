# Frontend Conventions (apps/web)

## Project Structure

Follows Next.js 16 App Router conventions with colocation strategy:

```
apps/web/
├── app/                    # App Router - routes map to URL segments
│   ├── (auth)/             # Route group - auth pages share layout, not in URL
│   ├── admin/              # /admin/* - admin panel routes
│   ├── api/                # /api/* - API route handlers
│   ├── deepdive/           # /deepdive/* - notebook routes
│   │   └── [id]/           # Dynamic route: /deepdive/:id
│   ├── explore/            # /explore/* - main feature routes
│   │   ├── publications/   # Static + dynamic routes
│   │   │   └── [id]/       # /explore/publications/:id
│   │   └── sessions/
│   │       └── [id]/
│   ├── layout.tsx          # Root layout (wraps all routes)
│   ├── providers.tsx       # Global providers (theme, session)
│   ├── error.tsx           # Root error boundary
│   └── globals.css         # Global styles
├── components/             # Shared UI components (not routable)
│   ├── ui/                 # shadcn/ui primitives
│   ├── providers/          # Global context providers (theme, auth, CopilotKit)
│   ├── landing/            # Landing page components
│   ├── settings/           # Settings form (model selection, API key management)
│   ├── deepdive/           # Deepdive feature components
│   │   ├── chat/           # Chat panel (CopilotKit integration)
│   │   ├── studio/         # Studio/canvas panel
│   │   ├── wiki/           # Wiki panel, graph-view (force-directed), health-check
│   │   └── sources/        # Source upload and management
│   └── explore/            # Explore feature components
│       ├── toolbox/matcher/ # Query matching UI
│       └── shared/         # Pagination, filters, stats
├── lib/                    # Utilities and clients
│   ├── auth.ts             # NextAuth configuration
│   ├── prisma.ts           # Prisma client singleton
│   ├── crypto.ts           # BYOK key encryption/decryption
│   ├── types/providers.ts  # LLM provider definitions
│   ├── queue/              # BullMQ + Redis primitives (ingest worker)
│   │   ├── redis.ts             # Shared ioredis singleton (lazy getter)
│   │   ├── ingest-queue.ts      # Queue + enqueueWikiIngest + job status helper
│   │   ├── notebook-lock.ts     # Per-notebook mutex with heartbeat (Lua)
│   │   └── user-slot.ts         # Atomic per-user fairness semaphore (Lua)
│   ├── services/           # Backend services
│   │   ├── api-key-resolver.ts  # BYOK key resolution (user → admin fallback)
│   │   ├── wiki-ingest.ts       # Wiki knowledge graph extraction pipeline
│   │   #   (knowledge graph extraction + Louvain clustering moved to apps/agent/workflows/wiki_ingest.py)
│   │   └── wiki-health.ts       # Wiki health monitoring
│   └── hooks/              # Shared React hooks
├── workers/                # Out-of-process workers
│   └── ingest.ts           # BullMQ consumer: wiki-ingest
├── scripts/                # Standalone verification + maintenance scripts
│   └── verify-user-slot.ts # Lua semaphore correctness check
├── Dockerfile              # Next.js production image (builder → dev → runner)
├── Dockerfile.worker       # Minimal image for `npm run worker:ingest`
└── hooks/                  # Global React hooks
```

### Next.js Conventions Used

- **Route groups `()`:** `(auth)` - groups routes without affecting URL
- **Dynamic routes `[]`:** `[id]` - URL params via `params` prop
- **Special files:** `page.tsx` (route), `layout.tsx` (wrapper), `loading.tsx` (suspense), `error.tsx` (error boundary)
- **Colocation:** Components inside route folders are safe - only `page.tsx`/`route.ts` are public

### Deepdive Notebook Layout

The deepdive workspace (`/deepdive/[id]`) is a multi-panel layout:

- **Left**: Sources panel (upload, manage documents)
- **Center**: Chat panel (CopilotKit with LangGraph RAG agent)
- **Right**: Tabbed panel with Wiki (knowledge graph + pages) and Notes

### When to Use Private Folders

Prefix with underscore `_components` or `_lib` inside `app/` for:

- Route-specific utilities that shouldn't be routable
- Avoiding naming conflicts with Next.js special files

## Commands

```bash
npm run dev                       # Start dev server on port 3001
npm run worker:ingest             # Start the BullMQ wiki-ingest worker (its own process)
npm run build                     # Production build
npx prisma generate               # Regenerate client after schema edits
npx prisma migrate dev --name X   # Generate + apply a migration (dev)
npx prisma migrate deploy         # Apply pending migrations (production)
npx prisma migrate status         # Inspect applied/pending migrations

# Standalone verification (requires Redis running)
REDIS_URL=redis://localhost:6379 npx tsx scripts/verify-user-slot.ts
```

## BullMQ Wiki-Ingest Worker

Wiki ingest is long-running (30 s – 2 min) and must survive web-process
restarts, so it runs in its own BullMQ-driven worker process. The Next.js
route `POST /api/notebooks/[id]/sources` calls `enqueueWikiIngest(...)`
and returns immediately with a `jobId`; the worker drains the queue.

- **Entry**: `workers/ingest.ts` — env vars `INGEST_WORKER_CONCURRENCY` (default 4) and `INGEST_PER_USER_CONCURRENCY` (default 2).
- **Queue module**: `lib/queue/ingest-queue.ts` — job id is `nb-{notebookId}-src-{sourceId}` (recent BullMQ rejects custom ids containing `:`); pass `{ force: true }` to drop a stale completed/failed job before re-enqueueing (used by manual retry).
- **Per-user fairness**: `lib/queue/user-slot.ts` uses a single Lua `EVAL` (`ZREMRANGEBYSCORE` + `ZCARD` + `ZADD`) so atomicity holds even when two workers race on the same user. Counter lives in Redis → scales across worker replicas.
- **Per-notebook mutex**: `lib/queue/notebook-lock.ts` uses Redis `SET NX PX` with a 60 s heartbeat that extends TTL to 10 min — the lock survives long LLM runs without ever expiring mid-ingest.
- **Reschedule protocol**: when contention is hit, the worker calls `job.moveToDelayed(...)` and throws BullMQ's `DelayedError` — the reschedule does NOT burn the `attempts: 3` budget.
- **Transactional commit**: `lib/services/wiki-ingest.ts::ingestSourceToWiki` POSTs to `/v1/workflows/wiki/extract` (Python implementation in `apps/agent/workflows/wiki_ingest.py` runs the LLM extraction + Louvain clustering + page generation), then opens one `prisma.$transaction` (`maxWait: 10s, timeout: 60s`) on the response that upserts the graph + every wiki page + deletes orphaned `community-*` slugs + appends the log entry — all-or-nothing.
- **Status endpoint**: `GET /api/notebooks/[id]/ingest/status?jobId=...` returns `{ state, progress, failedReason, result }`; wrapped in a 2 s `Promise.race` so a down Redis fails fast with 503.

## Prisma Migration Workflow

The repo uses **Prisma Migrate** (not `db push`). Migrations live at
`prisma/migrations/`, starting from the `0_init` baseline. Both local and
production DBs have `_prisma_migrations` initialized.

### Editing the schema

1. Edit `prisma/schema.prisma`.
2. `npx prisma migrate dev --name <what_changed>` — generates SQL, applies it
   locally, regenerates the client.
3. **Inspect the generated SQL** at `prisma/migrations/<timestamp>_<name>/migration.sql`.
   - **Column renames**: Prisma writes `DROP COLUMN` + `ADD COLUMN` by default
     (data loss). Hand-edit to `ALTER TABLE "foo" RENAME COLUMN "old" TO "new";`
     before committing, then re-run `migrate dev` to verify.
   - **Destructive changes on non-empty tables**: consider splitting into
     expand → migrate data → contract, across multiple migrations.
4. Commit `prisma/schema.prisma` **and** `prisma/migrations/` together.

### Deploying to production

```bash
git pull
cd apps/web
npm ci
npx prisma generate
npx prisma migrate deploy   # only applies migrations not yet in _prisma_migrations
npm run build
pm2 restart web             # or docker compose restart / systemctl restart
```

`migrate deploy` is safe to re-run: it skips migrations already recorded.

### Rules

- **Never run `db push`** once migrations are baselined — it causes drift.
- **Never edit an already-applied migration file.** To fix a mistake, add a
  new migration that corrects it.
- **Never use `migrate reset`** against production (wipes all data).
- If a migration fails mid-apply in production, `migrate status` will show it
  as `failed`. Fix the DB state manually, then
  `prisma migrate resolve --rolled-back <name>` or `--applied <name>` to
  unblock.

## CopilotKit

- Use `useCopilotChatInternal()` hook for chat state with non-deprecated APIs
- Import `Message` type from `@copilotkit/shared` for type safety
- Create messages with `{ id: uuidv4(), role: "user", content: "..." } as Message` format
- Example:

  ```typescript
  import { useCopilotChatInternal } from "@copilotkit/react-core";
  import type { Message } from "@copilotkit/shared";

  const { messages, sendMessage, reset, isLoading } = useCopilotChatInternal();

  await sendMessage({ id: uuidv4(), role: "user", content: "Hello" } as Message);
  ```

## React Patterns

- Avoid `setState` inside `useEffect` - causes cascading render warnings
- Move state updates to event handlers instead (e.g., `handleClose` function)
- Reset CopilotKit state on panel close: call `reset()`, then `setThreadId(uuidv4())`

## UUID Generation

- Use `import { v4 as uuidv4 } from "uuid"` - NOT `crypto.randomUUID()`
- `crypto.randomUUID()` requires secure context (HTTPS/localhost) and isn't supported in all browsers

## Tailwind 4

- Use standard spacing classes instead of arbitrary pixel values
- Conversion: `px * 0.25 = Tailwind units` (e.g., `max-w-[280px]` → `max-w-70`)
- Common conversions:
  - `w-[180px]` → `w-45`
  - `h-[300px]` → `h-75`
  - `max-h-[420px]` → `max-h-105`
  - `min-h-[300px]` → `min-h-75`

## Wiki Components

- `wiki-panel.tsx` — Main wiki viewer, renders page list + single page content
- `graph-view.tsx` — Force-directed graph using `react-force-graph-2d` + `graphology`; responds to panel resize via ResizeObserver
- `health-check.tsx` — Displays orphan/missing/stale entity counts
- Wiki pages support `[[wiki-links]]` syntax — rendered as clickable links in chat responses

## Commit Messages

- Use conventional commits: `fix(scope): description` or `feat(scope): description`
- Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` footer
