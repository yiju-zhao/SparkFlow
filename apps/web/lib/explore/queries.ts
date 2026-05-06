// apps/web/lib/explore/queries.ts

import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { filterOptionsCache, listCache, statsCache } from "./cache";
import {
  PAGE_SIZE,
  type PublicationFilters,
  type SessionFilters,
  type ConferenceFilters,
} from "./filters";
import type {
  GlobalStats,
  RecentConferenceItem,
  ConferenceCard,
  ConferenceDetail,
  PublicationListItem,
  PublicationDetail,
  SessionListItem,
  SessionDetail,
  CalendarSessionItem,
  FilterOptions,
  PaginatedResult,
} from "./types";

// ============ GLOBAL STATS ============

export const getGlobalStats = cache(async (): Promise<GlobalStats> => {
  const cacheKey = "global-stats";
  const cached = statsCache.get(cacheKey) as GlobalStats | undefined;
  if (cached) return cached;

  const [conferences, publications, sessions, years] = await Promise.all([
    prisma.instance.count(),
    prisma.publication.count(),
    prisma.conferenceSession.count(),
    prisma.instance.aggregate({
      _min: { year: true },
      _max: { year: true },
    }),
  ]);

  const result: GlobalStats = {
    conferences,
    publications,
    sessions,
    yearsRange:
      years._min.year && years._max.year ? { min: years._min.year, max: years._max.year } : null,
  };

  statsCache.set(cacheKey, result);
  return result;
});

export const getRecentConferences = cache(async (limit = 5): Promise<RecentConferenceItem[]> => {
  const cacheKey = `recent - conferences - ${limit} `;
  const cached = statsCache.get(cacheKey) as RecentConferenceItem[] | undefined;
  if (cached) return cached;

  const instances = await prisma.instance.findMany({
    where: {
      startDate: { not: null },
    },
    select: {
      id: true,
      name: true,
      year: true,
      startDate: true,
      endDate: true,
      location: true,
      venue: { select: { name: true } },
      _count: {
        select: {
          publications: {
            where: {
              status: { notIn: ["Reject", "Withdrawal"] },
            },
          },
          sessions: true,
        },
      },
    },
    orderBy: [{ startDate: "desc" }, { name: "asc" }],
    take: limit,
  });

  const results: RecentConferenceItem[] = instances.map((inst) => ({
    id: inst.id,
    name: inst.name,
    year: inst.year,
    venueName: inst.venue.name,
    startDate: inst.startDate,
    endDate: inst.endDate,
    location: inst.location,
    publicationCount: inst._count.publications,
    sessionCount: inst._count.sessions,
  }));

  statsCache.set(cacheKey, results);
  return results;
});

// ============ FILTER OPTIONS ============

export const getFilterOptions = cache(async (): Promise<FilterOptions> => {
  const cacheKey = "filter-options";
  const cached = filterOptionsCache.get(cacheKey);
  if (cached) return cached;

  const [venues, years, topics, statuses, sessionTypes, affiliations, countries] =
    await Promise.all([
      prisma.venue.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.instance.findMany({
        select: { year: true },
        distinct: ["year"],
        orderBy: { year: "desc" },
      }),
      prisma.publication.findMany({
        select: { researchTopic: true },
        distinct: ["researchTopic"],
        where: { researchTopic: { not: null, notIn: [""] } },
      }),
      prisma.publication.findMany({
        select: { status: true },
        distinct: ["status"],
        where: { status: { not: null, notIn: [""] } },
      }),
      prisma.conferenceSession.findMany({
        select: { type: true },
        distinct: ["type"],
        where: { type: { not: null, notIn: [""] } },
      }),
      // Get unique affiliations (top 100 most common)
      prisma.$queryRaw<{ affiliation: string }[]>`
      SELECT unnest(affiliations) as affiliation
      FROM "publications"
      GROUP BY affiliation
      ORDER BY COUNT(*) DESC
      LIMIT 100
  `,
      // Get unique countries
      prisma.$queryRaw<{ country: string }[]>`
      SELECT unnest(countries) as country
      FROM "publications"
      GROUP BY country
      ORDER BY COUNT(*) DESC
      LIMIT 50
    `,
    ]);

  const result: FilterOptions = {
    venues,
    years: years.map((y) => y.year),
    topics: topics
      .map((t) => t.researchTopic)
      .filter((t): t is string => t !== null)
      .sort((a, b) => a.localeCompare(b)),
    statuses: statuses
      .map((s) => s.status)
      .filter((s): s is string => s !== null)
      .sort((a, b) => a.localeCompare(b)),
    sessionTypes: sessionTypes.map((s) => s.type).filter((s): s is string => s !== null),
    affiliations: affiliations
      .map((a) => a.affiliation)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
    countries: countries
      .map((c) => c.country)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b)),
  };

  filterOptionsCache.set(cacheKey, result);
  return result;
});

