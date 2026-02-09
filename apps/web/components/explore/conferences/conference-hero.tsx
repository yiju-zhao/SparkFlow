// apps/web/components/explore/conferences/conference-hero.tsx

import { Calendar, MapPin, Globe, FileText, Presentation, ArrowUpRight } from 'lucide-react'
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
    ? `${formatDate(conference.startDate)} – ${formatDate(conference.endDate)}`
    : conference.startDate
      ? formatDate(conference.startDate)
      : null

  return (
    <div className="relative -mx-6 -mt-8 mb-10">
      {/* Atmospheric gradient backdrop */}
      <div className="absolute inset-0 bg-gradient-to-br from-foreground/[0.03] via-transparent to-foreground/[0.06] dark:from-white/[0.04] dark:via-transparent dark:to-white/[0.02]" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gradient-to-bl from-accent-red/[0.04] via-transparent to-transparent dark:from-accent-red/[0.06] rounded-full blur-3xl" />

      <div className="relative px-6 pt-12 pb-10">
        {/* Breadcrumb line */}
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <span>Conferences</span>
          <span className="text-border">/</span>
          <span className="font-medium text-foreground">{conference.venue.name}</span>
          <span className="text-border">/</span>
          <span className="font-medium text-foreground">{conference.year}</span>
        </div>

        {/* Title block */}
        <div className="max-w-4xl">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-[1.1] mb-5">
            {conference.name}
          </h1>

          {conference.summary && (
            <p className="text-lg text-muted-foreground leading-relaxed max-w-3xl">
              {conference.summary}
            </p>
          )}
        </div>

        {/* Metadata row */}
        <div className="flex flex-wrap items-center gap-3 mt-8">
          {dateRange && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/[0.05] dark:bg-white/[0.06] text-sm font-medium">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              {dateRange}
            </div>
          )}
          {conference.location && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/[0.05] dark:bg-white/[0.06] text-sm font-medium">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              {conference.location}
            </div>
          )}
          {conference.website && (
            <a
              href={conference.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-foreground/[0.05] dark:bg-white/[0.06] text-sm font-medium hover:bg-foreground/[0.08] dark:hover:bg-white/[0.1] transition-colors group"
            >
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              Official Website
              <ArrowUpRight className="h-3 w-3 text-muted-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </a>
          )}
        </div>

        {/* Stats strip */}
        <div className="flex items-center gap-8 mt-8 pt-8 border-t border-border/60">
          <div>
            <div className="text-3xl font-bold tracking-tight tabular-nums">
              {stats.publicationCount.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              Publications
            </div>
          </div>
          <div className="w-px h-10 bg-border/60" />
          <div>
            <div className="text-3xl font-bold tracking-tight tabular-nums">
              {stats.sessionCount.toLocaleString()}
            </div>
            <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <Presentation className="h-3.5 w-3.5" />
              Sessions
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
