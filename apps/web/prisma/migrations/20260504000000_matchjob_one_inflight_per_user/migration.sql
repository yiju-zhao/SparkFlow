-- Atomic single-flight: at most one PENDING/PROCESSING matcher job per
-- user. Catches the race the application-level findFirst+create check
-- can't (two tabs both passing the read, both spawning LOTUS jobs,
-- both burning BYOK tokens). Prisma's @@unique can't represent a
-- partial index, so this lives as raw SQL.

-- Step 1: pre-clean any duplicates that violate the new constraint.
-- The application-level findFirst+create gate was racy, so it's
-- possible for a single user to have multiple PENDING/PROCESSING
-- rows in the DB at deploy time. Without this cleanup the
-- CREATE UNIQUE INDEX below fails with 23505 and the entire
-- migration aborts (P3018), blocking all subsequent deploys.
--
-- Heuristic: keep the most recent inflight row per user, FAIL the
-- rest. The most recent is the one the user is likely watching; the
-- older ones are abandoned by the new wizard's force-redirect to
-- the latest job anyway. Idempotent — the WHERE clause matches
-- nothing on a fresh DB.
UPDATE "match_jobs" AS m1
SET
  "status" = 'FAILED',
  "errorMessage" = 'Migration cleanup: only one inflight matcher job per user is allowed.',
  "completedAt" = NOW(),
  "updatedAt" = NOW()
WHERE
  m1."status" IN ('PENDING', 'PROCESSING')
  AND EXISTS (
    SELECT 1 FROM "match_jobs" AS m2
    WHERE m2."userId" = m1."userId"
      AND m2."status" IN ('PENDING', 'PROCESSING')
      AND (m2."createdAt" > m1."createdAt"
           OR (m2."createdAt" = m1."createdAt" AND m2."id" > m1."id"))
  );

-- Step 2: now safe to create the partial unique index.
CREATE UNIQUE INDEX "match_jobs_user_inflight_unique"
ON "match_jobs" ("userId")
WHERE "status" IN ('PENDING', 'PROCESSING');
