-- Performance indexes for the Research Hub (/explore) pages.
--
-- Hot queries that previously did a full sequential scan of `publications`:
--   * `_count.publications WHERE status NOT IN ('Reject','Withdrawal')` per
--     conference card (queries.ts: getConferences, getRecentConferences)
--   * `getConferenceStats` raw `unnest()` aggregations filtered by
--     instanceId + status (top affiliations, keywords, countries, etc.)
--   * `getPublications` listing filtered by status / instanceId / topic
--   * Sort-by-rating on the explore page hero ("featured publication")
--
-- All indexes are CREATE INDEX IF NOT EXISTS so re-runs are safe; in
-- production we use `CREATE INDEX CONCURRENTLY` to avoid locking the
-- table for writes during a long build, but Prisma migrations run inside
-- a transaction, so we keep the regular form here. Run during a low-traffic
-- window if the table is large.

-- Publication: filter by status alone (rare but used by `getFilterOptions`)
CREATE INDEX IF NOT EXISTS "publications_status_idx" ON "publications"("status");

-- Publication: composite for "publications of an instance, by status".
-- Drives every conference card count + every stats query in the detail page.
CREATE INDEX IF NOT EXISTS "publications_instanceId_status_idx"
  ON "publications"("instanceId", "status");

-- Publication: composite for the per-instance "top topics" prefetch.
-- Prisma `findMany({ where: { instanceId, researchTopic: { not: null } }, distinct: ['researchTopic'] })`
-- benefits from this exact ordering.
CREATE INDEX IF NOT EXISTS "publications_instanceId_researchTopic_idx"
  ON "publications"("instanceId", "researchTopic");

-- Publication: descending rating for the homepage "featured" sort.
CREATE INDEX IF NOT EXISTS "publications_rating_desc_idx"
  ON "publications"("rating" DESC);

-- ConferenceSession: date ordering for calendar / "upcoming sessions".
CREATE INDEX IF NOT EXISTS "conference_sessions_date_idx"
  ON "conference_sessions"("date");
