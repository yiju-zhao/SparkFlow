---
phase: 01-foundation-data
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/lib/actions/admin.ts
  - apps/web/app/admin/page.tsx
  - apps/web/app/admin/layout.tsx
  - apps/web/app/admin/venues/page.tsx
  - apps/web/app/admin/venues/components/venue-form.tsx
  - apps/web/app/admin/instances/page.tsx
  - apps/web/app/admin/instances/components/instance-form.tsx
  - apps/web/app/admin/sessions/page.tsx
  - apps/web/app/admin/sessions/components/session-form.tsx
autonomous: true
requirements:
  - DATA-05
  - DATA-06
must_haves:
  truths:
    - "Admin can create new venues via form"
    - "Admin can edit existing venues via form"
    - "Admin can create new conference instances via form"
    - "Admin can edit existing instances via form"
    - "Admin can create new sessions via form"
    - "Admin can edit existing sessions via form"
    - "Form submissions persist to database"
  artifacts:
    - path: "apps/web/app/admin/page.tsx"
      provides: "Admin dashboard entry point"
    - path: "apps/web/lib/actions/admin.ts"
      provides: "Server actions for CRUD operations"
      exports: ["createVenue", "updateVenue", "createInstance", "updateInstance", "createSession", "updateSession"]
    - path: "apps/web/app/admin/venues/components/venue-form.tsx"
      provides: "Venue create/edit form"
    - path: "apps/web/app/admin/instances/components/instance-form.tsx"
      provides: "Instance create/edit form"
    - path: "apps/web/app/admin/sessions/components/session-form.tsx"
      provides: "Session create/edit form"
  key_links:
    - from: "venue-form.tsx"
      to: "createVenue/updateVenue actions"
      via: "form onSubmit handler"
      pattern: "startTransition.*createVenue|startTransition.*updateVenue"
    - from: "instance-form.tsx"
      to: "createInstance/updateInstance actions"
      via: "form onSubmit handler"
    - from: "session-form.tsx"
      to: "createSession/updateSession actions"
      via: "form onSubmit handler"
---

<objective>
Create admin curation UI for managing Venue, Instance, and ConferenceSession data.

Purpose: Enable manual data entry and editing of conference content.
Output: /admin routes with CRUD forms for all conference entities.

Design Note: Simple, functional forms - this is internal tooling, not user-facing UI.

Scope Note: This plan has 5 tasks which is at the threshold limit. Accepted as-is because:
1. All tasks are related CRUD operations on similar entities (Venue, Instance, Session)
2. Each task creates 2 files (page + form) following the same pattern
3. Tasks are independent within the plan and can be executed sequentially without context bloat
4. Splitting would create artificial boundaries between tightly coupled UI patterns
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
<!-- Patterns from existing codebase -->

From apps/web/lib/actions/notebooks.ts (server action pattern):
```typescript
"use server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function createNotebook(name: string, description?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const notebook = await prisma.notebook.create({
    data: { name, description, userId: session.user.id },
  });
  revalidatePath("/deepdive");
  return notebook;
}
```

From apps/web/app/deepdive/create-notebook-dialog.tsx (form pattern):
```typescript
"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
// Uses startTransition for server action calls
```

Prisma model fields (from schema):
- Venue: name, type?, description?
- Instance: venueId, year, name, startDate?, endDate?, location?, website?, summary?
- ConferenceSession: instanceId, title, type?, date?, startTime?, endTime?, location?, speaker[], abstract?, overview?, transcript?, sessionUrl?, topic[], affiliation[], technology[]
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create admin server actions</name>
  <files>apps/web/lib/actions/admin.ts</files>
  <action>
    Create server actions file at apps/web/lib/actions/admin.ts with CRUD operations for Venue, Instance, and ConferenceSession.

    Required exports:
    - getVenues(), createVenue(data), updateVenue(id, data), deleteVenue(id)
    - getInstances(), createInstance(data), updateInstance(id, data), deleteInstance(id)
    - getSessions(instanceId?), createSession(data), updateSession(id, data), deleteSession(id)

    Pattern (follow existing notebooks.ts):
    - "use server" directive
    - auth() check with throw new Error("Unauthorized")
    - prisma operations with proper typing
    - revalidatePath after mutations

    Data types (inline or use Prisma types):
    - Venue: { name: string, type?: string, description?: string }
    - Instance: { venueId: string, year: number, name: string, startDate?: Date, endDate?: Date, location?: string, website?: string, summary?: string }
    - ConferenceSession: { instanceId: string, title: string, type?: string, date?: Date, startTime?: string, endTime?: string, location?: string, speaker?: string[], abstract?: string, overview?: string, transcript?: string, sessionUrl?: string, topic?: string[], affiliation?: string[], technology?: string[] }
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit 2>&1 | grep -E "(admin.ts|error)" | head -20</automated>
  </verify>
  <done>Server actions file created with all CRUD operations, TypeScript compiles without errors</done>
