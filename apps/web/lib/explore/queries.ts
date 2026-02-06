// apps/web/lib/explore/queries.ts

import { cache } from 'react'
import { Prisma } from '@prisma/client'
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
    prisma.conferenceSession.count(),
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
      where: { researchTopic: { not: null, notIn: [''] } }
    }),
    prisma.conferenceSession.findMany({
      select: { type: true },
      distinct: ['type'],
      where: { type: { not: null, notIn: [''] } }
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
  const where: Prisma.InstanceWhereInput = {}

  if (filters.venue) {
    where.venueId = filters.venue
  }
  if (filters.yearFrom || filters.yearTo) {
    where.year = {
      ...(filters.yearFrom && { gte: filters.yearFrom }),
      ...(filters.yearTo && { lte: filters.yearTo })
    }
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
    prisma.conferenceSession.count({ where: { instanceId: id } }),
    prisma.publication.groupBy({
      by: ['researchTopic'],
      where: { instanceId: id, researchTopic: { not: null } },
      _count: { researchTopic: true },
      orderBy: { _count: { researchTopic: 'desc' } },
      take: 10
    }),
    prisma.$queryRaw<{ affiliation: string; count: bigint }[]>`
      SELECT unnest(affiliations) as affiliation, COUNT(*) as count
      FROM "publications"
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
  const where: Prisma.PublicationWhereInput = {}

  if (filters.conference) {
    where.instanceId = filters.conference
  }
  if (filters.year || filters.venue) {
    where.instance = {
      ...(filters.year && { year: filters.year }),
      ...(filters.venue && { venueId: filters.venue })
    }
  }
  if (filters.topic) {
    where.researchTopic = filters.topic
  }

  let orderBy: Prisma.PublicationOrderByWithRelationInput = {}
  if (filters.sortBy === 'rating') {
    orderBy = { rating: filters.sortDir }
  } else if (filters.sortBy === 'title') {
    orderBy = { title: filters.sortDir }
  } else if (filters.sortBy === 'year') {
    orderBy = { instance: { year: filters.sortDir } }
  }

  const [data, total] = await Promise.all([
    prisma.publication.findMany({
      where,
      select: {
        id: true,
        title: true,
        authors: true,
        rating: true,
        status: true,
        researchTopic: true,
        pdfUrl: true,
        instance: { select: { name: true, year: true, venue: { select: { name: true } } } }
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
      status: true,
      doi: true,
      pdfUrl: true,
      githubUrl: true,
      websiteUrl: true,
      instance: { select: { id: true, name: true, year: true, venue: { select: { name: true } } } },
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
  const where: Prisma.ConferenceSessionWhereInput = {}

  if (filters.conference) {
    where.instanceId = filters.conference
  }
  if (filters.year || filters.venue) {
    where.instance = {
      ...(filters.year && { year: filters.year }),
      ...(filters.venue && { venueId: filters.venue })
    }
  }
  if (filters.type) {
    where.type = filters.type
  }

  let orderBy: Prisma.ConferenceSessionOrderByWithRelationInput = {}
  if (filters.sortBy === 'date') {
    orderBy = { date: filters.sortDir }
  } else if (filters.sortBy === 'title') {
    orderBy = { title: filters.sortDir }
  }

  const [data, total] = await Promise.all([
    prisma.conferenceSession.findMany({
      where,
      select: {
        id: true,
        title: true,
        type: true,
        date: true,
        startTime: true,
        endTime: true,
        sessionUrl: true,
        instance: { select: { name: true, year: true, venue: { select: { name: true } } } }
      },
      orderBy,
      skip: filters.page * PAGE_SIZE,
      take: PAGE_SIZE
    }),
    prisma.conferenceSession.count({ where })
  ])

  return {
    data,
    total,
    page: filters.page,
    pageSize: PAGE_SIZE
  }
})

export const getSession = cache(async (id: string): Promise<SessionDetail | null> => {
  const session = await prisma.conferenceSession.findUnique({
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
      sessionUrl: true,
      instance: { select: { id: true, name: true, year: true, venue: { select: { name: true } } } },
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
