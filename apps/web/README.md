# `apps/web` — SparkFlow frontend

Next.js 16 (App Router, Turbopack) + React 19 + Prisma 7 + CopilotKit. Serves the user-facing UI on port `3001`. Hosts the BullMQ wiki-ingest queue + worker.

For setup, environment vars, and full architecture see the **root `README.md`**. For frontend-specific conventions (Prisma migration workflow, BullMQ wiki-ingest internals, Tailwind 4 patterns, CopilotKit hooks) see **`apps/web/CLAUDE.md`**.

## Layout

```
app/
  [locale]/                # i18n-scoped routes (en, zh)
    (auth)/                # Login / signup
    admin/                 # Admin panel
    deepdive/[id]/         # Per-notebook research workspace
    explore/               # Research Hub
  api/                     # Route handlers
components/{ui,landing,deepdive,explore,settings}/
lib/
  services/wiki-ingest.ts        # Thin client → POST /v1/workflows/wiki/extract
  providers/list-models.ts       # Thin client → POST /v1/workflows/llm/list-models
  queue/{ingest-queue,user-slot,notebook-lock,redis}.ts
  types/graph.ts                 # Knowledge-graph types (shared with Python via JSON)
  crypto.ts                      # BYOK key encryption
  prisma.ts                      # Singleton Prisma client
workers/ingest.ts          # BullMQ wiki-ingest consumer
prisma/                    # Schema + migrations (use `migrate deploy`, never `db push`)
Dockerfile                 # Production image (builder → dev → runner stages)
Dockerfile.worker          # Slim image for `npm run worker:ingest`
```

## Common commands

```bash
npm run dev                # Dev server on :3001 (Turbopack HMR)
npm run worker:ingest      # BullMQ ingest worker (separate process)
npm run build              # Production build
npm run lint               # ESLint
npx tsc --noEmit           # Type check
npx prisma generate        # Regenerate client after schema edits
npx prisma migrate dev --name <what_changed>   # Create + apply migration (dev)
npx prisma migrate deploy                       # Apply pending migrations (prod)
```

**Never run `npx prisma db push`** — the repo is baselined to Prisma Migrate. See `apps/web/CLAUDE.md` for the schema-edit workflow.
