-- Atomic single-flight: at most one PENDING/PROCESSING matcher job per
-- user. Catches the race the application-level findFirst+create check
-- can't (two tabs both passing the read, both spawning LOTUS jobs,
-- both burning BYOK tokens). Prisma's @@unique can't represent a
-- partial index, so this lives as raw SQL.
--
-- Existing rows in PENDING/PROCESSING per user are tolerated (the
-- unique constraint is built CONCURRENTLY-friendly here for safety in
-- prod — small tables get a near-instant index, large ones avoid
-- locking writers). If two rows already exist for one user, this
-- migration fails fast and a manual cleanup is required first.
CREATE UNIQUE INDEX "match_jobs_user_inflight_unique"
ON "match_jobs" ("userId")
WHERE "status" IN ('PENDING', 'PROCESSING');
