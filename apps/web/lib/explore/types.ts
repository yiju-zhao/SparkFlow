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
  instance: { name: string; year: number; venue: { name: string } }
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
  instance: { id: string; name: string; year: number; venue: { name: string } }
  sessions: { id: string; title: string; type: string | null }[]
}

export interface SessionListItem {
  id: string
  title: string
  type: string | null
  date: Date | null
  startTime: string | null
  endTime: string | null
  instance: { name: string; year: number; venue: { name: string } }
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
  instance: { id: string; name: string; year: number; venue: { name: string } }
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
