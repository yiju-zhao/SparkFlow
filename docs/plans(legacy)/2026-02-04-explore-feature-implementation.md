# Explore Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an Explore section for browsing conferences, publications, and sessions with stats, charts, and DeepDive integration.

**Architecture:** Hub + Spoke model with `/explore` as entry point, drill-down to `/explore/conferences`, `/explore/publications`, `/explore/sessions`. Server Components with React.cache() for data fetching, URL-based filter state, dynamic imports for charts.

**Tech Stack:** Next.js 15 (App Router), Prisma 7, PostgreSQL, Recharts, Shadcn/UI, Zod, TanStack Query (client mutations only)

---

## Phase 1: Foundation

### Task 1: Add Prisma Schema Models

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

**Step 1: Add conference domain models to schema**

Add at the end of `schema.prisma`:

```prisma
// ============ CONFERENCE DOMAIN ============

model Venue {
  id          String     @id @default(cuid())
  name        String     @unique
  type        String?
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
  name        String
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
  authors       String[]
  abstract      String?   @db.Text
  summary       String?   @db.Text

  affiliations  String[]
  countries     String[]
  keywords      String[]
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
  type        String?
  date        DateTime?
  startTime   String?
  endTime     String?
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

model SessionPublication {
  sessionId     String
  session       Session     @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  publicationId String
  publication   Publication @relation(fields: [publicationId], references: [id], onDelete: Cascade)

  presentationOrder Int?

  @@id([sessionId, publicationId])
}
```

**Step 2: Generate and run migration**

Run:
```bash
cd apps/web && npx prisma migrate dev --name add_conference_domain
```

Expected: Migration created and applied successfully.

**Step 3: Verify Prisma client generation**

Run:
```bash
cd apps/web && npx prisma generate
```

Expected: Prisma Client generated successfully.

**Step 4: Commit**

```bash
git add apps/web/prisma/
git commit -m "feat(explore): add conference domain models to Prisma schema"
```

---

### Task 2: Add Next.js Config Optimizations

**Files:**
- Modify: `apps/web/next.config.ts` (or `next.config.js`)

**Step 1: Check current next.config structure**

Read the existing config file to understand the structure.

**Step 2: Add optimizePackageImports**

Add to the config:

```typescript
const nextConfig = {
  // ... existing config
  experimental: {
    // ... existing experimental options
    optimizePackageImports: ['recharts', 'lucide-react']
  }
}
```

**Step 3: Verify build still works**

Run:
```bash
cd apps/web && npm run build
```

Expected: Build completes without errors.

**Step 4: Commit**

```bash
git add apps/web/next.config.*
git commit -m "perf(explore): add optimizePackageImports for recharts and lucide-react"
```

---

### Task 3: Install Dependencies

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Install recharts and lru-cache**

Run:
```bash
cd apps/web && npm install recharts lru-cache
```

**Step 2: Verify installation**

Run:
```bash
cd apps/web && npm ls recharts lru-cache
```

Expected: Both packages listed with versions.

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/package-lock.json
git commit -m "feat(explore): add recharts and lru-cache dependencies"
```

---

### Task 4: Create Explore Data Access Layer

**Files:**
- Create: `apps/web/lib/explore/types.ts`
- Create: `apps/web/lib/explore/filters.ts`
- Create: `apps/web/lib/explore/queries.ts`
- Create: `apps/web/lib/explore/cache.ts`

**Step 1: Create types file**

```typescript
// apps/web/lib/explore/types.ts

export interface GlobalStats {
  conferences: number
  publications: number
  sessions: number
  yearsRange: { min: number; max: number } | null
}

export interface ConferenceCard {
  id: string
  name: string
  year: number
  venue: { id: string; name: string }
  publicationCount: number
  sessionCount: number
  topTopics: string[]
}

export interface ConferenceDetail {
  id: string
  name: string
  year: number
  venue: { id: string; name: string; type: string | null }
  startDate: Date | null
  endDate: Date | null
  location: string | null
  website: string | null
  summary: string | null
}

export interface PublicationListItem {
  id: string
  title: string
  authors: string[]
  rating: number | null
  researchTopic: string | null
  instance: { name: string; year: number }
}

export interface PublicationDetail {
  id: string
  title: string
  authors: string[]
  abstract: string | null
  summary: string | null
  affiliations: string[]
  countries: string[]
  keywords: string[]
  researchTopic: string | null
  rating: number | null
  doi: string | null
  pdfUrl: string | null
  githubUrl: string | null
  websiteUrl: string | null
  instance: { id: string; name: string; year: number }
  sessions: { id: string; title: string; type: string | null }[]
}

export interface SessionListItem {
  id: string
  title: string
  type: string | null
  date: Date | null
  startTime: string | null
  endTime: string | null
  instance: { name: string; year: number }
}

export interface SessionDetail {
  id: string
  title: string
  type: string | null
  date: Date | null
  startTime: string | null
  endTime: string | null
  location: string | null
  speaker: string | null
  abstract: string | null
  overview: string | null
  transcript: string | null
  instance: { id: string; name: string; year: number }
  publications: { id: string; title: string; authors: string[] }[]
}

export interface FilterOptions {
  venues: { id: string; name: string }[]
  years: number[]
  topics: string[]
  sessionTypes: string[]
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}
```

**Step 2: Create filters file**

```typescript
// apps/web/lib/explore/filters.ts

import { z } from 'zod'

export const PAGE_SIZE = 20

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

export type PublicationFilters = z.infer<typeof publicationFiltersSchema>
export type SessionFilters = z.infer<typeof sessionFiltersSchema>
export type ConferenceFilters = z.infer<typeof conferenceFiltersSchema>

export function parsePublicationFilters(searchParams: Record<string, string | string[] | undefined>): PublicationFilters {
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') params[key] = value
    else if (Array.isArray(value) && value.length > 0) params[key] = value[0]
  }
  return publicationFiltersSchema.parse(params)
}

export function parseSessionFilters(searchParams: Record<string, string | string[] | undefined>): SessionFilters {
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') params[key] = value
    else if (Array.isArray(value) && value.length > 0) params[key] = value[0]
  }
  return sessionFiltersSchema.parse(params)
}

export function parseConferenceFilters(searchParams: Record<string, string | string[] | undefined>): ConferenceFilters {
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === 'string') params[key] = value
    else if (Array.isArray(value) && value.length > 0) params[key] = value[0]
  }
  return conferenceFiltersSchema.parse(params)
}
```

**Step 3: Create cache file**

```typescript
// apps/web/lib/explore/cache.ts

import { LRUCache } from 'lru-cache'
import type { FilterOptions } from './types'

export const filterOptionsCache = new LRUCache<string, FilterOptions>({
  max: 10,
  ttl: 5 * 60 * 1000 // 5 minutes
})

export const statsCache = new LRUCache<string, unknown>({
  max: 50,
  ttl: 5 * 60 * 1000 // 5 minutes
})
```

**Step 4: Create queries file**

```typescript
// apps/web/lib/explore/queries.ts

