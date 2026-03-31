---
status: resolved
trigger: "422 Unprocessable Entity when creating query matcher job - userId is empty string in request payload"
created: 2026-03-05T00:00:00Z
updated: 2026-03-06T00:00:00Z
resolved: 2026-03-06T00:00:00Z
---

## Resolution

**Root Cause:** The matcher service was on a different server and couldn't access S3 to read the uploaded query file. The architecture required the matcher to fetch files from S3, creating unnecessary coupling.

**Fix:** Changed architecture to send parsed queries directly from frontend instead of file key. This eliminates S3 dependency for input files.

## Changes Made

### Backend (Matcher Service)
- `apps/matcher/api/types.py`: Added `ParsedQueryInput` model and made `queries` field optional in `CreateMatchJobRequest`
- `apps/matcher/api/routes/jobs.py`: Updated `create_job` to accept `queries` directly, skip file parsing if queries provided

### Frontend (Next.js)
- `apps/web/lib/matcher/types.ts`: Added `queries` field to `CreateMatchJobInput`, made `queryFileKey` optional
- `apps/web/app/api/matcher/jobs/route.ts`: Updated transform to handle nested objects/arrays for queries
- `apps/web/app/explore/toolbox/matcher/components/matcher-wizard.tsx`: Pass `state.queries` to `createJob` instead of `queryFileKey`
- Removed corrupted `apps/web/app/api/matcher/data/route.ts`

## New Architecture

```
Frontend → parses Excel client-side
Frontend → sends parsed queries directly to /api/matcher/jobs
Next.js API → adds userId from session, forwards to matcher
Matcher → processes queries (no S3 access needed for input)
```

## Verification
- TypeScript compilation: PASSED
- User needs to test in browser