// ============ CASCADING FILTER OPTIONS ============

interface SessionFilterOptions {
  venues: { id: string; name: string }[];
  years: number[];
  sessionTypes: string[];
}

export const getFilteredSessionOptions = cache(
  async (filters: SessionFilters): Promise<SessionFilterOptions> => {
    const cacheKey = `session-opts-${filters.venue ?? ""}-${filters.year ?? ""}-${filters.type ?? ""}`;
    const cached = filterOptionsCache.get(cacheKey);
    if (cached) {
      return cached as unknown as SessionFilterOptions;
    }

    // Build where clause helpers
    const buildSessionWhere = (
      excludeKey?: "venue" | "year" | "type",
    ): Prisma.ConferenceSessionWhereInput => {
      const where: Prisma.ConferenceSessionWhereInput = {};
      const instanceWhere: Prisma.InstanceWhereInput = {};

      if (excludeKey !== "venue" && filters.venue) {
        instanceWhere.venueId = filters.venue;
      }
      if (excludeKey !== "year" && filters.year) {
        instanceWhere.year = filters.year;
      }
      if (Object.keys(instanceWhere).length > 0) {
        where.instance = instanceWhere;
      }
      if (excludeKey !== "type" && filters.type) {
        where.type = filters.type;
      }
      return where;
    };

    const [venueInstances, yearInstances, types] = await Promise.all([
      // Venues: get instances matching year + type filters
      prisma.instance.findMany({
        where: {
          ...(filters.year ? { year: filters.year } : {}),
          ...(filters.type
            ? { sessions: { some: { type: filters.type } } }
            : { sessions: { some: {} } }),
        },
        select: { venue: { select: { id: true, name: true } } },
        distinct: ["venueId"],
      }),
      // Years: get instances matching venue + type filters
      prisma.instance.findMany({
        where: {
          ...(filters.venue ? { venueId: filters.venue } : {}),
          ...(filters.type
            ? { sessions: { some: { type: filters.type } } }
            : { sessions: { some: {} } }),
        },
        select: { year: true },
        distinct: ["year"],
        orderBy: { year: "desc" },
      }),
      // Types: get distinct types from sessions matching venue + year
      prisma.conferenceSession.findMany({
        where: buildSessionWhere("type"),
        select: { type: true },
        distinct: ["type"],
      }),
    ]);

    const uniqueVenues = new Map<string, string>();
    for (const inst of venueInstances) {
      uniqueVenues.set(inst.venue.id, inst.venue.name);
    }

    const result: SessionFilterOptions = {
      venues: Array.from(uniqueVenues.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      years: yearInstances.map((y) => y.year),
      sessionTypes: types.map((s) => s.type).filter((s): s is string => s !== null && s !== ""),
    };

    filterOptionsCache.set(cacheKey, result as unknown as FilterOptions);
    return result;
  },
);

interface PublicationFilterOptions {
  venues: { id: string; name: string }[];
  years: number[];
  topics: string[];
  statuses: string[];
  affiliations: string[];
  countries: string[];
}

export const getFilteredPublicationOptions = cache(
  async (filters: PublicationFilters): Promise<PublicationFilterOptions> => {
    const cacheKey = `pub-opts-${filters.venue ?? ""}-${filters.year ?? ""}-${filters.topic ?? ""}-${filters.status ?? ""}-${filters.affiliation ?? ""}-${filters.country ?? ""}`;
    const cached = filterOptionsCache.get(cacheKey);
    if (cached) {
      return cached as unknown as PublicationFilterOptions;
    }

    // Build where clause excluding one dimension at a time
    const buildPubWhere = (
      excludeKey?: "venue" | "year" | "topic" | "status" | "affiliation" | "country",
    ): Prisma.PublicationWhereInput => {
      const where: Prisma.PublicationWhereInput = {};
      const instanceWhere: Prisma.InstanceWhereInput = {};

      if (excludeKey !== "venue" && filters.venue) {
        instanceWhere.venueId = filters.venue;
      }
      if (excludeKey !== "year" && filters.year) {
        instanceWhere.year = filters.year;
      }
      if (Object.keys(instanceWhere).length > 0) {
        where.instance = instanceWhere;
      }
      if (excludeKey !== "topic" && filters.topic) {
        where.researchTopic = filters.topic;
      }
      if (excludeKey !== "status" && filters.status) {
        where.status = filters.status;
      }
      if (excludeKey !== "affiliation" && filters.affiliation) {
        where.affiliations = { has: filters.affiliation };
      }
      if (excludeKey !== "country" && filters.country) {
        where.countries = { has: filters.country };
      }

      // Default: hide rejected/withdrawn unless specific status selected or showExcluded
      if (!filters.status && !filters.showExcluded) {
        where.OR = [{ status: { notIn: ["Reject", "Withdrawal"] } }, { status: null }];
      }

      return where;
    };

    const [venueInstances, yearInstances, topics, statuses] = await Promise.all([
      // Venues
      prisma.instance.findMany({
        where: {
          ...(filters.year ? { year: filters.year } : {}),
          publications: { some: buildPubWhere("venue") },
        },
        select: { venue: { select: { id: true, name: true } } },
        distinct: ["venueId"],
      }),
      // Years
      prisma.instance.findMany({
        where: {
          ...(filters.venue ? { venueId: filters.venue } : {}),
          publications: { some: buildPubWhere("year") },
        },
        select: { year: true },
        distinct: ["year"],
        orderBy: { year: "desc" },
      }),
      // Topics
      prisma.publication.findMany({
        where: { ...buildPubWhere("topic"), researchTopic: { not: null, notIn: [""] } },
        select: { researchTopic: true },
        distinct: ["researchTopic"],
      }),
      // Statuses
      prisma.publication.findMany({
        where: { ...buildPubWhere("status"), status: { not: null, notIn: [""] } },
        select: { status: true },
        distinct: ["status"],
      }),
    ]);

    const uniqueVenues = new Map<string, string>();
    for (const inst of venueInstances) {
      uniqueVenues.set(inst.venue.id, inst.venue.name);
    }

    const result: PublicationFilterOptions = {
      venues: Array.from(uniqueVenues.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      years: yearInstances.map((y) => y.year),
      topics: topics
        .map((t) => t.researchTopic)
        .filter((t): t is string => t !== null)
        .sort((a, b) => a.localeCompare(b)),
      statuses: statuses
        .map((s) => s.status)
        .filter((s): s is string => s !== null)
        .sort((a, b) => a.localeCompare(b)),
      // Affiliations and countries are expensive array-unnest queries;
      // keep them global (from getFilterOptions) for simplicity
      affiliations: [],
      countries: [],
    };

    filterOptionsCache.set(cacheKey, result as unknown as FilterOptions);
    return result;
  },
);

// ============ CONFERENCES ============

export const getConferences = cache(
  async (filters: ConferenceFilters): Promise<ConferenceCard[]> => {
    const cacheKey = `conferences-${filters.venue ?? ""}-${filters.year ?? ""}`;
    const cached = listCache.get(cacheKey) as ConferenceCard[] | undefined;
    if (cached) return cached;

    const where: Prisma.InstanceWhereInput = {};

    if (filters.venue) {
      where.venueId = filters.venue;
    }
    if (filters.year) {
      where.year = filters.year;
    }

    const instances = await prisma.instance.findMany({
      where,
      select: {
        id: true,
        name: true,
        year: true,
        startDate: true,
        endDate: true,
        location: true,
        venue: { select: { id: true, name: true } },
        _count: {
          select: {
            publications: {
              where: {
                status: { notIn: ["Reject", "Withdrawal"] },
              },
            },
            sessions: true,
          },
        },
      },
      orderBy: [{ year: "desc" }, { name: "asc" }],
    });

    if (instances.length === 0) return [];

    // Top 3 research topics per instance — fetched in ONE query instead of
    // one-per-instance (was N+1). Uses a window function to rank topics by
    // popularity within each instance, then picks the top 3.
    const instanceIds = instances.map((i) => i.id);
    const topicRows = await prisma.$queryRaw<
      { instanceId: string; researchTopic: string }[]
    >`
      SELECT "instanceId", "researchTopic"
      FROM (
        SELECT
          "instanceId",
          "researchTopic",
          ROW_NUMBER() OVER (
            PARTITION BY "instanceId"
            ORDER BY COUNT(*) DESC, "researchTopic" ASC
          ) AS rn
        FROM "publications"
        WHERE "instanceId" IN (${Prisma.join(instanceIds)})
          AND "researchTopic" IS NOT NULL
          AND "researchTopic" <> ''
        GROUP BY "instanceId", "researchTopic"
      ) ranked
      WHERE rn <= 3
    `;

    const topicsByInstance = new Map<string, string[]>();
    for (const row of topicRows) {
      const arr = topicsByInstance.get(row.instanceId) ?? [];
      arr.push(row.researchTopic);
      topicsByInstance.set(row.instanceId, arr);
    }

    const result: ConferenceCard[] = instances.map((inst) => ({
      id: inst.id,
      name: inst.name,
      year: inst.year,
      venue: inst.venue,
      startDate: inst.startDate,
      endDate: inst.endDate,
      location: inst.location,
      publicationCount: inst._count.publications,
      sessionCount: inst._count.sessions,
      topTopics: topicsByInstance.get(inst.id) ?? [],
    }));

    listCache.set(cacheKey, result);
    return result;
  },
);

export const getConference = cache(async (id: string): Promise<ConferenceDetail | null> => {
  const cacheKey = `conference - ${id} `;
  const cached = statsCache.get(cacheKey) as ConferenceDetail | undefined;
  if (cached) return cached;

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
      venue: { select: { id: true, name: true, type: true } },
    },
  });

  if (instance) statsCache.set(cacheKey, instance);
  return instance;
});