import { cache } from 'react'
import { prisma } from '@/lib/prisma'
import { filterOptionsCache, statsCache } from './cache'
import { PAGE_SIZE, type PublicationFilters, type SessionFilters, type ConferenceFilters } from './filters'
import type {
  GlobalStats,
  ConferenceCard,
  ConferenceDetail,
  PublicationListItem,
  PublicationDetail,
  SessionListItem,
  SessionDetail,
  FilterOptions,
  PaginatedResult
} from './types'

// ============ GLOBAL STATS ============

export const getGlobalStats = cache(async (): Promise<GlobalStats> => {
  const cacheKey = 'global-stats'
  const cached = statsCache.get(cacheKey) as GlobalStats | undefined
  if (cached) return cached

  const [conferences, publications, sessions, years] = await Promise.all([
    prisma.instance.count(),
    prisma.publication.count(),
    prisma.session.count(),
    prisma.instance.aggregate({
      _min: { year: true },
      _max: { year: true }
    })
  ])

  const result: GlobalStats = {
    conferences,
    publications,
    sessions,
    yearsRange: years._min.year && years._max.year
      ? { min: years._min.year, max: years._max.year }
      : null
  }

  statsCache.set(cacheKey, result)
  return result
})

// ============ FILTER OPTIONS ============

export const getFilterOptions = cache(async (): Promise<FilterOptions> => {
  const cacheKey = 'filter-options'
  const cached = filterOptionsCache.get(cacheKey)
  if (cached) return cached

  const [venues, years, topics, sessionTypes] = await Promise.all([
    prisma.venue.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    }),
    prisma.instance.findMany({
      select: { year: true },
      distinct: ['year'],
      orderBy: { year: 'desc' }
    }),
    prisma.publication.findMany({
      select: { researchTopic: true },
      distinct: ['researchTopic'],
      where: { researchTopic: { not: null } }
    }),
    prisma.session.findMany({
      select: { type: true },
      distinct: ['type'],
      where: { type: { not: null } }
    })
  ])

  const result: FilterOptions = {
    venues,
    years: years.map(y => y.year),
    topics: topics.map(t => t.researchTopic).filter((t): t is string => t !== null),
    sessionTypes: sessionTypes.map(s => s.type).filter((s): s is string => s !== null)
  }

  filterOptionsCache.set(cacheKey, result)
  return result
})

// ============ CONFERENCES ============

export const getConferences = cache(async (filters: ConferenceFilters): Promise<ConferenceCard[]> => {
  const where: Parameters<typeof prisma.instance.findMany>[0]['where'] = {}

  if (filters.venue) {
    where.venueId = filters.venue
  }
  if (filters.yearFrom) {
    where.year = { ...where.year, gte: filters.yearFrom }
  }
  if (filters.yearTo) {
    where.year = { ...where.year, lte: filters.yearTo }
  }

  const instances = await prisma.instance.findMany({
    where,
    select: {
      id: true,
      name: true,
      year: true,
      venue: { select: { id: true, name: true } },
      _count: {
        select: {
          publications: true,
          sessions: true
        }
      }
    },
    orderBy: [{ year: 'desc' }, { name: 'asc' }]
  })

  // Get top topics for each conference (simplified - just get first 3 unique topics)
  const results: ConferenceCard[] = await Promise.all(
    instances.map(async (inst) => {
      const topTopicsResult = await prisma.publication.findMany({
        where: { instanceId: inst.id, researchTopic: { not: null } },
        select: { researchTopic: true },
        distinct: ['researchTopic'],
        take: 3
      })

      return {
        id: inst.id,
        name: inst.name,
        year: inst.year,
        venue: inst.venue,
        publicationCount: inst._count.publications,
        sessionCount: inst._count.sessions,
        topTopics: topTopicsResult.map(t => t.researchTopic).filter((t): t is string => t !== null)
      }
    })
  )

  return results
})

export const getConference = cache(async (id: string): Promise<ConferenceDetail | null> => {
  const instance = await prisma.instance.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      year: true,
      startDate: true,
      endDate: true,
      location: true,
      website: true,
      summary: true,
      venue: { select: { id: true, name: true, type: true } }
    }
  })

  return instance
})

export const getConferenceStats = cache(async (id: string) => {
  const [pubCount, sessionCount, topTopics, topAffiliations] = await Promise.all([
    prisma.publication.count({ where: { instanceId: id } }),
    prisma.session.count({ where: { instanceId: id } }),
    prisma.publication.groupBy({
      by: ['researchTopic'],
      where: { instanceId: id, researchTopic: { not: null } },
      _count: { researchTopic: true },
      orderBy: { _count: { researchTopic: 'desc' } },
      take: 10
    }),
    prisma.$queryRaw<{ affiliation: string; count: bigint }[]>`
      SELECT unnest(affiliations) as affiliation, COUNT(*) as count
      FROM "Publication"
      WHERE "instanceId" = ${id}
      GROUP BY affiliation
      ORDER BY count DESC
      LIMIT 10
    `
  ])

  return {
    publicationCount: pubCount,
    sessionCount: sessionCount,
    topTopics: topTopics.map(t => ({
      topic: t.researchTopic as string,
      count: t._count.researchTopic
    })),
    topAffiliations: topAffiliations.map(a => ({
      affiliation: a.affiliation,
      count: Number(a.count)
    }))
  }
})

// ============ PUBLICATIONS ============

export const getPublications = cache(async (filters: PublicationFilters): Promise<PaginatedResult<PublicationListItem>> => {
  const where: Parameters<typeof prisma.publication.findMany>[0]['where'] = {}

  if (filters.conference) {
    where.instanceId = filters.conference
  }
  if (filters.year) {
    where.instance = { year: filters.year }
  }
  if (filters.topic) {
    where.researchTopic = filters.topic
  }

  const orderBy: Parameters<typeof prisma.publication.findMany>[0]['orderBy'] = {}
  if (filters.sortBy === 'rating') {
    orderBy.rating = filters.sortDir
  } else if (filters.sortBy === 'title') {
    orderBy.title = filters.sortDir
  } else if (filters.sortBy === 'year') {
    orderBy.instance = { year: filters.sortDir }
  }

  const [data, total] = await Promise.all([
    prisma.publication.findMany({
      where,
      select: {
        id: true,
        title: true,
        authors: true,
        rating: true,
        researchTopic: true,
        instance: { select: { name: true, year: true } }
      },
      orderBy,
      skip: filters.page * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.publication.count({ where })
  ])

  return {
    data,
    total,
    page: filters.page,
    pageSize: PAGE_SIZE
  }
})

export const getPublication = cache(async (id: string): Promise<PublicationDetail | null> => {
  const publication = await prisma.publication.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      authors: true,
      abstract: true,
      summary: true,
      affiliations: true,
      countries: true,
      keywords: true,
      researchTopic: true,
      rating: true,
      doi: true,
      pdfUrl: true,
      githubUrl: true,
      websiteUrl: true,
      instance: { select: { id: true, name: true, year: true } },
      sessions: {
        select: {
          session: { select: { id: true, title: true, type: true } }
        }
      }
    }
  })

  if (!publication) return null

  return {
    ...publication,
    sessions: publication.sessions.map(s => s.session)
  }
})

// ============ SESSIONS ============

