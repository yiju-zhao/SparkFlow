// apps/web/lib/explore/filters.ts

import { z } from 'zod'

export const PAGE_SIZE = 20

export const publicationFiltersSchema = z.object({
  year: z.coerce.number().optional(),
  conference: z.string().optional(),
  venue: z.string().optional(),
  topic: z.string().optional(),
  showRejected: z.coerce.boolean().default(false),
  showWithdrawal: z.coerce.boolean().default(false),
  sortBy: z.enum(['rating', 'title', 'year']).default('rating'),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().default(0)
})

export const sessionFiltersSchema = z.object({
  year: z.coerce.number().optional(),
  conference: z.string().optional(),
  venue: z.string().optional(),
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
