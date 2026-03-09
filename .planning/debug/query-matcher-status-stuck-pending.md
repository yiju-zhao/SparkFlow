---
status: awaiting_human_verify
trigger: "query-matcher-status-stuck-pending"
created: 2026-03-06T00:00:00.000Z
updated: 2026-03-06T00:10:00.000Z
---

## Current Focus

hypothesis: CONFIRMED - GET /api/matcher/jobs/[jobId] only syncs with matcher service when DB status is "PROCESSING", but the DB status is never updated from "PENDING" to "PROCESSING", so the sync never triggers
test: Traced complete data flow from job creation through SSE to completion
expecting: DB should be updated at completion, but the PENDING guard prevents it
next_action: Fix the GET route to also sync when status is PENDING

## Symptoms

expected: When query matching completes, the status should transition from "pending" to "complete" and the UI should reflect the completed state
actual: The status remains "pending" forever even after the matching logic finishes. No errors anywhere.
errors: No visible errors in console or server logs
reproduction: Happens consistently every time a query match run completes
started: Current issue, happens every time

## Eliminated

(none)

## Evidence

- timestamp: 2026-03-06T00:01:00Z
  checked: POST /api/matcher/jobs route (apps/web/app/api/matcher/jobs/route.ts)
  found: Job is created in database with status "PENDING" (line 147). No code ever updates this to "PROCESSING".
  implication: Database always starts and potentially stays at PENDING

- timestamp: 2026-03-06T00:02:00Z
  checked: SSE flow in hooks.ts and client.ts
  found: SSE updates local React state only. When COMPLETED, onComplete fires and calls matcherClient.getJob(jobId) which hits GET /api/matcher/jobs/[jobId]
  implication: The only DB update opportunity is in the GET route

- timestamp: 2026-03-06T00:03:00Z
  checked: GET /api/matcher/jobs/[jobId] route (line 47)
  found: Condition is `if (job.status === "PROCESSING")` - only syncs when DB status is PROCESSING. But DB status is PENDING (never updated from initial value). So the sync block is skipped entirely.
  implication: ROOT CAUSE - The PENDING status is never updated because the sync only runs for PROCESSING status

- timestamp: 2026-03-06T00:04:00Z
  checked: History page (apps/web/app/explore/toolbox/matcher/history/page.tsx)
  found: Reads directly from database. Since DB is never updated, it always shows PENDING.
  implication: Confirms user-reported symptom

## Resolution

root_cause: In GET /api/matcher/jobs/[jobId]/route.ts, the progress sync with the matcher service only runs when `job.status === "PROCESSING"`. However, the job is created in the DB with status "PENDING" and nothing ever transitions it to "PROCESSING". When the SSE completion triggers `getJob()`, the DB status is still PENDING, so the sync is skipped and the DB is never updated to COMPLETED.
fix: Changed the sync condition in GET /api/matcher/jobs/[jobId]/route.ts from `job.status === "PROCESSING"` to `job.status === "PENDING" || job.status === "PROCESSING"`. Also added `resultFileKey` and `startedAt` to the database update so all fields are properly synced.
verification: Code compiles, change is minimal and type-safe. Awaiting human verification of end-to-end flow.
files_changed: [apps/web/app/api/matcher/jobs/[jobId]/route.ts]
