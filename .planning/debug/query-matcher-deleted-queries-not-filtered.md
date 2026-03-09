---
status: awaiting_human_verify
trigger: "Queries that are deleted during the query preview stage should not be passed to matcher, but they are currently being sent anyway."
created: 2026-03-06T00:00:00Z
updated: 2026-03-06T00:05:00Z
---

## Current Focus
hypothesis: CONFIRMED - handleStartMatching in matcher-wizard.tsx receives filtered queries but ignores them
test: The _queries parameter is unused; state.queries is used instead
expecting: Fix should use the passed queries parameter instead of state.queries
next_action: Apply minimal fix to use the passed queries parameter

## Symptoms
expected: Deleted queries should be filtered out when submitting to the matcher API. Only non-deleted queries should be sent.
actual: All queries (including deleted ones) are being passed to the matcher API
errors: No errors visible in console or network tab
reproduction: User deletes queries in the query preview stage, then submits to matcher - deleted queries are still processed
started: Recently observed during query matcher workflow testing

## Eliminated
<!-- APPEND only -->

## Evidence
<!-- APPEND only -->
- timestamp: 2026-03-06T00:01:00Z
  checked: apps/web/app/explore/toolbox/matcher/components/query-preview-table.tsx
  found: handleDelete uses filter to remove deleted queries from array and calls onQueriesChange
  implication: QueryPreviewTable correctly filters deleted queries

- timestamp: 2026-03-06T00:02:00Z
  checked: apps/web/app/explore/toolbox/matcher/components/steps/preview-step.tsx
  found: PreviewStep has local state [queries, setQueries]; passes filtered queries to onStart(queries) on line 59
  implication: PreviewStep correctly sends filtered queries to parent

- timestamp: 2026-03-06T00:03:00Z
  checked: apps/web/app/explore/toolbox/matcher/components/matcher-wizard.tsx
  found: handleStartMatching receives _queries parameter but ignores it; uses state.queries instead (line 104)
  implication: ROOT CAUSE - The filtered queries are discarded; original unfiltered state.queries is sent to API

## Resolution
root_cause: In matcher-wizard.tsx, handleStartMatching receives the filtered queries from PreviewStep as a parameter (_queries), but ignores it and uses state.queries instead. state.queries was set during file upload and never updated when users deleted queries in the preview step.
fix: Changed handleStartMatching to use the queries parameter (renamed from _queries) instead of state.queries. Also removed state.queries from the dependency array since it's no longer used.
verification: TypeScript compiles without errors. The fix ensures filtered queries from PreviewStep are passed to createJob.
files_changed: [apps/web/app/explore/toolbox/matcher/components/matcher-wizard.tsx]
