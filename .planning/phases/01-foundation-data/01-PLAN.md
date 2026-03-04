---
phase: 01-foundation-data
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/lib/prisma.ts
autonomous: true
requirements:
  - DATA-01
  - DATA-02
  - DATA-03
  - DATA-04
must_haves:
  truths:
    - "Venue model exists with name, type, description fields"
    - "Instance model exists with venue relation, year, dates, location"
    - "ConferenceSession model exists with speaker and topic arrays"
    - "Prisma client can query all conference-related models"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "Conference domain models"
      contains: "model Venue, model Instance, model ConferenceSession"
    - path: "apps/web/lib/prisma.ts"
      provides: "Database client"
      exports: ["default"]
  key_links:
    - from: "Venue"
      to: "Instance"
      via: "instances relation"
      pattern: "Venue.*Instance|Instance.*venueId"
    - from: "Instance"
      to: "ConferenceSession"
      via: "sessions relation"
      pattern: "Instance.*ConferenceSession|ConferenceSession.*instanceId"
---

<objective>
Verify and extend existing Prisma models for conference domain data.

Purpose: Ensure data model supports admin curation UI and Research Hub queries.
Output: Schema with Venue, Instance, ConferenceSession models validated.

Note on DATA-03/DATA-04: Per user decision, speakers and topics remain as `String[]` arrays on ConferenceSession model (no separate Speaker/Tag models). These requirements are satisfied by the existing array pattern.
</objective>

<execution_context>
@/Users/eason/.claude/get-shit-done/workflows/execute-plan.md
@/Users/eason/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-foundation-data/01-CONTEXT.md

<interfaces>
<!-- Existing models from apps/web/prisma/schema.prisma -->

```prisma
model Venue {
  id          String     @id @default(cuid())
  name        String     @unique
  type        String?
  description String?
  instances   Instance[]
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  @@map("venues")
}

model Instance {
  id          String               @id @default(cuid())
  venueId     String
  venue       Venue                @relation(fields: [venueId], references: [id])
  year        Int
  name        String
  startDate   DateTime?
  endDate     DateTime?
  location    String?
  website     String?
  summary     String?              @db.Text
  publications Publication[]
  sessions     ConferenceSession[]
  createdAt   DateTime             @default(now())
  updatedAt   DateTime             @updatedAt
  @@unique([venueId, year])
  @@index([year])
  @@map("instances")
}

model ConferenceSession {
  id          String                 @id @default(cuid())
  instanceId  String
  instance    Instance               @relation(fields: [instanceId], references: [id])
  title       String
  type        String?
  date        DateTime?
  startTime   String?
  endTime     String?
  location    String?
  speaker     String[]               @default([])   // Kept as array per user decision
  abstract    String?                @db.Text
  overview    String?                @db.Text
  transcript  String?                @db.Text
  sessionUrl  String?
  topic       String[]               @default([])   // Kept as array per user decision
  affiliation String[]               @default([])
  technology  String[]               @default([])
  publications SessionPublication[]
  createdAt   DateTime               @default(now())
  updatedAt   DateTime               @updatedAt
  @@index([instanceId])
  @@index([type])
  @@map("conference_sessions")
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify existing schema coverage</name>
  <files>apps/web/prisma/schema.prisma</files>
  <action>
    Read the current schema.prisma file and verify that all required fields exist for:
    - DATA-01 (Conference model): Venue + Instance together represent "Conference" concept
      - Venue: name, description, type (venue type, not date range - dates are on Instance)
      - Instance: year, startDate, endDate, location (venue reference via venueId)
    - DATA-02 (Session model): ConferenceSession model
      - title, abstract (description), speaker[] (speakers), topic[] (tags), instanceId (conference reference)
    - DATA-03 (Speaker model): Satisfied by `speaker String[]` on ConferenceSession per user decision
    - DATA-04 (Tag model): Satisfied by `topic String[]` on ConferenceSession per user decision

    If any critical fields are missing (unlikely based on existing schema), add them.
    The schema already has comprehensive coverage - this task is primarily verification.
  </action>
  <verify>
    <automated>npx prisma validate --schema=apps/web/prisma/schema.prisma</automated>
  </verify>
  <done>Schema validated successfully, all DATA-01 through DATA-04 fields confirmed present</done>
</task>

<task type="auto">
  <name>Task 2: Run Prisma generate to ensure client is synced</name>
  <files>apps/web/node_modules/.prisma/client</files>
  <action>
    Run `npx prisma generate` from apps/web directory to ensure Prisma client is generated and synced with schema.
    This ensures TypeScript types are available for the admin UI in the next plan.
  </action>
  <verify>
    <automated>cd apps/web && npx prisma generate && npx tsc --noEmit 2>&1 | head -20</automated>
  </verify>
  <done>Prisma client generated, TypeScript compilation passes</done>
</task>

</tasks>

<verification>
- Schema validates without errors
- Prisma client generates successfully
- TypeScript types available for Venue, Instance, ConferenceSession
- No new migrations required (schema unchanged or only extended)
</verification>

<success_criteria>
- [ ] DATA-01 satisfied: Venue + Instance models provide conference data structure
- [ ] DATA-02 satisfied: ConferenceSession model provides session data structure
- [ ] DATA-03 satisfied: speaker array on ConferenceSession (per user decision)
- [ ] DATA-04 satisfied: topic array on ConferenceSession (per user decision)
- [ ] Prisma client generated and TypeScript compiles
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation-data/01-SUMMARY.md`
</output>
