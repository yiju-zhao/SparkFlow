# Quick Task 4: Fix Query Matcher Excel Input Format + Translation

**Created:** 2026-03-05
**Status:** Ready to execute

## Task Description

Fix the query matcher to properly handle the actual Excel input format and add translation of non-key columns to English before matching.

**Excel format:**
- Column 1: `key` — who wants the matching (not translated)
- Column 2: `area` — optional area/domain (may be blank)
- Column 3: `query` — the actual query text

**Goal:** Match `key` to sessions/publications based on `area` + `query`. Translate `area` and `query` to English using the same LLM (Xinference/Qwen3) used in LOTUS before matching.

**Also fix:** The preview step in the wizard never actually fetches parsed queries — it just shows an empty list (TODO left unimplemented).

---

## Tasks

### Task 1: Fix Excel parser to use correct column format + add translation

**File:** `apps/matcher/services/excel_processor.py`

Changes:
- Remove auto-detect column logic
- Use positional columns: col0=key, col1=area, col2=query
- Add `_translate_to_english()` method using Xinference openai-compatible API
- Apply translation to area and query columns (not key) for each row
- Return dicts with `key`, `area`, `query` fields

**File:** `apps/matcher/api/types.py`

Changes:
- Update `ParsedQuery` model: replace `name`/`content` with `key`, `area`, `query`

**File:** `apps/matcher/api/routes/jobs.py`

Changes:
- Add `POST /api/jobs/parse` endpoint: takes `{file_key: str}`, returns `ParsedQueriesResponse`
- This allows preview step to fetch parsed queries without creating a job

**File:** `apps/matcher/services/job_runner.py`

Changes:
- Use `query.get("key")` as display name
- Combine area+query as full query text: if area present → `"Area: {area}\n\nQuery: {query}"` else just `{query}`

---

### Task 2: Fix frontend preview step + update types

**File:** `apps/web/lib/matcher/types.ts`

Changes:
- Update `ParsedQuery` interface: `key`, `area`, `query` instead of `name`/`content`

**File:** `apps/web/app/api/matcher/parse/route.ts` (new file)

Changes:
- POST route: accepts `{ fileKey: string }`, proxies to matcher service `POST /api/jobs/parse`
- Returns parsed queries array

**File:** `apps/web/app/explore/toolbox/matcher/components/steps/preview-step.tsx`

Changes:
- Fix `loadQueries()` to actually call `/api/matcher/parse` with fileKey
- Display real parsed queries instead of empty array

**File:** `apps/web/app/explore/toolbox/matcher/components/query-preview-table.tsx`

Changes:
- Update columns: `#`, `Key`, `Area`, `Query` (instead of `#`, `Name`, `Content`)
- Update edit fields to match new structure

**File:** `apps/web/app/explore/toolbox/matcher/components/steps/upload-step.tsx`

Changes:
- Update description text to match actual format (3 columns: key, area, query)

---

## Verification

- [ ] excel_processor.py correctly reads col0=key, col1=area, col2=query by position
- [ ] Translation is applied to area and query before returning
- [ ] Parse endpoint returns proper JSON with key/area/query fields
- [ ] Preview step shows actual parsed data from the uploaded file
- [ ] job_runner.py correctly combines area+query for the pipeline query text
- [ ] Table shows Key/Area/Query columns in the UI