export const getSessions = cache(async (filters: SessionFilters): Promise<PaginatedResult<SessionListItem>> => {
  const where: Parameters<typeof prisma.session.findMany>[0]['where'] = {}

  if (filters.conference) {
    where.instanceId = filters.conference
  }
  if (filters.year) {
    where.instance = { year: filters.year }
  }
  if (filters.type) {
    where.type = filters.type
  }

  const orderBy: Parameters<typeof prisma.session.findMany>[0]['orderBy'] = {}
  if (filters.sortBy === 'date') {
    orderBy.date = filters.sortDir
  } else if (filters.sortBy === 'title') {
    orderBy.title = filters.sortDir
  }

  const [data, total] = await Promise.all([
    prisma.session.findMany({
      where,
      select: {
        id: true,
        title: true,
        type: true,
        date: true,
        startTime: true,
        endTime: true,
        instance: { select: { name: true, year: true } }
      },
      orderBy,
      skip: filters.page * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.session.count({ where })
  ])

  return {
    data,
    total,
    page: filters.page,
    pageSize: PAGE_SIZE
  }
})

export const getSession = cache(async (id: string): Promise<SessionDetail | null> => {
  const session = await prisma.session.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      type: true,
      date: true,
      startTime: true,
      endTime: true,
      location: true,
      speaker: true,
      abstract: true,
      overview: true,
      transcript: true,
      instance: { select: { id: true, name: true, year: true } },
      publications: {
        select: {
          publication: { select: { id: true, title: true, authors: true } }
        }
      }
    }
  })

  if (!session) return null

  return {
    ...session,
    publications: session.publications.map(p => p.publication)
  }
})

// ============ CHART DATA ============

export const getYearTrendData = cache(async () => {
  const data = await prisma.instance.findMany({
    select: {
      year: true,
      _count: { select: { publications: true } }
    },
    orderBy: { year: 'asc' }
  })

  // Aggregate by year (in case multiple conferences per year)
  const byYear = new Map<number, number>()
  for (const item of data) {
    byYear.set(item.year, (byYear.get(item.year) || 0) + item._count.publications)
  }

  return Array.from(byYear.entries()).map(([year, count]) => ({
    year,
    publications: count
  }))
})

export const getTopicsChartData = cache(async () => {
  const data = await prisma.publication.groupBy({
    by: ['researchTopic'],
    where: { researchTopic: { not: null } },
    _count: { researchTopic: true },
    orderBy: { _count: { researchTopic: 'desc' } },
    take: 10
  })

  return data.map(item => ({
    topic: item.researchTopic as string,
    count: item._count.researchTopic
  }))
})
```

**Step 5: Commit**

```bash
git add apps/web/lib/explore/
git commit -m "feat(explore): add data access layer with types, filters, queries, and cache"
```

---

## Phase 2: Shared Components

### Task 5: Create Shared UI Components

**Files:**
- Create: `apps/web/components/explore/shared/stats-card.tsx`
- Create: `apps/web/components/explore/shared/filter-bar.tsx`
- Create: `apps/web/components/explore/shared/pagination.tsx`
- Create: `apps/web/components/explore/shared/empty-state.tsx`

**Step 1: Create stats-card component**

```typescript
// apps/web/components/explore/shared/stats-card.tsx

import { Card, CardContent } from '@/components/ui/card'

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon?: React.ReactNode
}