</task>

<task type="auto">
  <name>Task 2: Create admin layout and dashboard page</name>
  <files>apps/web/app/admin/layout.tsx, apps/web/app/admin/page.tsx</files>
  <action>
    Create admin section layout and dashboard:

    apps/web/app/admin/layout.tsx:
    - Simple layout with navigation links to /admin/venues, /admin/instances, /admin/sessions
    - Use existing Shadcn/UI navigation patterns
    - No authentication check needed (handled by server actions)

    apps/web/app/admin/page.tsx:
    - Dashboard showing quick stats: venue count, instance count, session count
    - Links to each management section
    - Use prisma.$transaction or Promise.all for counts
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit 2>&1 | grep -E "(admin/)" | head -20</automated>
  </verify>
  <done>Admin layout and dashboard page created, accessible at /admin route</done>
</task>

<task type="auto">
  <name>Task 3: Create Venue management UI</name>
  <files>apps/web/app/admin/venues/page.tsx, apps/web/app/admin/venues/components/venue-form.tsx</files>
  <action>
    Create venue listing and form:

    apps/web/app/admin/venues/page.tsx:
    - Server component that fetches venues with instance count
    - Table display with columns: name, type, instances count, actions
    - "New Venue" button opens dialog
    - Edit button opens dialog with pre-filled data

    apps/web/app/admin/venues/components/venue-form.tsx:
    - Client component with Dialog wrapper
    - Form fields: name (required), type (optional), description (optional textarea)
    - Use react-hook-form with zod validation OR simple useState pattern (follow create-notebook-dialog.tsx)
    - Submit calls createVenue or updateVenue action
    - Use useTransition for loading state
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit 2>&1 | grep -E "(venues)" | head -20</automated>
  </verify>
  <done>Venue list page with create/edit dialogs functional</done>
</task>

<task type="auto">
  <name>Task 4: Create Instance management UI</name>
  <files>apps/web/app/admin/instances/page.tsx, apps/web/app/admin/instances/components/instance-form.tsx</files>
  <action>
    Create instance listing and form:

    apps/web/app/admin/instances/page.tsx:
    - Server component fetching instances with venue name and session count
    - Table: venue name, year, instance name, dates, session count, actions
    - Filter by venue dropdown (optional, can add later)

    apps/web/app/admin/instances/components/instance-form.tsx:
    - Form fields: venue (select dropdown from getVenues()), year (number), name (required), startDate (date picker), endDate (date picker), location (text), website (url), summary (textarea)
    - Use native date input or Shadcn date picker if available
    - Follow same dialog/form pattern as venue-form
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit 2>&1 | grep -E "(instances)" | head -20</automated>
  </verify>
  <done>Instance list page with create/edit dialogs functional</done>
</task>

<task type="auto">
  <name>Task 5: Create Session management UI</name>
  <files>apps/web/app/admin/sessions/page.tsx, apps/web/app/admin/sessions/components/session-form.tsx</files>
  <action>
    Create session listing and form:

    apps/web/app/admin/sessions/page.tsx:
    - Server component fetching sessions with instance/venue info
    - Table: title, instance (venue year), type, date, speakers (joined), actions
    - Filter by instance dropdown

    apps/web/app/admin/sessions/components/session-form.tsx:
    - Form fields:
      - instance (select from getInstances(), required)
      - title (required), type (text), date (date picker)
      - startTime, endTime (time inputs or text)
      - location (text)
      - speakers (comma-separated text input that converts to/from string[])
      - abstract (textarea), overview (textarea), transcript (textarea - large)
      - sessionUrl (url)
      - topics (comma-separated text input)
      - affiliations, technologies (comma-separated text inputs)
    - For string[] fields, use a text input that splits/joins on comma
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit 2>&1 | grep -E "(sessions)" | head -20</automated>
  </verify>
  <done>Session list page with create/edit dialogs functional</done>
</task>

</tasks>

<verification>
- /admin route loads with navigation
- /admin/venues shows venue list with create/edit functionality
- /admin/instances shows instance list with create/edit functionality
- /admin/sessions shows session list with create/edit functionality
- All forms persist data to database correctly
</verification>

<success_criteria>
- [ ] DATA-05 satisfied: Admin can create/edit venues and instances (conference management)
- [ ] DATA-06 satisfied: Admin can create/edit sessions
- [ ] All CRUD operations work via server actions
- [ ] Forms use Shadcn/UI components
- [ ] TypeScript compiles without errors
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation-data/02-SUMMARY.md`
</output>