export const getConferenceStats = cache(async (id: string) => {
  const cacheKey = `conference - stats - ${id} `;
  const cached = statsCache.get(cacheKey);
  if (cached) return cached;

  const [
    pubCount,
    sessionCount,
    topTopics,
    topAffiliations,
    statusBreakdown,
    topKeywords,
    topCountries,
    orgNodes,
    orgLinks,
    geoNodes,
    geoLinks,
  ] = await Promise.all([
    // Basic Counts (excluding rejected/withdrawn papers)
    prisma.publication.count({
      where: {
        instanceId: id,
        status: { notIn: ["Reject", "Withdrawal"] },
      },
    }),
    prisma.conferenceSession.count({ where: { instanceId: id } }),

    // Top Topics
    prisma.publication.groupBy({
      by: ["researchTopic"],
      where: {
        instanceId: id,
        researchTopic: { not: null },
        status: { notIn: ["Reject", "Withdrawal"] },
      },
      _count: { researchTopic: true },
      orderBy: { _count: { researchTopic: "desc" } },
      take: 10,
    }),

    // Top Affiliations
    prisma.$queryRaw<{ affiliation: string; count: bigint }[]>`
      SELECT unnest(affiliations) as affiliation, COUNT(*) as count
      FROM "publications"
      WHERE "instanceId" = ${id}
AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
      GROUP BY affiliation
      ORDER BY count DESC
      LIMIT 15
  `,

    // Status Breakdown
    prisma.publication.groupBy({
      by: ["status"],
      where: { instanceId: id, status: { not: null } },
      _count: { status: true },
      orderBy: { _count: { status: "desc" } },
    }),

    // Top Keywords
    prisma.$queryRaw<{ keyword: string; count: bigint }[]>`
      SELECT unnest(keywords) as keyword, COUNT(*) as count
      FROM "publications"
      WHERE "instanceId" = ${id}
AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
      GROUP BY keyword
      ORDER BY count DESC
      LIMIT 50
  `,

    // Top Countries
    prisma.$queryRaw<{ country: string; count: bigint }[]>`
      SELECT unnest(countries) as country, COUNT(*) as count
      FROM "publications"
      WHERE "instanceId" = ${id}
AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
      GROUP BY country
      ORDER BY count DESC
      LIMIT 15
  `,

    // Org Network Nodes
    prisma.$queryRaw<{ node_name: string; val: bigint }[]>`
      SELECT unnest(affiliations) as node_name, COUNT(*) as val
      FROM "publications"
      WHERE "instanceId" = ${id}
AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
      GROUP BY node_name
      ORDER BY val DESC
      LIMIT 30
  `,

    // Org Network Links
    prisma.$queryRaw<{ source: string; target: string; value: bigint }[]>`
      WITH PubAffiliations AS(
    SELECT id, unnest(affiliations) as org
        FROM "publications"
        WHERE "instanceId" = ${id}
          AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
  )
      SELECT t1.org as source, t2.org as target, COUNT(*) as "value"
      FROM PubAffiliations t1
      JOIN PubAffiliations t2 ON t1.id = t2.id AND t1.org < t2.org
      WHERE t1.org IN(
    SELECT unnest(affiliations) as org
        FROM "publications"
        WHERE "instanceId" = ${id}
          AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
        GROUP BY org
        ORDER BY COUNT(*) DESC
        LIMIT 30
  )
      AND t2.org IN(
    SELECT unnest(affiliations) as org
        FROM "publications"
        WHERE "instanceId" = ${id}
          AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
        GROUP BY org
        ORDER BY COUNT(*) DESC
        LIMIT 30
  )
      GROUP BY source, target
      ORDER BY "value" DESC
  `,

    // Geo Network Nodes
    prisma.$queryRaw<{ node_name: string; val: bigint }[]>`
      SELECT unnest(countries) as node_name, COUNT(*) as val
      FROM "publications"
      WHERE "instanceId" = ${id}
AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
      GROUP BY node_name
      ORDER BY val DESC
      LIMIT 30
  `,

    // Geo Network Links
    prisma.$queryRaw<{ source: string; target: string; value: bigint }[]>`
      WITH PubCountries AS(
    SELECT id, unnest(countries) as country
        FROM "publications"
        WHERE "instanceId" = ${id}
          AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
  )
      SELECT t1.country as source, t2.country as target, COUNT(*) as "value"
      FROM PubCountries t1
      JOIN PubCountries t2 ON t1.id = t2.id AND t1.country < t2.country
      WHERE t1.country IN(
    SELECT unnest(countries) as country
        FROM "publications"
        WHERE "instanceId" = ${id}
          AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
        GROUP BY country
        ORDER BY COUNT(*) DESC
        LIMIT 30
  )
      AND t2.country IN(
    SELECT unnest(countries) as country
        FROM "publications"
        WHERE "instanceId" = ${id}
          AND(status NOT IN('Reject', 'Withdrawal') OR status IS NULL)
        GROUP BY country
        ORDER BY COUNT(*) DESC
        LIMIT 30
  )
      GROUP BY source, target
      ORDER BY "value" DESC
  `,
  ]);

  const result = {
    publicationCount: pubCount,
    sessionCount: sessionCount,
    topTopics: topTopics.map((t) => ({
      topic: t.researchTopic as string,
      count: t._count.researchTopic,
    })),
    topAffiliations: topAffiliations.map((a) => ({
      affiliation: a.affiliation,
      count: Number(a.count),
    })),
    statusBreakdown: statusBreakdown.map((s) => ({
      status: s.status as string,
      count: s._count.status,
    })),
    topKeywords: topKeywords.map((k) => ({
      keyword: k.keyword,
      count: Number(k.count),
    })),
    topCountries: topCountries.map((c) => ({
      country: c.country,
      count: Number(c.count),
    })),
    orgCollaboration: {
      nodes: orgNodes.map((n) => ({ id: n.node_name, val: Number(n.val) })),
      links: orgLinks.map((l) => ({
        source: l.source,
        target: l.target,
        value: Number(l.value),
      })),
    },
    geoCollaboration: {
      nodes: geoNodes.map((n) => ({ id: n.node_name, val: Number(n.val) })),
      links: geoLinks.map((l) => ({
        source: l.source,
        target: l.target,
        value: Number(l.value),
      })),
    },
  };

  statsCache.set(cacheKey, result);
  return result;
});