export function StatsCard({ title, value, description, icon }: StatsCardProps) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
            {description && (
              <p className="text-xs text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {icon && (
            <div className="text-muted-foreground">{icon}</div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 2: Create filter-bar component**

```typescript
// apps/web/components/explore/shared/filter-bar.tsx

'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

export interface FilterOption {
  value: string
  label: string
}

export interface FilterConfig {
  key: string
  label: string
  options: FilterOption[]
  placeholder?: string
}

interface FilterBarProps {
  filters: FilterConfig[]
  className?: string
}

export function FilterBar({ filters, className }: FilterBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const updateFilter = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    params.set('page', '0')

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const clearAllFilters = () => {
    startTransition(() => {
      router.push(pathname)
    })
  }

  const hasActiveFilters = filters.some(f => searchParams.has(f.key))

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className} ${isPending ? 'opacity-70' : ''}`}>
      {filters.map((filter) => (
        <Select
          key={filter.key}
          value={searchParams.get(filter.key) || 'all'}
          onValueChange={(value) => updateFilter(filter.key, value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={filter.placeholder || filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All {filter.label}</SelectItem>
            {filter.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="h-10"
        >
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  )
}
```

**Step 3: Create pagination component**

```typescript
// apps/web/components/explore/shared/pagination.tsx

'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalPages: number
  totalItems: number
  pageSize: number
}

export function Pagination({ currentPage, totalPages, totalItems, pageSize }: PaginationProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const goToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', page.toString())

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const startItem = currentPage * pageSize + 1
  const endItem = Math.min((currentPage + 1) * pageSize, totalItems)

  return (
    <div className={`flex items-center justify-between ${isPending ? 'opacity-70' : ''}`}>
      <p className="text-sm text-muted-foreground">
        Showing {startItem}-{endItem} of {totalItems}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage - 1)}
          disabled={currentPage === 0 || isPending}
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>

        <span className="text-sm text-muted-foreground px-2">
          Page {currentPage + 1} of {totalPages}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={() => goToPage(currentPage + 1)}
          disabled={currentPage >= totalPages - 1 || isPending}
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
```

**Step 4: Create empty-state component**

```typescript
// apps/web/components/explore/shared/empty-state.tsx

import { Button } from '@/components/ui/button'
import { FileQuestion } from 'lucide-react'

interface EmptyStateProps {
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
}

export function EmptyState({
  title = 'No results found',
  description = 'Try adjusting your filters',
  action
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 border rounded-lg bg-muted/50">
      <FileQuestion className="h-12 w-12 text-muted-foreground mb-4" />
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground text-sm mt-1">{description}</p>
      {action && (
        <Button onClick={action.onClick} variant="outline" className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  )
}
```

**Step 5: Create index export**

```typescript
// apps/web/components/explore/shared/index.ts

export { StatsCard } from './stats-card'
export { FilterBar, type FilterConfig, type FilterOption } from './filter-bar'
export { Pagination } from './pagination'
export { EmptyState } from './empty-state'
```

**Step 6: Commit**

```bash
git add apps/web/components/explore/
git commit -m "feat(explore): add shared UI components (stats-card, filter-bar, pagination, empty-state)"
```

---

### Task 6: Create Add to Notebook Component

**Files:**
- Create: `apps/web/components/explore/shared/add-to-notebook.tsx`

**Step 1: Create add-to-notebook component**

```typescript
// apps/web/components/explore/shared/add-to-notebook.tsx

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BookPlus, Loader2 } from 'lucide-react'

interface Notebook {
  id: string
  name: string
}

interface AddToNotebookProps {
  publication: {
    id: string
    title: string
    pdfUrl?: string | null
  }
}

export function AddToNotebook({ publication }: AddToNotebookProps) {
  const [open, setOpen] = useState(false)
  const [notebooks, setNotebooks] = useState<Notebook[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchingNotebooks, setFetchingNotebooks] = useState(false)
  const router = useRouter()

  const hasPdf = Boolean(publication.pdfUrl)

  const handleOpen = async (isOpen: boolean) => {
    setOpen(isOpen)
    if (isOpen && notebooks.length === 0) {
      setFetchingNotebooks(true)
      try {
        const res = await fetch('/api/notebooks')
        if (res.ok) {
          const data = await res.json()
          setNotebooks(data)
        }
      } catch (error) {
        console.error('Failed to fetch notebooks:', error)
      } finally {
        setFetchingNotebooks(false)
      }
    }
  }

  const handleAdd = async (notebookId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: publication.title,
          sourceType: 'DOCUMENT',
          url: publication.pdfUrl
        })
      })

      if (res.ok) {
        setOpen(false)
        router.push(`/deepdive/${notebookId}`)
      }
    } catch (error) {
      console.error('Failed to add to notebook:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          disabled={!hasPdf}
          title={!hasPdf ? 'No PDF available for this publication' : 'Add to notebook for research'}
        >
          <BookPlus className="h-4 w-4 mr-2" />
          Add to Notebook
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Notebook</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 mt-4">
          {fetchingNotebooks ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : notebooks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No notebooks found. Create one first in DeepDive.
            </p>
          ) : (
            notebooks.map((nb) => (
              <Button
                key={nb.id}
                variant="ghost"
                className="w-full justify-start"
                onClick={() => handleAdd(nb.id)}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {nb.name}
              </Button>
            ))
          )}
        </div>

        <Button
          variant="secondary"
          className="w-full mt-4"
          onClick={() => router.push('/deepdive')}
        >
          + Create New Notebook
        </Button>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: Add to index export**

Update `apps/web/components/explore/shared/index.ts`:

```typescript
export { StatsCard } from './stats-card'
export { FilterBar, type FilterConfig, type FilterOption } from './filter-bar'
export { Pagination } from './pagination'
export { EmptyState } from './empty-state'
export { AddToNotebook } from './add-to-notebook'
```

**Step 3: Commit**

```bash
git add apps/web/components/explore/
git commit -m "feat(explore): add AddToNotebook component for DeepDive integration"
```

---

## Phase 3: Explore Hub Page

### Task 7: Create Explore Layout

**Files:**
- Create: `apps/web/app/explore/layout.tsx`

**Step 1: Create explore layout**

```typescript
// apps/web/app/explore/layout.tsx

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, Building2, FileText, Calendar } from 'lucide-react'

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center">
          <div className="flex items-center gap-6">
            <Link href="/explore" className="font-semibold">
              Explore
            </Link>

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/explore">
                  <Home className="h-4 w-4 mr-2" />
                  Hub
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/explore/conferences">
                  <Building2 className="h-4 w-4 mr-2" />
                  Conferences
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/explore/publications">
                  <FileText className="h-4 w-4 mr-2" />
                  Publications
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/explore/sessions">
                  <Calendar className="h-4 w-4 mr-2" />
                  Sessions
                </Link>
              </Button>
            </div>
          </div>

          <div className="ml-auto">
            <Button variant="outline" size="sm" asChild>
              <Link href="/deepdive">Back to DeepDive</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="container py-6">
        {children}
      </main>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add apps/web/app/explore/
git commit -m "feat(explore): add explore layout with navigation"
```

---

### Task 8: Create Hub Page Components

**Files:**
- Create: `apps/web/components/explore/hub/global-stats.tsx`
- Create: `apps/web/components/explore/hub/year-trend-chart.tsx`
- Create: `apps/web/components/explore/hub/topics-chart.tsx`
- Create: `apps/web/components/explore/hub/quick-access-cards.tsx`
- Create: `apps/web/components/explore/hub/index.ts`

**Step 1: Create global-stats component**

```typescript
// apps/web/components/explore/hub/global-stats.tsx

import { StatsCard } from '@/components/explore/shared'
import { Building2, FileText, Calendar, TrendingUp } from 'lucide-react'
import type { GlobalStats } from '@/lib/explore/types'

interface GlobalStatsProps {
  stats: GlobalStats
}

export function GlobalStats({ stats }: GlobalStatsProps) {
  const yearsDescription = stats.yearsRange
    ? `${stats.yearsRange.min} - ${stats.yearsRange.max}`
    : 'No data'

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Conferences"
        value={stats.conferences.toLocaleString()}
        icon={<Building2 className="h-8 w-8" />}
      />
      <StatsCard
        title="Publications"
        value={stats.publications.toLocaleString()}
        icon={<FileText className="h-8 w-8" />}
      />
      <StatsCard
        title="Sessions"
        value={stats.sessions.toLocaleString()}
        icon={<Calendar className="h-8 w-8" />}
      />
      <StatsCard
        title="Years Covered"
        value={stats.yearsRange ? stats.yearsRange.max - stats.yearsRange.min + 1 : 0}
        description={yearsDescription}
        icon={<TrendingUp className="h-8 w-8" />}
      />
    </div>
  )
}
```

**Step 2: Create year-trend-chart component**

```typescript
// apps/web/components/explore/hub/year-trend-chart.tsx

'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface YearTrendChartProps {
  data: { year: number; publications: number }[]
}

export function YearTrendChart({ data }: YearTrendChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Publications by Year</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 12 }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Bar
                dataKey="publications"
                fill="hsl(var(--primary))"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 3: Create topics-chart component**

```typescript
// apps/web/components/explore/hub/topics-chart.tsx

'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TopicsChartProps {
  data: { topic: string; count: number }[]
}

export function TopicsChart({ data }: TopicsChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Research Topics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" tick={{ fontSize: 12 }} tickLine={false} />
              <YAxis
                type="category"
                dataKey="topic"
                tick={{ fontSize: 12 }}
                tickLine={false}
                width={150}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--background))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Bar
                dataKey="count"
                fill="hsl(var(--primary))"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
```

**Step 4: Create quick-access-cards component**

```typescript
// apps/web/components/explore/hub/quick-access-cards.tsx

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Building2, FileText, Calendar, ArrowRight } from 'lucide-react'

export function QuickAccessCards() {
  const cards = [
    {
      title: 'Conferences',
      description: 'Browse conferences by venue and year',
      href: '/explore/conferences',
      icon: Building2,
    },
    {
      title: 'Publications',
      description: 'Search papers by topic, author, and more',
      href: '/explore/publications',
      icon: FileText,
    },
    {
      title: 'Sessions',
      description: 'Explore sessions and schedules',
      href: '/explore/sessions',
      icon: Calendar,
    },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.href} className="hover:bg-muted/50 transition-colors">
          <CardHeader>
            <div className="flex items-center gap-3">
              <card.icon className="h-6 w-6 text-primary" />
              <CardTitle className="text-lg">{card.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              {card.description}
            </p>
            <Button variant="outline" size="sm" asChild>
              <Link href={card.href}>
                Browse
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

**Step 5: Create index export**

```typescript
// apps/web/components/explore/hub/index.ts

export { GlobalStats } from './global-stats'
export { YearTrendChart } from './year-trend-chart'
export { TopicsChart } from './topics-chart'
export { QuickAccessCards } from './quick-access-cards'
```

**Step 6: Commit**

```bash
git add apps/web/components/explore/hub/
git commit -m "feat(explore): add hub page components (stats, charts, quick-access)"
```

---

### Task 9: Create Hub Page

**Files:**
- Create: `apps/web/app/explore/page.tsx`
- Create: `apps/web/app/explore/loading.tsx`
- Create: `apps/web/app/explore/error.tsx`

**Step 1: Create hub page**

```typescript
// apps/web/app/explore/page.tsx

import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { getGlobalStats, getYearTrendData, getTopicsChartData } from '@/lib/explore/queries'
import { GlobalStats, QuickAccessCards } from '@/components/explore/hub'
import { Skeleton } from '@/components/ui/skeleton'

// Lazy load chart components
const YearTrendChart = dynamic(
  () => import('@/components/explore/hub/year-trend-chart').then(m => ({ default: m.YearTrendChart })),
  { loading: () => <ChartSkeleton />, ssr: false }
)

const TopicsChart = dynamic(
  () => import('@/components/explore/hub/topics-chart').then(m => ({ default: m.TopicsChart })),
  { loading: () => <ChartSkeleton />, ssr: false }
)

function ChartSkeleton() {
  return (
    <div className="border rounded-lg p-6">
      <Skeleton className="h-6 w-48 mb-4" />
      <Skeleton className="h-[300px] w-full" />
    </div>
  )
}

async function StatsSection() {
  const stats = await getGlobalStats()
  return <GlobalStats stats={stats} />
}

async function ChartsSection() {
  const [yearData, topicsData] = await Promise.all([
    getYearTrendData(),
    getTopicsChartData()
  ])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <YearTrendChart data={yearData} />
      <TopicsChart data={topicsData} />
    </div>
  )
}

export default function ExplorePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Explore</h1>
        <p className="text-muted-foreground mt-2">
          Discover conferences, publications, and sessions in the knowledge base
        </p>
      </div>

      <Suspense fallback={<StatsSkeleton />}>
        <StatsSection />
      </Suspense>

      <Suspense fallback={<ChartsSkeleton />}>
        <ChartsSection />
      </Suspense>

      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Access</h2>
        <QuickAccessCards />
      </div>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[100px]" />
      ))}
    </div>
  )
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartSkeleton />
      <ChartSkeleton />
    </div>
  )
}
```

**Step 2: Create loading state**

```typescript
// apps/web/app/explore/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function ExploreLoading() {
  return (
    <div className="space-y-8">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-96 mt-2" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[100px]" />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-[350px]" />
        ))}
      </div>

      <div>
        <Skeleton className="h-7 w-32 mb-4" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[150px]" />
          ))}
        </div>
      </div>
    </div>
  )
}
```

**Step 3: Create error boundary**

```typescript
// apps/web/app/explore/error.tsx

'use client'

import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function ExploreError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground mt-2 text-center max-w-md">
        Failed to load the Explore page. Please try again.
      </p>
      <Button onClick={reset} className="mt-4">
        Try again
      </Button>
    </div>
  )
}
```

**Step 4: Commit**

```bash
git add apps/web/app/explore/
git commit -m "feat(explore): add hub page with stats and charts"
```

---

## Phase 4: Conference Pages

### Task 10: Create Conference Components

**Files:**
- Create: `apps/web/components/explore/conferences/conference-card.tsx`
- Create: `apps/web/components/explore/conferences/conference-grid.tsx`
- Create: `apps/web/components/explore/conferences/conference-hero.tsx`
- Create: `apps/web/components/explore/conferences/index.ts`

**Step 1: Create conference-card component**

```typescript
// apps/web/components/explore/conferences/conference-card.tsx

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Calendar } from 'lucide-react'
import type { ConferenceCard as ConferenceCardType } from '@/lib/explore/types'

interface ConferenceCardProps {
  conference: ConferenceCardType
}

export function ConferenceCard({ conference }: ConferenceCardProps) {
  return (
    <Link href={`/explore/conferences/${conference.id}`}>
      <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{conference.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{conference.venue.name}</p>
            </div>
            <Badge variant="secondary">{conference.year}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {conference.publicationCount} papers
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {conference.sessionCount} sessions
            </span>
          </div>

          {conference.topTopics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {conference.topTopics.map((topic) => (
                <Badge key={topic} variant="outline" className="text-xs">
                  {topic}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
```

**Step 2: Create conference-grid component**

```typescript
// apps/web/components/explore/conferences/conference-grid.tsx

import { ConferenceCard } from './conference-card'
import { EmptyState } from '@/components/explore/shared'
import type { ConferenceCard as ConferenceCardType } from '@/lib/explore/types'

interface ConferenceGridProps {
  conferences: ConferenceCardType[]
}

export function ConferenceGrid({ conferences }: ConferenceGridProps) {
  if (conferences.length === 0) {
    return (
      <EmptyState
        title="No conferences found"
        description="Try adjusting your filters or check back later"
      />
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {conferences.map((conference) => (
        <ConferenceCard key={conference.id} conference={conference} />
      ))}
    </div>
  )
}
```

**Step 3: Create conference-hero component**

```typescript
// apps/web/components/explore/conferences/conference-hero.tsx

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, MapPin, Globe, FileText } from 'lucide-react'
import type { ConferenceDetail } from '@/lib/explore/types'

interface ConferenceHeroProps {
  conference: ConferenceDetail
  stats: {
    publicationCount: number
    sessionCount: number
  }
}

export function ConferenceHero({ conference, stats }: ConferenceHeroProps) {
  const formatDate = (date: Date | null) => {
    if (!date) return null
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(date))
  }

  const dateRange = conference.startDate && conference.endDate
    ? `${formatDate(conference.startDate)} - ${formatDate(conference.endDate)}`
    : conference.startDate
      ? formatDate(conference.startDate)
      : null

  return (
    <div className="border-b pb-6 mb-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="secondary">{conference.year}</Badge>
            <Badge variant="outline">{conference.venue.name}</Badge>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{conference.name}</h1>
        </div>

        {conference.website && (
          <Button variant="outline" asChild>
            <a href={conference.website} target="_blank" rel="noopener noreferrer">
              <Globe className="h-4 w-4 mr-2" />
              Website
            </a>
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
        {dateRange && (
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {dateRange}
          </span>
        )}
        {conference.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-4 w-4" />
            {conference.location}
          </span>
        )}
        <span className="flex items-center gap-1">
          <FileText className="h-4 w-4" />
          {stats.publicationCount} publications
        </span>
        <span className="flex items-center gap-1">
          <Calendar className="h-4 w-4" />
          {stats.sessionCount} sessions
        </span>
      </div>

      {conference.summary && (
        <p className="mt-4 text-muted-foreground">{conference.summary}</p>
      )}
    </div>
  )
}
```

**Step 4: Create index export**

```typescript
// apps/web/components/explore/conferences/index.ts

export { ConferenceCard } from './conference-card'
export { ConferenceGrid } from './conference-grid'
export { ConferenceHero } from './conference-hero'
```

**Step 5: Commit**

```bash
git add apps/web/components/explore/conferences/
git commit -m "feat(explore): add conference components (card, grid, hero)"
```

---

### Task 11: Create Conference Pages

**Files:**
- Create: `apps/web/app/explore/conferences/page.tsx`
- Create: `apps/web/app/explore/conferences/loading.tsx`
- Create: `apps/web/app/explore/conferences/[id]/page.tsx`
- Create: `apps/web/app/explore/conferences/[id]/loading.tsx`
- Create: `apps/web/app/explore/conferences/[id]/not-found.tsx`

**Step 1: Create conferences list page**

```typescript
// apps/web/app/explore/conferences/page.tsx

import { getConferences, getFilterOptions } from '@/lib/explore/queries'
import { parseConferenceFilters } from '@/lib/explore/filters'
import { ConferenceGrid } from '@/components/explore/conferences'
import { FilterBar, type FilterConfig } from '@/components/explore/shared'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ConferencesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const filters = parseConferenceFilters(params)

  const [conferences, filterOptions] = await Promise.all([
    getConferences(filters),
    getFilterOptions()
  ])

  const filterConfigs: FilterConfig[] = [
    {
      key: 'venue',
      label: 'Venue',
      options: filterOptions.venues.map(v => ({ value: v.id, label: v.name }))
    },
    {
      key: 'yearFrom',
      label: 'From Year',
      options: filterOptions.years.map(y => ({ value: y.toString(), label: y.toString() }))
    },
    {
      key: 'yearTo',
      label: 'To Year',
      options: filterOptions.years.map(y => ({ value: y.toString(), label: y.toString() }))
    }
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Conferences</h1>
        <p className="text-muted-foreground mt-2">
          Browse {conferences.length} conferences
        </p>
      </div>

      <FilterBar filters={filterConfigs} />

      <ConferenceGrid conferences={conferences} />
    </div>
  )
}
```

**Step 2: Create conferences list loading**

```typescript
// apps/web/app/explore/conferences/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function ConferencesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64 mt-2" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-10 w-[180px]" />
        <Skeleton className="h-10 w-[180px]" />
        <Skeleton className="h-10 w-[180px]" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[180px]" />
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Create conference detail page**

```typescript
// apps/web/app/explore/conferences/[id]/page.tsx

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getConference, getConferenceStats, getPublications, getSessions } from '@/lib/explore/queries'
import { ConferenceHero } from '@/components/explore/conferences'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ id: string }>
}

