# Session Calendar View & Detail Page Redesign

## Summary

Replace the flat session list on the conference detail page with a calendar-style view using date tabs, hourly time slots, and color-coded session types. Also optimize the session detail page to display all schema fields.

## Decisions

| Decision | Choice |
|----------|--------|
| Date tabs | Only dates with sessions (no empty dates) |
| Time slot grouping | By hour (same start hour = same slot) |
| Color assignment | Dynamic per conference from preset palette |
| Multi-session display | Horizontal scrollable row |
| Detail page fields | Show all fields with data; hide empty ones |
| Architecture | Client component with server-fetched data (Approach A) |

## Part 1: SessionCalendar Component

**File:** `components/explore/conferences/session-calendar.tsx` (client component)

### Data Flow

- Server component in conference detail page fetches all sessions via existing `getSessions`
- Full session array passed as props to `SessionCalendar`

### Date Tab Bar

- Extract unique dates from session data, sorted chronologically
- Each date = one tab, format: `Mon, Mar 17`
- Default: first date selected
- Sessions without a `date` field go into a final "Unscheduled" tab
- Built on existing `Tabs` / `TabsTrigger` components

### Time Slot Layout (per date tab)

- Left column (fixed width): hour labels (`09:00`, `10:00`, ...) derived from `startTime` grouped by hour
- Right content area: session cards for that hour, laid out horizontally in an `overflow-x-auto` container
- Sessions without `startTime` go into an "Other" group at the bottom of the timeline

### Session Card

- Fixed width (~280px) to allow multiple cards visible side-by-side
- Left border color bar (4px `border-left`) indicates session type
- Content: title (clickable link to detail page), time range (startTime - endTime), location, speakers (max 2 shown)

### Color Assignment

- Preset palette of 10 muted colors (dark-mode compatible)
- On component init: collect all unique `type` values, assign colors in order of first appearance
- Store as `Map<string, string>`, pass to card rendering
- Display a legend below the tab bar: colored dot + type name for each type present

## Part 2: Session Detail Page

**File:** `app/[locale]/explore/sessions/[id]/page.tsx`

### Page Structure (top to bottom)

1. **Breadcrumb** — existing `~/research-hub/sessions/venue/year` format

2. **Header:**
   - Title (large heading)
   - Metadata pills (flex-wrap row, only shown if data exists):
     - Conference link (existing)
     - Session type (with color dot)
     - Date + Time
     - Location
     - `sessionFormat` badge (IN_PERSON / VIRTUAL / BOTH with icon)
     - `intendedAudience`
     - `hasRecording` ("Recording Available" with video icon)
     - External URL link

3. **Speakers:**
   - Fix current bug: `speaker[]` rendered as array items, not a single concatenated string
   - Comma-separated or individual pills

4. **Tags (three groups, each shown only if non-empty):**
   - Topics (`topic[]`)
   - Technologies (`technology[]`)
   - Affiliations (`affiliation[]`)
   - Each group: small heading + horizontal row of badges

5. **Content sections** (existing card layout):
   - Abstract
   - Overview
   - Transcript (with max-height scroll)

6. **Related Publications** — existing, unchanged

## Part 3: Data Layer Changes

### `SessionListItem` type expansion

Current:
```typescript
{ id, title, type, date, startTime, endTime, sessionUrl, instance }
```

Expanded:
```typescript
{ id, title, type, date, startTime, endTime, location, speaker, sessionUrl, instance }
```

Add `location` and `speaker` to the Prisma select in `getSessions` and update the `SessionListItem` type.

### `SessionDetail` type expansion

Add missing fields to the Prisma select in `getSession` and update the `SessionDetail` type:
- `topic`
- `affiliation`
- `technology`
- `sessionFormat`
- `hasRecording`
- `intendedAudience`

No new queries or API endpoints needed — only expanding existing selects and types.

## Files to Create/Modify

| File | Action |
|------|--------|
| `components/explore/conferences/session-calendar.tsx` | **Create** — new client component |
| `app/[locale]/explore/conferences/[id]/page.tsx` | **Modify** — replace inline `SessionsSection` with `SessionCalendar` |
| `app/[locale]/explore/sessions/[id]/page.tsx` | **Modify** — add missing fields, fix speaker rendering |
| `lib/explore/types.ts` | **Modify** — expand `SessionListItem` and `SessionDetail` |
| `lib/explore/queries.ts` | **Modify** — expand Prisma selects in `getSessions` and `getSession` |
