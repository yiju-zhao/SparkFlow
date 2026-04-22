# Explore Feature Design

**Date:** 2026-02-04
**Status:** Approved
**Project:** SparkFlow

---

## Overview

Create an **Explore** section parallel to DeepDive for browsing conference data (publications, sessions). Migrates and refactors the conference exploration feature from deepsight-django to SparkFlow.

### Goals
- Browse conferences, publications, and sessions with simple filters
- View stats and charts for knowledge base overview
- Integrate with DeepDive via "Add to Notebook" feature
- Follow Vercel/Next.js best practices

---

## Data Model (Prisma Schema)

```prisma
// ============ CONFERENCE DOMAIN ============

model Venue {
  id          String     @id @default(cuid())
  name        String     @unique
  type        String?    // e.g., "conference", "journal", "workshop"
  description String?

  instances   Instance[]

  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
}

model Instance {
  id          String        @id @default(cuid())
  venueId     String
  venue       Venue         @relation(fields: [venueId], references: [id])

  year        Int
  name        String        // e.g., "CVPR 2024"
  startDate   DateTime?
  endDate     DateTime?
  location    String?
  website     String?
  summary     String?       @db.Text

  publications Publication[]
  sessions     Session[]

  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@unique([venueId, year])
  @@index([year])
}

model Publication {
  id            String    @id @default(cuid())
  instanceId    String
  instance      Instance  @relation(fields: [instanceId], references: [id])

  title         String
  authors       String[]  // JSON array: ["Alice Smith", "Bob Jones"]
  abstract      String?   @db.Text
  summary       String?   @db.Text

  affiliations  String[]  // JSON array
  countries     String[]  // JSON array
  keywords      String[]  // JSON array
  researchTopic String?

  rating        Float?
  doi           String?
  pdfUrl        String?
  githubUrl     String?
  websiteUrl    String?

  sessions      SessionPublication[]

  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  @@index([instanceId])
  @@index([researchTopic])
}

model Session {
  id          String    @id @default(cuid())
  instanceId  String
  instance    Instance  @relation(fields: [instanceId], references: [id])

  title       String
  type        String?   // e.g., "oral", "poster", "keynote", "workshop"
  date        DateTime?
  startTime   String?   // "09:00"
  endTime     String?   // "10:30"
  location    String?
  speaker     String?

  abstract    String?   @db.Text
  overview    String?   @db.Text
  transcript  String?   @db.Text

  publications SessionPublication[]

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([instanceId])
  @@index([type])
}

// Many-to-many join table
model SessionPublication {
  sessionId     String
  session       Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  publicationId String
  publication   Publication @relation(fields: [publicationId], references: [id], onDelete: Cascade)

  presentationOrder Int?    // Order within session

  @@id([sessionId, publicationId])
}
```

### Key Design Decisions
- Arrays use PostgreSQL native arrays (`String[]`) for efficient querying
- `SessionPublication` join table allows optional many-to-many with presentation order
- Authors/affiliations stay as string arrays (deduplication is complex, not the focus)
- Indexes on frequently filtered fields (instanceId, researchTopic, type, year)

---

## Route Structure

```
apps/web/app/
├── explore/
│   ├── page.tsx                    # Hub - global stats & quick access
│   ├── layout.tsx                  # Shared layout (header, nav)
│   │
│   ├── conferences/
│   │   ├── page.tsx                # Conference browser (card grid)
│   │   └── [id]/
│   │       └── page.tsx            # Conference detail (hero + tabs)
│   │
│   ├── publications/
│   │   ├── page.tsx                # Publications browser (table)
│   │   └── [id]/
│   │       └── page.tsx            # Publication detail
│   │
│   └── sessions/
│       ├── page.tsx                # Sessions browser (table)
│       └── [id]/
│           └── page.tsx            # Session detail
```

### Page Descriptions

| Route | Purpose | Content |
|-------|---------|---------|
| `/explore` | Hub | Global KPIs, trend chart, top topics, quick access cards |
| `/explore/conferences` | Browser | Card grid with venue/year filters |
| `/explore/conferences/[id]` | Detail | Hero + Overview/Content tabs |
| `/explore/publications` | Browser | Table with conference/year/topic filters |
| `/explore/publications/[id]` | Detail | Full details + "Add to Notebook" |
| `/explore/sessions` | Browser | Table with conference/year/type filters |
| `/explore/sessions/[id]` | Detail | Session info + related publications |

---

## Component Architecture