async function PublicationsSection({ conferenceId }: { conferenceId: string }) {
  const result = await getPublications({ conference: conferenceId, page: 0, sortBy: 'rating', sortDir: 'desc' })

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Showing top {result.data.length} of {result.total} publications
      </p>
      <div className="space-y-2">
        {result.data.map((pub) => (
          <Link
            key={pub.id}
            href={`/explore/publications/${pub.id}`}
            className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium">{pub.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {pub.authors.slice(0, 3).join(', ')}
                  {pub.authors.length > 3 && ` +${pub.authors.length - 3} more`}
                </p>
              </div>
              {pub.rating && (
                <Badge variant="secondary">{pub.rating.toFixed(1)}</Badge>
              )}
            </div>
            {pub.researchTopic && (
              <Badge variant="outline" className="mt-2">{pub.researchTopic}</Badge>
            )}
          </Link>
        ))}
      </div>
      <Link
        href={`/explore/publications?conference=${conferenceId}`}
        className="text-sm text-primary hover:underline"
      >
        View all publications →
      </Link>
    </div>
  )
}

async function SessionsSection({ conferenceId }: { conferenceId: string }) {
  const result = await getSessions({ conference: conferenceId, page: 0, sortBy: 'date', sortDir: 'asc' })

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Showing {result.data.length} of {result.total} sessions
      </p>
      <div className="space-y-2">
        {result.data.map((session) => (
          <Link
            key={session.id}
            href={`/explore/sessions/${session.id}`}
            className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{session.title}</h3>
                {session.date && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(session.date).toLocaleDateString()}
                    {session.startTime && ` at ${session.startTime}`}
                  </p>
                )}
              </div>
              {session.type && (
                <Badge variant="outline">{session.type}</Badge>
              )}
            </div>
          </Link>
        ))}
      </div>
      <Link
        href={`/explore/sessions?conference=${conferenceId}`}
        className="text-sm text-primary hover:underline"
      >
        View all sessions →
      </Link>
    </div>
  )
}

