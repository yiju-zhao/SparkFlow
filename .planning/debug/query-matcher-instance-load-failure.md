---
status: awaiting_human_verify
trigger: "fail to load instance when using the query matcher"
created: 2026-03-04T00:00:00Z
updated: 2026-03-04T00:05:00Z
---

## Current Focus

hypothesis: Root cause confirmed - API endpoint was missing, now created
test: TypeScript compilation passed with no errors
expecting: Instances should load in browser when accessing query matcher
next_action: Awaiting human verification in browser

## Symptoms

expected: Query matcher should load instance data when user accesses the tool
actual: Instance fails to load
errors: Unknown - user did not provide specific error messages (likely a 404 or network error in console)
reproduction: User accesses /explore/toolbox/matcher and proceeds to step 2 (Config step)
started: Unknown - likely since the matcher was created

## Eliminated

<!-- None yet -->

## Evidence

- timestamp: 2026-03-04T00:00:00Z
  checked: apps/web/app/explore/toolbox/matcher/components/steps/config-step.tsx
  found: ConfigStep fetches instances from `/api/explore/instances` on line 53
  implication: This endpoint must exist for the component to work

- timestamp: 2026-03-04T00:00:00Z
  checked: apps/web/app/api directory structure
  found: No `/api/explore/` directory or routes exist
  implication: The API endpoint is missing - this is the root cause

- timestamp: 2026-03-04T00:00:00Z
  checked: prisma/schema.prisma
  found: Instance model exists with id, name, year, venueId, and venue relation
  implication: Database model is properly defined, just need an API to fetch instances

- timestamp: 2026-03-04T00:02:00Z
  checked: TypeScript compilation (npx tsc --noEmit)
  found: No errors - the new API route compiles correctly
  implication: Fix is syntactically correct and type-safe

## Resolution

root_cause: Missing API endpoint `/api/explore/instances` - the ConfigStep component tries to fetch conference instances from this endpoint but it doesn't exist
fix: Created the missing API route at apps/web/app/api/explore/instances/route.ts with GET handler that fetches instances with venue info from Prisma
verification: TypeScript compilation passed; human verification needed to confirm instances load in browser
files_changed: [apps/web/app/api/explore/instances/route.ts]