```
apps/web/components/
├── explore/
│   ├── hub/
│   │   ├── global-stats.tsx        # KPI cards
│   │   ├── year-trend-chart.tsx    # Publications by year
│   │   ├── topics-chart.tsx        # Top research topics
│   │   └── quick-access-cards.tsx  # Navigation cards
│   │
│   ├── conferences/
│   │   ├── conference-grid.tsx     # Card grid with filters
│   │   ├── conference-card.tsx     # Single conference card
│   │   ├── conference-hero.tsx     # Detail page header
│   │   ├── conference-stats.tsx    # KPIs for single conference
│   │   └── conference-charts.tsx   # Charts for single conference
│   │
│   ├── publications/
│   │   ├── publications-table.tsx  # Table with columns, sorting
│   │   ├── publication-row.tsx     # Single table row
│   │   ├── publication-detail.tsx  # Full detail view
│   │   └── publication-filters.tsx # Filter controls
│   │
│   ├── sessions/
│   │   ├── sessions-table.tsx      # Table view
│   │   ├── session-detail.tsx      # Full detail view
│   │   └── session-filters.tsx     # Filter controls
│   │
│   └── shared/
│       ├── entity-table.tsx        # Reusable table with pagination
│       ├── filter-bar.tsx          # Reusable filter controls
│       ├── stats-card.tsx          # Single KPI card
│       ├── empty-state.tsx         # "No results" display
│       └── add-to-notebook.tsx     # DeepDive integration button
```

---

## Data Fetching (Vercel Best Practices)

### Pattern: Server Components + React.cache() + Promise.all()

```typescript
// lib/explore/queries.ts
import { cache } from 'react'
import { prisma } from '@/lib/prisma'

// All queries wrapped with cache() for request deduplication
export const getGlobalStats = cache(async () => {
  const [conferences, publications, sessions] = await Promise.all([
    prisma.instance.count(),
    prisma.publication.count(),
    prisma.session.count()
  ])
  return { conferences, publications, sessions }
})

export const getPublications = cache(async (filters: PublicationFilters) => {
  const where = buildPublicationWhere(filters)

  // Parallel count + data fetch
  const [data, total] = await Promise.all([
    prisma.publication.findMany({
      where,
      select: {  // Only select needed fields (server-serialization)
        id: true,
        title: true,
        authors: true,
        rating: true,
        researchTopic: true,
        instance: { select: { name: true, year: true } }
      },
      skip: filters.page * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.publication.count({ where })
  ])

  return { data, total }
})
```

### Page Example with Suspense

```typescript
// app/explore/conferences/[id]/page.tsx
import { Suspense } from 'react'
import { cache } from 'react'
import dynamic from 'next/dynamic'

// Lazy load heavy chart component (bundle-dynamic-imports)
const ConferenceCharts = dynamic(
  () => import('@/components/explore/conferences/conference-charts'),
  { loading: () => <ChartSkeleton /> }
)

// Cache queries for deduplication (server-cache-react)
const getConference = cache(async (id: string) => {
  return prisma.instance.findUnique({
    where: { id },
    include: { venue: true }
  })
})

const getConferenceStats = cache(async (id: string) => {
  const [pubCount, sessionCount, topTopics] = await Promise.all([
    prisma.publication.count({ where: { instanceId: id } }),
    prisma.session.count({ where: { instanceId: id } }),
    getTopTopics(id)
  ])
  return { pubCount, sessionCount, topTopics }
})

export default async function ConferenceDetailPage({ params }) {
  const { id } = await params

  // Parallel fetch (async-parallel)
  const [conference, stats] = await Promise.all([
    getConference(id),
    getConferenceStats(id)
  ])

  return (
    <div>
      <ConferenceHero conference={conference} stats={stats} />

      {/* Suspense for streaming (async-suspense-boundaries) */}
      <Suspense fallback={<ChartSkeleton />}>
        <ConferenceCharts conferenceId={id} />
      </Suspense>

      <Suspense fallback={<TableSkeleton />}>
        <ConferenceContent conferenceId={id} />
      </Suspense>
    </div>
  )
}
```

---

## Filter System (URL State)

### Filter Schemas (Zod)

```typescript
// lib/explore/filters.ts
import { z } from 'zod'

export const publicationFiltersSchema = z.object({
  year: z.coerce.number().optional(),
  conference: z.string().optional(),
  topic: z.string().optional(),
  sortBy: z.enum(['rating', 'title', 'year']).default('rating'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().default(0)
})

export const sessionFiltersSchema = z.object({
  year: z.coerce.number().optional(),
  conference: z.string().optional(),
  type: z.string().optional(),
  sortBy: z.enum(['date', 'title']).default('date'),
  sortDir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().default(0)
})

export const conferenceFiltersSchema = z.object({
  venue: z.string().optional(),
  yearFrom: z.coerce.number().optional(),
  yearTo: z.coerce.number().optional()
})
```

### Filter Bar Component (useTransition)

```typescript
// components/explore/shared/filter-bar.tsx
'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'

export function FilterBar({ filters, options }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams)
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.set('page', '0')  // Reset page on filter change

    // Use transition for non-blocking UI (rerender-transitions)
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  return (
    <div className={isPending ? 'opacity-70' : ''}>
      {/* Filter dropdowns using Shadcn Select */}
    </div>
  )
}
```

---

## DeepDive Integration

### "Add to Notebook" Component