export default async function ConferenceDetailPage({ params }: PageProps) {
  const { id } = await params

  const [conference, stats] = await Promise.all([
    getConference(id),
    getConferenceStats(id)
  ])

  if (!conference) {
    notFound()
  }

  return (
    <div>
      <ConferenceHero conference={conference} stats={stats} />

      <Tabs defaultValue="publications">
        <TabsList>
          <TabsTrigger value="publications">Publications</TabsTrigger>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
        </TabsList>

        <TabsContent value="publications" className="mt-6">
          <Suspense fallback={<ContentSkeleton />}>
            <PublicationsSection conferenceId={id} />
          </Suspense>
        </TabsContent>

        <TabsContent value="sessions" className="mt-6">
          <Suspense fallback={<ContentSkeleton />}>
            <SessionsSection conferenceId={id} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function ContentSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-5 w-48" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  )
}
```

**Step 4: Create conference detail loading**

```typescript
// apps/web/app/explore/conferences/[id]/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function ConferenceDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="border-b pb-6">
        <div className="flex gap-2 mb-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-9 w-96" />
        <div className="flex gap-4 mt-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>

      <Skeleton className="h-10 w-64" />

      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  )
}
```

**Step 5: Create not-found page**

```typescript
// apps/web/app/explore/conferences/[id]/not-found.tsx

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Building2 } from 'lucide-react'

export default function ConferenceNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold">Conference not found</h2>
      <p className="text-muted-foreground mt-2">
        This conference may have been removed or doesn't exist.
      </p>
      <Button asChild className="mt-4">
        <Link href="/explore/conferences">Browse all conferences</Link>
      </Button>
    </div>
  )
}
```

**Step 6: Commit**

```bash
git add apps/web/app/explore/conferences/
git commit -m "feat(explore): add conference list and detail pages"
```

---

## Phase 5: Publication & Session Pages

### Task 12: Create Publication Pages

**Files:**
- Create: `apps/web/app/explore/publications/page.tsx`
- Create: `apps/web/app/explore/publications/loading.tsx`
- Create: `apps/web/app/explore/publications/[id]/page.tsx`
- Create: `apps/web/app/explore/publications/[id]/loading.tsx`
- Create: `apps/web/app/explore/publications/[id]/not-found.tsx`

**Step 1: Create publications list page**

```typescript
// apps/web/app/explore/publications/page.tsx