// ============ PUBLICATIONS ============

export const getPublications = cache(
  async (filters: PublicationFilters): Promise<PaginatedResult<PublicationListItem>> => {
    const where: Prisma.PublicationWhereInput = {};

    if (filters.conference) {
      where.instanceId = filters.conference;
    }
    if (filters.year || filters.venue) {
      where.instance = {
        ...(filters.year && { year: filters.year }),
        ...(filters.venue && { venueId: filters.venue }),
      };
    }
    if (filters.topic) {
      where.researchTopic = filters.topic;
    }
    if (filters.affiliation) {
      where.affiliations = { has: filters.affiliation };
    }
    if (filters.country) {
      where.countries = { has: filters.country };
    }

    // Handle status filtering
    if (filters.status) {
      // If a specific status is selected in the dropdown, filter by it
      where.status = filters.status;
    } else if (!filters.showExcluded) {
      // Hide Reject and Withdrawal by default unless toggle is checked
      where.OR = [{ status: { notIn: ["Reject", "Withdrawal"] } }, { status: null }];
    }

    let orderBy: Prisma.PublicationOrderByWithRelationInput = {};
    if (filters.sortBy === "rating") {
      orderBy = { rating: filters.sortDir };
    } else if (filters.sortBy === "title") {
      orderBy = { title: filters.sortDir };
    } else if (filters.sortBy === "year") {
      orderBy = { instance: { year: filters.sortDir } };
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
          instance: {
            select: {
              name: true,
              year: true,
              venue: { select: { name: true } },
            },
          },
        },
        orderBy,
        skip: filters.page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.publication.count({ where }),
    ]);

    return {
      data,
      total,
      page: filters.page,
      pageSize: PAGE_SIZE,
    };
  },
);

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
      instance: {
        select: {
          id: true,
          name: true,
          year: true,
          venue: { select: { name: true } },
        },
      },
      sessions: {
        select: {
          session: {
            select: {
              id: true,
              title: true,
              type: true,
              date: true,
              startTime: true,
              endTime: true,
              sessionUrl: true,
            },
          },
        },
      },
    },
  });

  if (!publication) return null;

  return {
    ...publication,
    sessions: publication.sessions.map((s) => s.session),
  };
});