```typescript
// components/explore/shared/add-to-notebook.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface AddToNotebookProps {
  publication: {
    id: string
    title: string
    pdfUrl?: string | null
  }
}

export function AddToNotebook({ publication }: AddToNotebookProps) {
  const [open, setOpen] = useState(false)
  const [notebooks, setNotebooks] = useState([])
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const hasPdf = Boolean(publication.pdfUrl)

  const handleOpen = async () => {
    setOpen(true)
    const res = await fetch('/api/notebooks')
    setNotebooks(await res.json())
  }

  const handleAdd = async (notebookId: string) => {
    setLoading(true)

    // Pass PDF URL - existing pipeline fetches & processes
    await fetch(`/api/notebooks/${notebookId}/sources`, {
      method: 'POST',
      body: JSON.stringify({
        title: publication.title,
        sourceType: 'DOCUMENT',
        url: publication.pdfUrl
      })
    })

    setOpen(false)
    router.push(`/deepdive/${notebookId}`)
  }

  return (
    <>
      <Button
        onClick={handleOpen}
        variant="outline"
        disabled={!hasPdf}
        title={!hasPdf ? 'No PDF available' : undefined}
      >
        Add to Notebook
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>Select Notebook</DialogHeader>
          <div className="space-y-2">
            {notebooks.map(nb => (
              <Button
                key={nb.id}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => handleAdd(nb.id)}
                disabled={loading}
              >
                {nb.name}
              </Button>
            ))}
          </div>
          <Button variant="secondary">
            + Create New Notebook
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

---

## Performance Optimizations

### 1. Next.js Config (optimizePackageImports)

```javascript
// next.config.js
module.exports = {
  experimental: {
    optimizePackageImports: ['recharts', 'lucide-react']
  }
}
```

### 2. LRU Cache for Hot Data

```typescript
// lib/explore/cache.ts
import { LRUCache } from 'lru-cache'

export const filterOptionsCache = new LRUCache<string, FilterOptions>({
  max: 100,
  ttl: 5 * 60 * 1000  // 5 minutes
})

export async function getFilterOptions(): Promise<FilterOptions> {
  const cached = filterOptionsCache.get('options')
  if (cached) return cached

  const options = await fetchFilterOptionsFromDB()
  filterOptionsCache.set('options', options)
  return options
}
```

### 3. Analytics with after()

```typescript
// In page components
import { after } from 'next/server'

export default async function PublicationsPage({ searchParams }) {
  after(() => {
    trackPageView('/explore/publications', searchParams)
  })

  // ... rest of component
}
```

---

## Loading & Error Handling

### Loading States (Skeletons)

```typescript
// app/explore/publications/loading.tsx
import { Skeleton } from '@/components/ui/skeleton'

export default function PublicationsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    </div>
  )
}
```

### Error Boundaries

```typescript
// app/explore/publications/error.tsx
'use client'

import { Button } from '@/components/ui/button'

export default function PublicationsError({
  error,
  reset
}: {
  error: Error
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground mt-2">Failed to load publications</p>
      <Button onClick={reset} className="mt-4">Try again</Button>
    </div>
  )
}
```

### Not Found

```typescript
// app/explore/publications/[id]/page.tsx
import { notFound } from 'next/navigation'

export default async function PublicationDetailPage({ params }) {
  const { id } = await params
  const publication = await getPublication(id)

  if (!publication) {
    notFound()
  }

  return <PublicationDetail publication={publication} />
}
```

---

## Implementation Phases

### Phase 1: Foundation
- Add Prisma schema models
- Run migration
- Create seed script or migration script from deepsight-django
- Add next.config.js optimizations

### Phase 2: Core Pages
- `/explore` hub with global stats
- `/explore/conferences` list + `/explore/conferences/[id]` detail
- Shared components: stats-card, filter-bar, entity-table, empty-state

### Phase 3: Entity Pages
- `/explore/publications` list + `/explore/publications/[id]` detail
- `/explore/sessions` list + `/explore/sessions/[id]` detail
- Filter system with URL state

### Phase 4: Charts & Visualizations
- Install Recharts
- Year trend chart, topics chart, rating distribution
- Conference-specific charts

### Phase 5: Integration
- "Add to Notebook" feature
- Navigation links from sidebar
- Shared layout/header updates

### Phase 6: Polish
- Loading skeletons for all pages
- Error boundaries
- Empty states
- Responsive design tweaks

---

## Vercel Best Practices Checklist

| Rule | Implementation | Status |
|------|----------------|--------|
| `async-parallel` | Promise.all() for parallel fetching | ✅ |
| `async-suspense-boundaries` | Suspense for charts/tables | ✅ |
| `server-cache-react` | React.cache() on all queries | ✅ |
| `server-serialization` | Prisma select for minimal fields | ✅ |
| `server-parallel-fetching` | Component composition | ✅ |
| `bundle-dynamic-imports` | next/dynamic for charts | ✅ |
| `bundle-barrel-imports` | optimizePackageImports config | ✅ |
| `rerender-transitions` | useTransition for filters | ✅ |
| `server-cache-lru` | LRU cache for filter options | ✅ |
| `server-after-nonblocking` | after() for analytics | ✅ |