import Link from 'next/link'
import { getPublications, getFilterOptions } from '@/lib/explore/queries'
import { parsePublicationFilters, PAGE_SIZE } from '@/lib/explore/filters'
import { FilterBar, Pagination, EmptyState, type FilterConfig } from '@/components/explore/shared'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PublicationsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const filters = parsePublicationFilters(params)

  const [result, filterOptions] = await Promise.all([
    getPublications(filters),
    getFilterOptions()
  ])

  const filterConfigs: FilterConfig[] = [
    {
      key: 'year',
      label: 'Year',
      options: filterOptions.years.map(y => ({ value: y.toString(), label: y.toString() }))
    },
    {
      key: 'topic',
      label: 'Topic',
      options: filterOptions.topics.map(t => ({ value: t, label: t }))
    }
  ]

  const totalPages = Math.ceil(result.total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Publications</h1>
        <p className="text-muted-foreground mt-2">
          {result.total.toLocaleString()} publications found
        </p>
      </div>

      <FilterBar filters={filterConfigs} />

      {result.data.length === 0 ? (
        <EmptyState
          title="No publications found"
          description="Try adjusting your filters"
        />
      ) : (
        <>
          <div className="space-y-2">
            {result.data.map((pub) => (
              <Link
                key={pub.id}
                href={`/explore/publications/${pub.id}`}
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium">{pub.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {pub.authors.slice(0, 3).join(', ')}
                      {pub.authors.length > 3 && ` +${pub.authors.length - 3} more`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {pub.instance.name} ({pub.instance.year})
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {pub.rating && (
                      <Badge variant="secondary">{pub.rating.toFixed(1)}</Badge>
                    )}
                    {pub.researchTopic && (
                      <Badge variant="outline">{pub.researchTopic}</Badge>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            currentPage={result.page}
            totalPages={totalPages}
            totalItems={result.total}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  )
}
```

**Step 2: Create publications loading**

```typescript
// apps/web/app/explore/publications/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function PublicationsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64 mt-2" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-10 w-[180px]" />
        <Skeleton className="h-10 w-[180px]" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>

      <div className="flex justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-64" />
      </div>
    </div>
  )
}
```

**Step 3: Create publication detail page**

```typescript
// apps/web/app/explore/publications/[id]/page.tsx

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublication } from '@/lib/explore/queries'
import { AddToNotebook } from '@/components/explore/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Github, Globe, ExternalLink, Star, Building2, MapPin, Tag } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PublicationDetailPage({ params }: PageProps) {
  const { id } = await params
  const publication = await getPublication(id)

  if (!publication) {
    notFound()
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary">{publication.instance.year}</Badge>
          <Link href={`/explore/conferences/${publication.instance.id}`}>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
              {publication.instance.name}
            </Badge>
          </Link>
          {publication.rating && (
            <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              <Star className="h-3 w-3 mr-1 fill-current" />
              {publication.rating.toFixed(1)}
            </Badge>
          )}
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-4">{publication.title}</h1>

        <p className="text-muted-foreground">
          {publication.authors.join(', ')}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <AddToNotebook publication={publication} />

        {publication.pdfUrl && (
          <Button variant="outline" asChild>
            <a href={publication.pdfUrl} target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4 mr-2" />
              View PDF
            </a>
          </Button>
        )}

        {publication.githubUrl && (
          <Button variant="outline" asChild>
            <a href={publication.githubUrl} target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4 mr-2" />
              GitHub
            </a>
          </Button>
        )}

        {publication.websiteUrl && (
          <Button variant="outline" asChild>
            <a href={publication.websiteUrl} target="_blank" rel="noopener noreferrer">
              <Globe className="h-4 w-4 mr-2" />
              Website
            </a>
          </Button>
        )}

        {publication.doi && (
          <Button variant="outline" asChild>
            <a href={`https://doi.org/${publication.doi}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              DOI
            </a>
          </Button>
        )}
      </div>

      {/* Abstract */}
      {publication.abstract && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Abstract</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{publication.abstract}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {publication.summary && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{publication.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <div className="grid gap-6 md:grid-cols-2 mb-6">
        {/* Affiliations */}
        {publication.affiliations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Affiliations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {publication.affiliations.map((aff, i) => (
                  <Badge key={i} variant="outline">{aff}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Countries */}
        {publication.countries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Countries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {publication.countries.map((country, i) => (
                  <Badge key={i} variant="outline">{country}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Keywords & Topic */}
      <div className="grid gap-6 md:grid-cols-2 mb-6">
        {publication.keywords.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Keywords
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {publication.keywords.map((kw, i) => (
                  <Badge key={i} variant="secondary">{kw}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {publication.researchTopic && (
          <Card>
            <CardHeader>
              <CardTitle>Research Topic</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge>{publication.researchTopic}</Badge>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Related Sessions */}
      {publication.sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Related Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {publication.sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/explore/sessions/${session.id}`}
                  className="block p-3 border rounded hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{session.title}</span>
                    {session.type && (
                      <Badge variant="outline">{session.type}</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

**Step 4: Create publication detail loading**

```typescript
// apps/web/app/explore/publications/[id]/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function PublicationDetailLoading() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex gap-2 mb-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-5 w-96 mt-4" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-24" />
      </div>

      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />

      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  )
}
```

**Step 5: Create publication not-found**

```typescript
// apps/web/app/explore/publications/[id]/not-found.tsx

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileText } from 'lucide-react'

export default function PublicationNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <FileText className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold">Publication not found</h2>
      <p className="text-muted-foreground mt-2">
        This publication may have been removed or doesn't exist.
      </p>
      <Button asChild className="mt-4">
        <Link href="/explore/publications">Browse all publications</Link>
      </Button>
    </div>
  )
}
```

**Step 6: Commit**

```bash
git add apps/web/app/explore/publications/
git commit -m "feat(explore): add publication list and detail pages"
```

---

### Task 13: Create Session Pages

**Files:**
- Create: `apps/web/app/explore/sessions/page.tsx`
- Create: `apps/web/app/explore/sessions/loading.tsx`
- Create: `apps/web/app/explore/sessions/[id]/page.tsx`
- Create: `apps/web/app/explore/sessions/[id]/loading.tsx`
- Create: `apps/web/app/explore/sessions/[id]/not-found.tsx`

**Step 1: Create sessions list page**

```typescript
// apps/web/app/explore/sessions/page.tsx

import Link from 'next/link'
import { getSessions, getFilterOptions } from '@/lib/explore/queries'
import { parseSessionFilters, PAGE_SIZE } from '@/lib/explore/filters'
import { FilterBar, Pagination, EmptyState, type FilterConfig } from '@/components/explore/shared'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SessionsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const filters = parseSessionFilters(params)

  const [result, filterOptions] = await Promise.all([
    getSessions(filters),
    getFilterOptions()
  ])

  const filterConfigs: FilterConfig[] = [
    {
      key: 'year',
      label: 'Year',
      options: filterOptions.years.map(y => ({ value: y.toString(), label: y.toString() }))
    },
    {
      key: 'type',
      label: 'Type',
      options: filterOptions.sessionTypes.map(t => ({ value: t, label: t }))
    }
  ]

  const totalPages = Math.ceil(result.total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sessions</h1>
        <p className="text-muted-foreground mt-2">
          {result.total.toLocaleString()} sessions found
        </p>
      </div>

      <FilterBar filters={filterConfigs} />

      {result.data.length === 0 ? (
        <EmptyState
          title="No sessions found"
          description="Try adjusting your filters"
        />
      ) : (
        <>
          <div className="space-y-2">
            {result.data.map((session) => (
              <Link
                key={session.id}
                href={`/explore/sessions/${session.id}`}
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{session.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {session.instance.name} ({session.instance.year})
                    </p>
                    {session.date && (
                      <p className="text-sm text-muted-foreground">
                        {new Date(session.date).toLocaleDateString()}
                        {session.startTime && ` at ${session.startTime}`}
                        {session.endTime && ` - ${session.endTime}`}
                      </p>
                    )}
                  </div>
                  {session.type && (
                    <Badge variant="outline">{session.type}</Badge>
                  )}
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            currentPage={result.page}
            totalPages={totalPages}
            totalItems={result.total}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  )
}
```

**Step 2: Create sessions loading**

```typescript
// apps/web/app/explore/sessions/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function SessionsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-5 w-48 mt-2" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-10 w-[180px]" />
        <Skeleton className="h-10 w-[180px]" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>

      <div className="flex justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-64" />
      </div>
    </div>
  )
}
```

**Step 3: Create session detail page**

```typescript
// apps/web/app/explore/sessions/[id]/page.tsx

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/explore/queries'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Clock, MapPin, User } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SessionDetailPage({ params }: PageProps) {
  const { id } = await params
  const session = await getSession(id)

  if (!session) {
    notFound()
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary">{session.instance.year}</Badge>
          <Link href={`/explore/conferences/${session.instance.id}`}>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
              {session.instance.name}
            </Badge>
          </Link>
          {session.type && (
            <Badge>{session.type}</Badge>
          )}
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-4">{session.title}</h1>

        <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
          {session.date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(session.date).toLocaleDateString()}
            </span>
          )}
          {(session.startTime || session.endTime) && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {session.startTime}
              {session.endTime && ` - ${session.endTime}`}
            </span>
          )}
          {session.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {session.location}
            </span>
          )}
          {session.speaker && (
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {session.speaker}
            </span>
          )}
        </div>
      </div>

      {/* Abstract */}
      {session.abstract && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Abstract</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{session.abstract}</p>
          </CardContent>
        </Card>
      )}

      {/* Overview */}
      {session.overview && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{session.overview}</p>
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      {session.transcript && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <p className="text-muted-foreground whitespace-pre-wrap text-sm">{session.transcript}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Related Publications */}
      {session.publications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Related Publications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {session.publications.map((pub) => (
                <Link
                  key={pub.id}
                  href={`/explore/publications/${pub.id}`}
                  className="block p-3 border rounded hover:bg-muted/50 transition-colors"
                >
                  <h3 className="font-medium">{pub.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {pub.authors.slice(0, 3).join(', ')}
                    {pub.authors.length > 3 && ` +${pub.authors.length - 3} more`}
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

**Step 4: Create session detail loading**

```typescript
// apps/web/app/explore/sessions/[id]/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function SessionDetailLoading() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex gap-2 mb-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-4 mt-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>

      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
```

**Step 5: Create session not-found**

```typescript
// apps/web/app/explore/sessions/[id]/not-found.tsx

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Calendar } from 'lucide-react'

export default function SessionNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold">Session not found</h2>
      <p className="text-muted-foreground mt-2">
        This session may have been removed or doesn't exist.
      </p>
      <Button asChild className="mt-4">
        <Link href="/explore/sessions">Browse all sessions</Link>
      </Button>
    </div>
  )
}
```

**Step 6: Commit**

```bash
git add apps/web/app/explore/sessions/
git commit -m "feat(explore): add session list and detail pages"
```

---

## Phase 6: Final Integration

### Task 14: Add Explore Link to Main Navigation

**Files:**
- Modify: Check main app layout or navigation component

**Step 1: Find and update main navigation**

Locate the main app layout or navigation component and add a link to `/explore`. The exact file depends on the existing structure.

**Step 2: Test navigation**

Run:
```bash
cd apps/web && npm run dev
```

Navigate to `/explore` and verify all pages work.

**Step 3: Commit**

```bash
git add .
git commit -m "feat(explore): add explore link to main navigation"
```

---

### Task 15: Create Seed Script (Optional)

**Files:**
- Create: `apps/web/prisma/seed-explore.ts`

**Step 1: Create seed script for test data**

```typescript
// apps/web/prisma/seed-explore.ts

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // Create venues
  const cvpr = await prisma.venue.create({
    data: {
      name: 'CVPR',
      type: 'conference',
      description: 'Conference on Computer Vision and Pattern Recognition'
    }
  })

  const neurips = await prisma.venue.create({
    data: {
      name: 'NeurIPS',
      type: 'conference',
      description: 'Conference on Neural Information Processing Systems'
    }
  })

  // Create instances
  const cvpr2024 = await prisma.instance.create({
    data: {
      venueId: cvpr.id,
      year: 2024,
      name: 'CVPR 2024',
      startDate: new Date('2024-06-17'),
      endDate: new Date('2024-06-21'),
      location: 'Seattle, WA',
      website: 'https://cvpr.thecvf.com/Conferences/2024'
    }
  })

  // Create sample publications
  await prisma.publication.createMany({
    data: [
      {
        instanceId: cvpr2024.id,
        title: 'Vision Transformers for Dense Prediction',
        authors: ['John Doe', 'Jane Smith', 'Bob Wilson'],
        abstract: 'We present a novel approach to dense prediction using vision transformers...',
        affiliations: ['Stanford University', 'Google Research'],
        countries: ['USA'],
        keywords: ['vision transformers', 'dense prediction', 'semantic segmentation'],
        researchTopic: 'Computer Vision',
        rating: 8.5
      },
      {
        instanceId: cvpr2024.id,
        title: 'Self-Supervised Learning for Video Understanding',
        authors: ['Alice Johnson', 'Charlie Brown'],
        abstract: 'A comprehensive study of self-supervised learning methods for video...',
        affiliations: ['MIT', 'Meta AI'],
        countries: ['USA'],
        keywords: ['self-supervised learning', 'video understanding'],
        researchTopic: 'Video Analysis',
        rating: 7.8
      }
    ]
  })

  // Create sample sessions
  await prisma.session.createMany({
    data: [
      {
        instanceId: cvpr2024.id,
        title: 'Oral Session: Vision Transformers',
        type: 'oral',
        date: new Date('2024-06-18'),
        startTime: '09:00',
        endTime: '10:30',
        location: 'Hall A'
      },
      {
        instanceId: cvpr2024.id,
        title: 'Poster Session: Self-Supervised Learning',
        type: 'poster',
        date: new Date('2024-06-19'),
        startTime: '14:00',
        endTime: '16:00',
        location: 'Exhibition Hall'
      }
    ]
  })

  console.log('Seed data created successfully!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

**Step 2: Run seed script**

Run:
```bash
cd apps/web && npx tsx prisma/seed-explore.ts
```

**Step 3: Commit**

```bash
git add apps/web/prisma/seed-explore.ts
git commit -m "feat(explore): add seed script for test data"
```

---

## Summary

This plan implements the Explore feature in 15 tasks across 6 phases:

1. **Phase 1: Foundation** (Tasks 1-4) - Schema, config, dependencies, data layer
2. **Phase 2: Shared Components** (Tasks 5-6) - Reusable UI components
3. **Phase 3: Hub Page** (Tasks 7-9) - Layout and hub with stats/charts
4. **Phase 4: Conference Pages** (Tasks 10-11) - Conference list and detail
5. **Phase 5: Entity Pages** (Tasks 12-13) - Publications and sessions
6. **Phase 6: Integration** (Tasks 14-15) - Navigation and seed data

Each task follows TDD principles where applicable and includes commit checkpoints.