// ============ SESSIONS ============

export const getSessions = cache(
  async (filters: SessionFilters): Promise<PaginatedResult<SessionListItem>> => {
    const where: Prisma.ConferenceSessionWhereInput = {};

    if (filters.conference) {
      where.instanceId = filters.conference;
    }
    if (filters.year || filters.venue) {
      where.instance = {
        ...(filters.year && { year: filters.year }),
        ...(filters.venue && { venueId: filters.venue }),
      };
    }
    if (filters.type) {
      where.type = filters.type;
    }

    let orderBy: Prisma.ConferenceSessionOrderByWithRelationInput = {};
    if (filters.sortBy === "date") {
      orderBy = { date: filters.sortDir };
    } else if (filters.sortBy === "title") {
      orderBy = { title: filters.sortDir };
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
          instance: {
            select: {
              name: true,
              year: true,
              venue: { select: { name: true } },
            },
          },
        },
        orderBy,
        skip: filters.page * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.conferenceSession.count({ where }),
    ]);

    return {
      data,
      total,
      page: filters.page,
      pageSize: PAGE_SIZE,
    };
  },
);

export const getConferenceSessions = cache(
  async (instanceId: string): Promise<CalendarSessionItem[]> => {
    const cacheKey = `conf-sessions-${instanceId}`;
    const cached = listCache.get(cacheKey) as CalendarSessionItem[] | undefined;
    if (cached) return cached;

    const result = await prisma.conferenceSession.findMany({
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
        topic: true,
        technology: true,
        affiliation: true,
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    listCache.set(cacheKey, result);
    return result;
  },
);

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
      topic: true,
      affiliation: true,
      technology: true,
      sessionFormat: true,
      hasRecording: true,
      intendedAudience: true,
      instance: {
        select: {
          id: true,
          name: true,
          year: true,
          venue: { select: { name: true } },
        },
      },
      publications: {
        select: {
          publication: { select: { id: true, title: true, authors: true } },
        },
      },
    },
  });

  if (!session) return null;

  return {
    ...session,
    publications: session.publications.map((p) => p.publication),
  };
});

