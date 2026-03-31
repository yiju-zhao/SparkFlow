---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/app/api/matcher/jobs/route.ts
  - apps/web/app/api/matcher/jobs/[jobId]/route.ts
  - apps/web/app/api/matcher/jobs/[jobId]/download/route.ts
  - apps/web/app/explore/toolbox/matcher/history/page.tsx
  - apps/web/app/explore/toolbox/matcher/page.tsx
autonomous: true
requirements: []
must_haves:
  truths:
    - "User can see a list of their past matching jobs"
    - "User can view details of each job (config, status, timestamps)"
    - "User can download result Excel for completed jobs"
    - "Job data persists across sessions and browser refresh"
  artifacts:
    - path: "apps/web/app/explore/toolbox/matcher/history/page.tsx"
      provides: "Job history list UI"
    - path: "apps/web/app/api/matcher/jobs/route.ts"
      provides: "Job persistence and listing"
      exports: ["POST", "GET"]
  key_links:
    - from: "history/page.tsx"
      to: "/api/matcher/jobs"
      via: "fetch GET"
      pattern: "fetch.*api/matcher/jobs"
    - from: "POST /api/matcher/jobs"
      to: "prisma.matchJob.create"
      via: "database write"
---

<objective>
Persist match jobs to the database and create a history page for users to view past matching jobs and download results.

Purpose: Users need to track their matching history and re-download results without re-running jobs.
Output: Job persistence in PostgreSQL, history page UI, download from history.
</objective>

<execution_context>
@/Users/eason/.claude/get-shit-done/workflows/execute-plan.md
@/Users/eason/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
The MatchJob model already exists in `apps/web/prisma/schema.prisma`. Current API routes proxy to external matcher service without persisting to the database.

Key existing types from `apps/web/lib/matcher/types.ts`:
```typescript
export type MatchJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
export type MatchTargetType = "SESSION" | "PUBLICATION";

export interface MatchJob {
  id: string;
  userId: string;
  instanceId: string;
  targetType: MatchTargetType;
  topK: number;
  searchK: number;
  includeReasons: boolean;
  queryFileKey: string | null;
  queryData: ParsedQuery[] | null;
  resultFileKey: string | null;
  status: MatchJobStatus;
  progress: number;
  errorMessage: string | null;
  queryCount: number;
  matchCount: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}
```

Key Prisma model (already exists):
```prisma
model MatchJob {
  id              String           @id @default(cuid())
  userId          String
  instanceId      String
  targetType      MatchTargetType
  topK            Int              @default(50)
  searchK         Int              @default(350)
  includeReasons  Boolean          @default(true)
  queryFileKey    String
  queryData       Json?
  resultFileKey   String?
  status          MatchJobStatus   @default(PENDING)
  progress        Int              @default(0)
  errorMessage    String?
  queryCount      Int              @default(0)
  matchCount      Int              @default(0)
  createdAt       DateTime         @default(now())
  updatedAt       DateTime         @updatedAt
  startedAt       DateTime?
  completedAt     DateTime?
  instance        Instance         @relation(fields: [instanceId], references: [id], onDelete: Cascade)
  @@index([userId])
  @@index([status])
  @@map("match_jobs")
}
```
</context>

<tasks>

<task type="auto">
  <name>Task 1: Persist jobs to database on create and update routes</name>
  <files>apps/web/app/api/matcher/jobs/route.ts, apps/web/app/api/matcher/jobs/[jobId]/route.ts, apps/web/app/api/matcher/jobs/[jobId]/download/route.ts</files>
  <action>
    Modify the job routes to persist and read from the Prisma database while still syncing with the external matcher service:

    1. **POST /api/matcher/jobs** - After successfully creating job in matcher service:
       - Create a MatchJob record in Prisma with the returned job ID
       - Store userId, instanceId, targetType, topK, searchK, includeReasons, queryFileKey, queryData, status, queryCount
       - Return the Prisma record (not the external service response)

    2. **GET /api/matcher/jobs** - List user's jobs:
       - Query prisma.matchJob.findMany with where: { userId }
       - Order by createdAt desc
       - Return array of jobs with instance name joined (include instance relation)

    3. **GET /api/matcher/jobs/[jobId]** - Get single job:
       - First fetch from Prisma to verify user owns the job
       - If job is PROCESSING, also fetch progress from matcher service and update Prisma
       - Return the Prisma record

    4. **GET /api/matcher/jobs/[jobId]/download** - Download results:
       - Verify user owns the job via Prisma
       - Check job status is COMPLETED and resultFileKey exists
       - Stream from matcher service as currently implemented

    Do NOT change the SSE stream route - it should continue to work as-is for real-time progress.
  </action>
  <verify>
    <automated>npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | grep -E "(matcher|error)" | head -20 || echo "No matcher-related type errors"</automated>
  </verify>
  <done>Jobs persist to database on create, GET routes read from database with user ownership check</done>
</task>

<task type="auto">
  <name>Task 2: Create job history page</name>
  <files>apps/web/app/explore/toolbox/matcher/history/page.tsx, apps/web/app/explore/toolbox/matcher/page.tsx</files>
  <action>
    Create a history page and add navigation link:

    1. **Create apps/web/app/explore/toolbox/matcher/history/page.tsx**:
       - Server component that fetches user's jobs via API (or directly via Prisma)
       - Display table with columns: Instance, Target Type, Status, Queries, Matches, Created, Actions
       - Status badges with colors (PENDING=yellow, PROCESSING=blue, COMPLETED=green, FAILED=red, CANCELLED=gray)
       - Actions column: "Download" button for completed jobs, "View" link to see job details
       - Format dates relative (e.g., "2 hours ago")
       - Empty state with message "No matching jobs yet"
       - Link back to matcher to create new job

    2. **Update apps/web/app/explore/toolbox/matcher/page.tsx**:
       - Add a "History" link/button in the header area that navigates to /explore/toolbox/matcher/history

    Use existing Shadcn/UI components: Table, Badge, Button. Follow the existing page styling (font-mono paths, muted-foreground text).
  </action>
  <verify>
    <automated>npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | grep -E "(history|matcher)" | head -20 || echo "No history/matcher type errors"</automated>
  </verify>
  <done>History page displays past jobs, matcher page has link to history</done>
</task>

</tasks>

<verification>
1. Run `npx prisma generate` to ensure Prisma client is up to date
2. Run `npx tsc --noEmit --project apps/web/tsconfig.json` to verify no type errors
3. Create a new matching job and verify it appears in database and history page
4. Download results from history page for a completed job
</verification>

<success_criteria>
- MatchJob records persist to PostgreSQL when jobs are created
- GET /api/matcher/jobs returns user's job history from database
- History page at /explore/toolbox/matcher/history displays past jobs
- Users can download result Excel files from history page
- Matcher page has navigation link to history
</success_criteria>

<output>
After completion, create `.planning/quick/5-use-a-sqlite-db-to-keep-track-of-the-mat/5-SUMMARY.md`
</output>
