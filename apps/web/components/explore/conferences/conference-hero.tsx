// apps/web/components/explore/conferences/conference-hero.tsx

import { Calendar, MapPin, Globe, ArrowUpRight } from 'lucide-react'
import type { ConferenceDetail } from '@/lib/explore/types'

interface ConferenceHeroProps {
  conference: ConferenceDetail
}

export function ConferenceHero({ conference }: ConferenceHeroProps) {
  const formatDate = (date: Date | null) => {
    if (!date) return null
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(date))
  }

  const dateRange = conference.startDate && conference.endDate
    ? `${formatDate(conference.startDate)} – ${formatDate(conference.endDate)}`
    : conference.startDate
      ? formatDate(conference.startDate)
      : null

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <p className="text-sm text-muted-foreground">
        ~/research-hub/conferences/{conference.venue.name.toLowerCase()}/{conference.year}
      </p>

      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          {conference.name}
        </h1>
        {conference.summary && (
          <p className="text-muted-foreground leading-relaxed max-w-3xl">
            {conference.summary}
          </p>
        )}
      </div>

      {/* Metadata pills */}
      <div className="flex flex-wrap items-center gap-3">
        {dateRange && (
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {dateRange}
          </div>
        )}
        {conference.location && (
          <div className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {conference.location}
          </div>
        )}
        {conference.website && (
          <a
            href={conference.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors group"
          >
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            Official Website
            <ArrowUpRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </a>
        )}
      </div>
    </div>
  )
}