// ============ CHART DATA ============

export const getYearTrendData = cache(async () => {
  const cacheKey = "year-trend";
  const cached = statsCache.get(cacheKey) as { year: number; conferences: number }[] | undefined;
  if (cached) return cached;

  const data = await prisma.instance.findMany({
    select: {
      year: true,
    },
    orderBy: { year: "asc" },
  });

  const byYear = new Map<number, number>();
  for (const item of data) {
    byYear.set(item.year, (byYear.get(item.year) || 0) + 1);
  }

  const result = Array.from(byYear.entries()).map(([year, count]) => ({
    year,
    conferences: count,
  }));
  statsCache.set(cacheKey, result);
  return result;
});

export const getTopicsChartData = cache(async () => {
  const cacheKey = "topics-chart";
  const cached = statsCache.get(cacheKey) as { topic: string; count: number }[] | undefined;
  if (cached) return cached;

  const data = await prisma.publication.groupBy({
    by: ["researchTopic"],
    where: { researchTopic: { not: null } },
    _count: { researchTopic: true },
    orderBy: { _count: { researchTopic: "desc" } },
    take: 10,
  });

  const result = data.map((item) => ({
    topic: item.researchTopic as string,
    count: item._count.researchTopic,
  }));
  statsCache.set(cacheKey, result);
  return result;
});
