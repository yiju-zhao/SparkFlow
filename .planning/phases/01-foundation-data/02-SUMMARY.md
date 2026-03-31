---
phase: 01-foundation-data
plan: 02
subsystem: admin-ui
tags: [admin, crud, venues, instances, sessions, server-actions]
dependency_graph:
  requires: []
  provides: [admin-crud-ui, server-actions-admin]
  affects: [data-curation-workflow]
tech_stack:
  added: []
  patterns: [server-actions, use-transition, dialog-form-pattern]
key_files:
  created:
    - apps/web/lib/actions/admin.ts
    - apps/web/app/admin/layout.tsx
    - apps/web/app/admin/page.tsx
    - apps/web/app/admin/venues/page.tsx
    - apps/web/app/admin/venues/components/venue-form.tsx
    - apps/web/app/admin/instances/page.tsx
    - apps/web/app/admin/instances/components/instance-form.tsx
    - apps/web/app/admin/sessions/page.tsx
    - apps/web/app/admin/sessions/components/session-form.tsx
  modified: []
decisions:
  - key: native-select-for-dropdowns
    summary: Used native HTML select for venue/instance dropdowns instead of Shadcn Select to keep forms simple and avoid extra dependencies
  - key: comma-separated-arrays
    summary: String[] fields (speaker, topic, affiliation, technology) use comma-separated text inputs that split/join on submit/load
metrics:
  duration: 263s
  completed_date: 2026-03-05
  tasks_completed: 5
  files_created: 9
  files_modified: 0
---

# Phase 1 Plan 2: Admin Curation UI Summary

**One-liner:** Admin CRUD UI for Venue, Instance, and ConferenceSession with server actions, list tables, and create/edit dialogs using Shadcn/UI components.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create admin server actions | 79b6ef1 | apps/web/lib/actions/admin.ts |
| 2 | Create admin layout and dashboard | dd7e01c | apps/web/app/admin/layout.tsx, page.tsx |
| 3 | Create Venue management UI | 1da8171 | admin/venues/page.tsx, venue-form.tsx |
| 4 | Create Instance management UI | 8785e44 | admin/instances/page.tsx, instance-form.tsx |
| 5 | Create Session management UI | 0c1bdc8 | admin/sessions/page.tsx, session-form.tsx |

## What Was Built

### Server Actions (admin.ts)

Full CRUD operations for all three conference entities:
- `getVenues/createVenue/updateVenue/deleteVenue` — Venue management
- `getInstances/createInstance/updateInstance/deleteInstance` — Instance management
- `getSessions/createSession/updateSession/deleteSession` — Session management

All actions follow the existing `notebooks.ts` pattern: `auth()` check, prisma operation, `revalidatePath` after mutations.

### Admin Layout

Simple nav bar with links to Dashboard, Venues, Instances, Sessions. No auth gate on the layout itself — server actions handle authorization.

### Admin Dashboard (/admin)

Shows live counts for all three entities via `Promise.all([venue.count(), instance.count(), conferenceSession.count()])`. Each count is a link to the management page.

### Venue Management (/admin/venues)

List table with name, type, instance count, and edit button. "New Venue" button in header. VenueForm handles both create and edit modes via a shared dialog.

### Instance Management (/admin/instances)

List table with venue name, year, instance name, date range, session count, and edit button. InstanceForm includes a venue select dropdown populated from `getVenues()`, native date inputs for start/end dates, and all optional fields.

### Session Management (/admin/sessions)

List table with title, instance label (venue + year), type, date, speakers. SessionForm is the most complex form, covering all ConferenceSession fields. Array fields (speaker, topic, affiliation, technology) use comma-separated text inputs that convert to/from `string[]` on submit/load.

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Native HTML select for venue/instance dropdowns | Simpler than Shadcn Select; avoids extra complexity for internal admin tooling |
| Comma-separated inputs for string[] fields | Straightforward UX for internal admin; no need for tag/chip UI at this stage |
| No delete UI in list tables | Delete is destructive and not in the plan's must-haves; can be added in polish phase |

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED

All 9 files created and verified. All 5 task commits confirmed in git log.
