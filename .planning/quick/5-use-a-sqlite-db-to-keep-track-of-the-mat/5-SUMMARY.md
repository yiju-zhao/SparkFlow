---
phase: quick-5
plan: 01
subsystem: matcher
tags: [database, persistence, history, ui]
dependency_graph:
  requires: [MatchJob Prisma model, matcher service API]
  provides: [job persistence, history page, download from history]
  affects: [matcher routes, matcher UI]
tech_stack:
  added: [Prisma MatchJob queries, Server Components]
  patterns: [Database persistence, Server-side data fetching]
key_files:
  created:
    - apps/web/app/explore/toolbox/matcher/history/page.tsx
  modified:
    - apps/web/app/api/matcher/jobs/route.ts
    - apps/web/app/api/matcher/jobs/[jobId]/route.ts
    - apps/web/app/api/matcher/jobs/[jobId]/download/route.ts
    - apps/web/app/explore/toolbox/matcher/page.tsx
decisions:
  - Persist jobs to PostgreSQL using existing MatchJob Prisma model
  - Sync progress from matcher service only when job is PROCESSING
  - Server-side render history page for SEO and performance
metrics:
  duration: 8min
  tasks: 2
  files: 5
  completed_date: 2026-03-06
---

# Quick Task 5: Match Job History Summary

Persist match jobs to database and create history page for users to view past matching jobs and download results.

## One-Liner

Added PostgreSQL persistence for match jobs via Prisma with a server-rendered history page for viewing and downloading past results.

## Changes Made

### Task 1: Persist jobs to database on create and update routes

Modified the job API routes to persist and read from the Prisma database while still syncing with the external matcher service:

- **POST /api/matcher/jobs** - After successfully creating job in matcher service, creates a MatchJob record in Prisma with the returned job ID, storing userId, instanceId, targetType, topK, searchK, includeReasons, queryFileKey, queryData, status, and queryCount
- **GET /api/matcher/jobs** - Queries from database with user ownership check, includes instance relation for display, orders by createdAt desc
- **GET /api/matcher/jobs/[jobId]** - Reads from database first to verify ownership; if job is PROCESSING, fetches progress from matcher service and updates Prisma
- **GET /api/matcher/jobs/[jobId]/download** - Verifies user owns the job via Prisma and checks job status is COMPLETED before streaming from matcher service

### Task 2: Create job history page

Created a server-rendered history page at `/explore/toolbox/matcher/history`:

- Fetches user's jobs server-side via Prisma
- Displays table with columns: Instance (with venue), Target Type, Status, Queries, Matches, Created (relative time), Actions
- Status badges with color coding:
  - PENDING: yellow
  - PROCESSING: blue (shows progress percentage)
  - COMPLETED: green (shows Download button)
  - FAILED: red
  - CANCELLED: gray
- Empty state with "No matching jobs yet" message and link to create new match
- Added "History" link to matcher page header

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

- Created files exist:
  - apps/web/app/explore/toolbox/matcher/history/page.tsx
- Modified files exist:
  - apps/web/app/api/matcher/jobs/route.ts
  - apps/web/app/api/matcher/jobs/[jobId]/route.ts
  - apps/web/app/api/matcher/jobs/[jobId]/download/route.ts
  - apps/web/app/explore/toolbox/matcher/page.tsx
- Type check passes: `npx tsc --noEmit --project apps/web/tsconfig.json`
