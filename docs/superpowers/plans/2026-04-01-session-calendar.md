# Session Calendar View & Detail Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat session list on conference pages with a calendar-style view (date tabs, hourly time slots, color-coded types, horizontal scrolling), and optimize the session detail page to display all schema fields.

**Architecture:** Pure client-side calendar component receives all sessions from a server-fetched query. Date tabs filter sessions per day, sessions are grouped by start hour, and multiple sessions in the same hour scroll horizontally. Session detail page gets expanded to show all ConferenceSession schema fields.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, Radix Tabs, Prisma 7, TypeScript 5

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/lib/explore/types.ts` | Modify | Add `CalendarSessionItem`, expand `SessionDetail` |
| `apps/web/lib/explore/queries.ts` | Modify | Add `getConferenceSessions`, expand `getSession` select |
| `apps/web/components/explore/conferences/session-calendar.tsx` | Create | Client component: date tabs, time slots, session cards, color logic |
| `apps/web/app/[locale]/explore/conferences/[id]/page.tsx` | Modify | Replace `SessionsSection` with server data fetch + `SessionCalendar` |
| `apps/web/app/[locale]/explore/sessions/[id]/page.tsx` | Modify | Display all schema fields, fix speaker rendering |
| `apps/web/components/explore/conferences/index.ts` | Modify | Re-export `SessionCalendar` |

---

### Task 1: Expand Data Types

**Files:**
- Modify: `apps/web/lib/explore/types.ts`

- [ ] **Step 1: Add `CalendarSessionItem` type and expand `SessionDetail`**

Open `apps/web/lib/explore/types.ts`. Add the `CalendarSessionItem` interface after the existing `SessionListItem` (line 143), and expand `SessionDetail` with missing fields.

```typescript
// Add after SessionListItem (line 143):

