---
quick-task: 4
title: Fix Query Matcher Excel Input Format + Translation
status: completed
completed-date: 2026-03-05
duration: ~5min
tasks-completed: 2
files-changed: 9
commits:
  - 10013a2: fix(matcher): update excel parser for key/area/query format with translation
  - 9d56606: fix(web/matcher): fix preview step and update UI for key/area/query format
key-files:
  modified:
    - apps/matcher/api/types.py
    - apps/matcher/services/excel_processor.py
    - apps/matcher/api/routes/jobs.py
    - apps/matcher/services/job_runner.py
    - apps/web/lib/matcher/types.ts
    - apps/web/app/explore/toolbox/matcher/components/steps/preview-step.tsx
    - apps/web/app/explore/toolbox/matcher/components/query-preview-table.tsx
    - apps/web/app/explore/toolbox/matcher/components/steps/upload-step.tsx
  created:
    - apps/web/app/api/matcher/parse/route.ts
---

# Quick Task 4: Fix Query Matcher Excel Input Format + Translation Summary

**One-liner:** Fixed Excel column parser to use positional key/area/query columns, added Xinference-based translation before matching, added /parse preview endpoint, and fixed the broken preview step that was showing empty results.

## What Was Done

### Task 1: Backend fixes (commit 10013a2)

**apps/matcher/api/types.py**
- Updated `ParsedQuery` model: replaced `name`/`content` fields with `key`, `area`, `query`
- Added `ParseFileRequest` model for the new parse endpoint

**apps/matcher/services/excel_processor.py**
- Removed `_detect_columns()` auto-detect logic entirely
- Replaced with positional access: col0=key, col1=area, col2=query using `row.iloc[N]`
- Added `_translate_to_english()` method using OpenAI client pointed at Xinference (`XINFERENCE_BASE_URL`, `XINFERENCE_MODEL`)
- Translation applied to area and query fields; key is never translated
- Added graceful fallback: if translation fails, original text is used with a warning log
- Changed `pd.read_excel(..., header=None)` so no row is consumed as header

**apps/matcher/api/routes/jobs.py**
- Added `POST /api/jobs/parse` endpoint before `create_job`
- Accepts `{ file_key: str }`, returns `ParsedQueriesResponse` with parsed queries
- Imported `ParsedQueriesResponse` and `ParseFileRequest` from types

**apps/matcher/services/job_runner.py**
- Updated query loop: `query.get("key")` as display name, `query.get("area")` and `query.get("query")` for content
- Combines area+query: if area present → `"Area: {area}\n\nQuery: {query}"`, else just query text

### Task 2: Frontend fixes (commit 9d56606)

**apps/web/lib/matcher/types.ts**
- Updated `ParsedQuery` interface: `key`, `area`, `query` instead of `name`/`content`

**apps/web/app/api/matcher/parse/route.ts** (new file)
- POST route accepting `{ fileKey: string }`
- Validates auth session
- Proxies to matcher service `POST /api/jobs/parse`

**apps/web/app/explore/toolbox/matcher/components/steps/preview-step.tsx**
- Fixed `loadQueries()` to call `/api/matcher/parse` with `fileKey`
- Now shows real parsed data from the uploaded file instead of an empty array

**apps/web/app/explore/toolbox/matcher/components/query-preview-table.tsx**
- Updated table: 4 columns (#, Key, Area, Query) instead of 3 (#, Name, Content)
- Updated edit state: `{ key, area, query }` instead of `{ name, content }`
- Area column uses Input (short text); Query column uses Textarea (multi-line)
- Area shows "-" when empty

**apps/web/app/explore/toolbox/matcher/components/steps/upload-step.tsx**
- Updated description text to describe the actual 3-column format with translation note

## Verification

- [x] excel_processor.py reads col0=key, col1=area, col2=query by position
- [x] Translation applied to area and query before returning (key untouched)
- [x] `/api/jobs/parse` endpoint returns JSON with key/area/query fields
- [x] Preview step calls API and shows real parsed data
- [x] job_runner.py combines area+query for pipeline input
- [x] Table shows Key/Area/Query columns
- [x] TypeScript compiles without errors

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

Files verified:
- apps/matcher/api/types.py - FOUND
- apps/matcher/services/excel_processor.py - FOUND
- apps/matcher/api/routes/jobs.py - FOUND
- apps/matcher/services/job_runner.py - FOUND
- apps/web/lib/matcher/types.ts - FOUND
- apps/web/app/api/matcher/parse/route.ts - FOUND
- apps/web/app/explore/toolbox/matcher/components/steps/preview-step.tsx - FOUND
- apps/web/app/explore/toolbox/matcher/components/query-preview-table.tsx - FOUND
- apps/web/app/explore/toolbox/matcher/components/steps/upload-step.tsx - FOUND

Commits verified:
- 10013a2 - FOUND
- 9d56606 - FOUND
