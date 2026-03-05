---
status: verifying
trigger: "422 Unprocessable Entity when creating query matcher job - userId is empty string in request payload"
created: 2026-03-05T00:00:00Z
updated: 2026-03-05T00:00:02Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED - The MatcherClient calls matcher service directly instead of using Next.js API route
test: TypeScript compilation to verify no type errors
expecting: Clean compilation
next_action: Request human verification in real workflow

## Symptoms

expected: When user clicks to start query matcher job, a job should be created with the users valid userId
actual: API returns 422 Unprocessable Entity because userId is empty string ""
errors:
- Frontend: Error thrown at lib/matcher/client.ts:36 - error.detail shows [object Object],[object Object]...
- Backend: POST /api/jobs/ returns 422
- Payload shows userId: "" while other fields have valid values
reproduction: User selects instance, uploads query file, configures settings, clicks to start matching job
started: First time trying to create a job

## Eliminated

## Evidence

- timestamp: 2026-03-05T00:00:00Z
  checked: Request payload from user
  found: userId is empty string "" while instanceId, targetType, queryFileKey, searchK, topK all have valid values
  implication: The userId is either not being retrieved from session or not being passed correctly

- timestamp: 2026-03-05T00:00:01Z
  checked: lib/matcher/client.ts:27-31 (createJob method)
  found: createJob calls `${this.baseUrl}/api/jobs` directly (http://localhost:2025/api/jobs)
  implication: Client bypasses Next.js API routes, so no session access

- timestamp: 2026-03-05T00:00:02Z
  checked: matcher-wizard.tsx:75-83
  found: userId: "" hardcoded with comment "Will be set by API from session"
  implication: Developer expected API to set userId, but client calls external service directly

- timestamp: 2026-03-05T00:00:03Z
  checked: app/api/matcher/jobs/route.ts
  found: POST handler properly authenticates via auth(), uses user_id (snake_case), forwards to matcher service
  implication: The proper API route exists and handles auth correctly, but client doesn't use it

- timestamp: 2026-03-05T00:00:04Z
  checked: TypeScript compilation (npx tsc --noEmit)
  found: No errors
  implication: Changes are type-safe

## Resolution

root_cause: MatcherClient.createJob() calls the matcher service directly at http://localhost:2025/api/jobs instead of using the Next.js API route at /api/matcher/jobs. The Next.js route properly authenticates and injects the userId from the session, but the client bypasses it entirely.
fix: |
  1. Changed MatcherClient.createJob to call /api/matcher/jobs instead of direct matcher service URL
  2. Made userId optional in CreateMatchJobInput type since it's injected by the API
  3. Removed the hardcoded userId: "" from matcher-wizard.tsx
verification: TypeScript compilation passes with no errors
files_changed:
  - apps/web/lib/matcher/client.ts
  - apps/web/lib/matcher/types.ts
  - apps/web/app/explore/toolbox/matcher/components/matcher-wizard.tsx