export interface CalendarSessionItem {
  id: string;
  title: string;
  type: string | null;
  date: Date | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  speaker: string[];
  sessionUrl: string | null;
}
```

Update `SessionDetail` (lines 145-160) to add the missing fields. The full replacement:

```typescript
export interface SessionDetail {
  id: string;
  title: string;
  type: string | null;
  date: Date | null;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  speaker: string[];
  abstract: string | null;
  overview: string | null;
  transcript: string | null;
  sessionUrl: string | null;
  topic: string[];
  affiliation: string[];
  technology: string[];
  sessionFormat: "IN_PERSON" | "VIRTUAL" | "BOTH" | null;
  hasRecording: boolean;
  intendedAudience: string | null;
  instance: { id: string; name: string; year: number; venue: { name: string } };
  publications: { id: string; title: string; authors: string[] }[];
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors related to `CalendarSessionItem` or `SessionDetail` (existing errors may exist elsewhere).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/explore/types.ts
git commit -m "feat(explore): add CalendarSessionItem type and expand SessionDetail"
```

---

### Task 2: Add `getConferenceSessions` Query and Expand `getSession`

**Files:**
- Modify: `apps/web/lib/explore/queries.ts`

- [ ] **Step 1: Add `getConferenceSessions` query**

In `apps/web/lib/explore/queries.ts`, add a new function after the existing `getSessions` function (after line 697). This fetches ALL sessions for a conference (no pagination) with the fields needed for the calendar view:

```typescript
export const getConferenceSessions = cache(
  async (instanceId: string): Promise<CalendarSessionItem[]> => {
    return prisma.conferenceSession.findMany({
      where: { instanceId },
      select: {
        id: true,
        title: true,
        type: true,
        date: true,
        startTime: true,
        endTime: true,
        location: true,
        speaker: true,
        sessionUrl: true,
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
  },
);
```

Add `CalendarSessionItem` to the imports from `./types` at the top of the file.

- [ ] **Step 2: Expand `getSession` Prisma select**

In the existing `getSession` function (starts at line 699), add the missing fields to the `select` object. After `sessionUrl: true,` (line 715), add:

```typescript
        topic: true,
        affiliation: true,
        technology: true,
        sessionFormat: true,
        hasRecording: true,
        intendedAudience: true,
```

- [ ] **Step 3: Verify types compile**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors from query changes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/explore/queries.ts
git commit -m "feat(explore): add getConferenceSessions query and expand getSession fields"
```

---

### Task 3: Create `SessionCalendar` Component

**Files:**
- Create: `apps/web/components/explore/conferences/session-calendar.tsx`

- [ ] **Step 1: Create the SessionCalendar component**

Create `apps/web/components/explore/conferences/session-calendar.tsx` with the following content:

```tsx
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CalendarSessionItem } from "@/lib/explore/types";

// 10-color palette, muted tones, dark-mode compatible
const TYPE_PALETTE = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#a855f7", // purple
];

function buildTypeColorMap(sessions: CalendarSessionItem[]): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  for (const s of sessions) {
    if (s.type && !map.has(s.type)) {
      map.set(s.type, TYPE_PALETTE[idx % TYPE_PALETTE.length]);
      idx++;
    }
  }
  return map;
}

function formatDateTab(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getHourKey(startTime: string | null): string | null {
  if (!startTime) return null;
  // startTime is like "09:00" or "09:30" or "9:00 AM"
  const match = startTime.match(/^(\d{1,2})/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  return `${hour.toString().padStart(2, "0")}:00`;
}

interface SessionCardProps {
  session: CalendarSessionItem;
  color: string;
}

function SessionCard({ session, color }: SessionCardProps) {
  return (
    <div
      className="w-70 shrink-0 rounded-lg bg-card border border-border hover:bg-muted/30 transition-colors"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      <Link
        href={`/explore/sessions/${session.id}`}
        className="block p-3 space-y-2"
      >
        <h4 className="font-medium text-sm leading-snug line-clamp-2">
          {session.title}
        </h4>
        {(session.startTime || session.endTime) && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {session.startTime}
            {session.endTime && ` – ${session.endTime}`}
          </p>
        )}
        {session.location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{session.location}</span>
          </p>
        )}
        {session.speaker.length > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />
            <span className="truncate">
              {session.speaker.slice(0, 2).join(", ")}
              {session.speaker.length > 2 &&
                ` +${session.speaker.length - 2}`}
            </span>
          </p>
        )}
      </Link>
    </div>
  );
}

interface SessionCalendarProps {
  sessions: CalendarSessionItem[];
}

export function SessionCalendar({ sessions }: SessionCalendarProps) {
  const typeColorMap = useMemo(() => buildTypeColorMap(sessions), [sessions]);

  // Group sessions by date string key
  const { dateGroups, dateKeys, unscheduled } = useMemo(() => {
    const groups = new Map<string, CalendarSessionItem[]>();
    const noDate: CalendarSessionItem[] = [];

    for (const s of sessions) {
      if (!s.date) {
        noDate.push(s);
        continue;
      }
      // Normalize to date-only string for grouping
      const d = new Date(s.date);
      const key = d.toISOString().split("T")[0]; // "2026-03-17"
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    // Sort date keys chronologically
    const sortedKeys = Array.from(groups.keys()).sort();

    return { dateGroups: groups, dateKeys: sortedKeys, unscheduled: noDate };
  }, [sessions]);

  const allTabKeys = [
    ...dateKeys,
    ...(unscheduled.length > 0 ? ["unscheduled"] : []),
  ];

  const [activeTab, setActiveTab] = useState(allTabKeys[0] ?? "unscheduled");

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No sessions available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Type color legend */}
      {typeColorMap.size > 0 && (
        <div className="flex flex-wrap gap-3">
          {Array.from(typeColorMap.entries()).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              {type}
            </div>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-transparent rounded-none w-full justify-start h-auto p-0 gap-1 overflow-x-auto flex-nowrap">
          {dateKeys.map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="rounded-none border border-transparent bg-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground px-3 py-1.5 text-sm font-medium shadow-none transition-colors whitespace-nowrap shrink-0"
            >
              {formatDateTab(new Date(key + "T00:00:00"))}
            </TabsTrigger>
          ))}
          {unscheduled.length > 0 && (
            <TabsTrigger
              value="unscheduled"
              className="rounded-none border border-transparent bg-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground px-3 py-1.5 text-sm font-medium shadow-none transition-colors whitespace-nowrap shrink-0"
            >
              Unscheduled
            </TabsTrigger>
          )}
        </TabsList>

        {dateKeys.map((key) => (
          <TabsContent key={key} value={key} className="mt-6">
            <TimeSlotGrid
              sessions={dateGroups.get(key) ?? []}
              typeColorMap={typeColorMap}
            />
          </TabsContent>
        ))}

        {unscheduled.length > 0 && (
          <TabsContent value="unscheduled" className="mt-6">
            <TimeSlotGrid
              sessions={unscheduled}
              typeColorMap={typeColorMap}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

interface TimeSlotGridProps {
  sessions: CalendarSessionItem[];
  typeColorMap: Map<string, string>;
}

function TimeSlotGrid({ sessions, typeColorMap }: TimeSlotGridProps) {
  const { hourGroups, hourKeys, noTime } = useMemo(() => {
    const groups = new Map<string, CalendarSessionItem[]>();
    const other: CalendarSessionItem[] = [];

    for (const s of sessions) {
      const hourKey = getHourKey(s.startTime);
      if (!hourKey) {
        other.push(s);
        continue;
      }
      if (!groups.has(hourKey)) groups.set(hourKey, []);
      groups.get(hourKey)!.push(s);
    }

    const sortedKeys = Array.from(groups.keys()).sort();
    return { hourGroups: groups, hourKeys: sortedKeys, noTime: other };
  }, [sessions]);

  return (
    <div className="space-y-4">
      {hourKeys.map((hour) => (
        <div key={hour} className="flex gap-4">
          <div className="w-16 shrink-0 pt-3 text-sm font-medium text-muted-foreground tabular-nums">
            {hour}
          </div>
          <div className="flex-1 flex gap-3 overflow-x-auto pb-2">
            {(hourGroups.get(hour) ?? []).map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                color={s.type ? typeColorMap.get(s.type) ?? "#71717a" : "#71717a"}
              />
            ))}
          </div>
        </div>
      ))}
      {noTime.length > 0 && (
        <div className="flex gap-4">
          <div className="w-16 shrink-0 pt-3 text-sm font-medium text-muted-foreground">
            Other
          </div>
          <div className="flex-1 flex gap-3 overflow-x-auto pb-2">
            {noTime.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                color={s.type ? typeColorMap.get(s.type) ?? "#71717a" : "#71717a"}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Export from barrel file**

In `apps/web/components/explore/conferences/index.ts`, add:

```typescript
export { SessionCalendar } from "./session-calendar";
```

- [ ] **Step 3: Verify types compile**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/explore/conferences/session-calendar.tsx apps/web/components/explore/conferences/index.ts
git commit -m "feat(explore): create SessionCalendar component with date tabs and time slots"
```

---

### Task 4: Replace SessionsSection on Conference Page

**Files:**
- Modify: `apps/web/app/[locale]/explore/conferences/[id]/page.tsx`

- [ ] **Step 1: Update imports**

Replace the `getSessions` import with `getConferenceSessions`, and add `SessionCalendar` import. In `apps/web/app/[locale]/explore/conferences/[id]/page.tsx`:

Change the imports (lines 5-9) from:
```typescript
import {
  getConference,
  getConferenceStats,
  getSessions,
} from "@/lib/explore/queries";
```
to:
```typescript
import {
  getConference,
  getConferenceStats,
  getConferenceSessions,
} from "@/lib/explore/queries";
```

Also add to the existing imports from conferences:
```typescript
import { ConferenceHero, SessionCalendar } from "@/components/explore/conferences";
```

- [ ] **Step 2: Delete the inline `SessionsSection` component**

Remove the entire `SessionsSection` function (lines 22-110) — it will be fully replaced by `SessionCalendar`.

Also remove the `Badge` import (line 13) since it's only used by `SessionsSection`.

Also remove `getTranslations` from the imports (line 4) and `Link` (line 3) if no longer used — check usage first. `getTranslations` is still used in the page component for tab labels, so keep it. `Link` is no longer used after removing `SessionsSection`, so remove it.

- [ ] **Step 3: Replace the sessions TabsContent**

Create a new server component to fetch and render the calendar. Replace the sessions `TabsContent` (lines 167-171):

From:
```tsx
        <TabsContent value="sessions" className="mt-8">
          <Suspense fallback={<ContentSkeleton />}>
            <SessionsSection conferenceId={id} tDetail={tDetail} />
          </Suspense>
        </TabsContent>
```

To:
```tsx
        <TabsContent value="sessions" className="mt-8">
          <Suspense fallback={<ContentSkeleton />}>
            <SessionsCalendarSection conferenceId={id} />
          </Suspense>
        </TabsContent>
```

Add a new server component (above the default export):

```tsx
async function SessionsCalendarSection({ conferenceId }: { conferenceId: string }) {
  const sessions = await getConferenceSessions(conferenceId);
  return <SessionCalendar sessions={sessions} />;
}
```

- [ ] **Step 4: Verify types compile and page renders**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add 'apps/web/app/[locale]/explore/conferences/[id]/page.tsx'
git commit -m "feat(explore): replace session list with SessionCalendar on conference page"
```

---

### Task 5: Optimize Session Detail Page

**Files:**
- Modify: `apps/web/app/[locale]/explore/sessions/[id]/page.tsx`

- [ ] **Step 1: Rewrite the session detail page**

Replace the full content of `apps/web/app/[locale]/explore/sessions/[id]/page.tsx` with:

```tsx
import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/explore/queries";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  ExternalLink,
  Video,
  Monitor,
  Users,
  Globe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SetAIContext } from "@/components/explore/set-ai-context";

interface PageProps {
  params: Promise<{ id: string }>;
}

function FormatBadge({ format }: { format: string }) {
  const config: Record<string, { label: string; icon: React.ReactNode }> = {
    IN_PERSON: { label: "In Person", icon: <Users className="h-3.5 w-3.5" /> },
    VIRTUAL: { label: "Virtual", icon: <Monitor className="h-3.5 w-3.5" /> },
    BOTH: { label: "Hybrid", icon: <Globe className="h-3.5 w-3.5" /> },
  };
  const c = config[format];
  if (!c) return null;
  return (
    <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
      {c.icon}
      {c.label}
    </span>
  );
}

export default async function SessionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <SetAIContext
        context={{
          sessionId: id,
          sessionTitle: session.title,
        }}
      />

      {/* Breadcrumb */}
      <p className="text-sm text-muted-foreground">
        ~/research-hub/sessions/{session.instance.venue.name.toLowerCase()}/
        {session.instance.year}
      </p>

      {/* Title */}
      <h1 className="text-4xl font-bold tracking-tight">{session.title}</h1>

      {/* Metadata pills */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/explore/conferences/${session.instance.id}`}
          className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors"
        >
          {session.instance.venue.name} {session.instance.year}
        </Link>
        {session.type && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            {session.type}
          </span>
        )}
        {session.date && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(session.date).toLocaleDateString()}
          </span>
        )}
        {(session.startTime || session.endTime) && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {session.startTime}
            {session.endTime && ` – ${session.endTime}`}
          </span>
        )}
        {session.location && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {session.location}
          </span>
        )}
        {session.sessionFormat && (
          <FormatBadge format={session.sessionFormat} />
        )}
        {session.intendedAudience && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            {session.intendedAudience}
          </span>
        )}
        {session.hasRecording && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-emerald-600 dark:text-emerald-400">
            <Video className="h-3.5 w-3.5" />
            Recording Available
          </span>
        )}
        {session.sessionUrl && (
          <a
            href={session.sessionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            View Session
          </a>
        )}
      </div>

      {/* Speakers */}
      {session.speaker.length > 0 && (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-wrap gap-2">
            {session.speaker.map((name) => (
              <span
                key={name}
                className="px-2.5 py-1 bg-muted rounded-md text-sm"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {(session.topic.length > 0 ||
        session.technology.length > 0 ||
        session.affiliation.length > 0) && (
        <div className="space-y-3">
          {session.topic.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Topics
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {session.topic.map((t) => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            </div>
          )}
          {session.technology.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Technologies
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {session.technology.map((t) => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            </div>
          )}
          {session.affiliation.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Affiliations
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {session.affiliation.map((a) => (
                  <Badge key={a} variant="secondary">{a}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Abstract */}
      {session.abstract && (
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Abstract</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {session.abstract}
          </p>
        </div>
      )}

      {/* Overview */}
      {session.overview && (
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Overview</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {session.overview}
          </p>
        </div>
      )}

      {/* Transcript */}
      {session.transcript && (
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Transcript</h2>
          <div className="max-h-96 overflow-y-auto">
            <p className="text-muted-foreground whitespace-pre-wrap text-sm">
              {session.transcript}
            </p>
          </div>
        </div>
      )}

      {/* Related Publications */}
      {session.publications.length > 0 && (
        <div className="bg-card rounded-lg">
          <h2 className="text-sm font-semibold p-6 pb-0">
            Related Publications
          </h2>
          <div className="divide-y divide-border mt-3">
            {session.publications.map((pub) => (
              <Link
                key={pub.id}
                href={`/explore/publications/${pub.id}`}
                className="block p-5 hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <h3 className="font-medium">{pub.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {pub.authors.slice(0, 3).join(", ")}
                  {pub.authors.length > 3 && ` +${pub.authors.length - 3} more`}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add 'apps/web/app/[locale]/explore/sessions/[id]/page.tsx'
git commit -m "feat(explore): optimize session detail page with all schema fields"
```

---

### Task 6: Final Build Verification

- [ ] **Step 1: Run full type check**

Run: `cd apps/web && npx tsc --noEmit`

Expected: No errors related to the changed files.

- [ ] **Step 2: Run lint**

Run: `cd apps/web && npm run lint`

Expected: No new lint errors.

- [ ] **Step 3: Test build**

Run: `cd apps/web && npm run build 2>&1 | tail -30`

Expected: Build succeeds.
