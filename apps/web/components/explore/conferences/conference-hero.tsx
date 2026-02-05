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
