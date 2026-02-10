// apps/web/components/explore/hub/recent-conferences.tsx

import Link from 'next/link'
import type { RecentConferenceItem } from '@/lib/explore/types'

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

function formatDate(date: Date) {
  return dateFormatter.format(date)
}

function formatDateRange(startDate: Date | null, endDate: Date | null, year: number) {
  if (!startDate && !endDate) return `${year}`
  if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`
  if (startDate) return formatDate(startDate)
  return endDate ? formatDate(endDate) : `${year}`
}

function getStatus(startDate: Date | null, endDate: Date | null) {
  const now = new Date()

  if (startDate && startDate > now) {
    return { label: 'Upcoming', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' }
  }
  if (endDate && endDate < now) {
    return { label: 'Completed', className: 'border-border bg-muted text-muted-foreground' }
  }
  if (startDate || endDate) {
    return { label: 'Ongoing', className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300' }
  }
  return { label: 'Scheduled', className: 'border-border bg-muted text-muted-foreground' }
}

interface RecentConferencesProps {
  conferences: RecentConferenceItem[]
}

export function RecentConferences({ conferences }: RecentConferencesProps) {
  if (!conferences.length) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-6 py-8 text-sm text-muted-foreground">
        No recent conferences available yet.
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {conferences.map((conference) => {
        const dateLabel = formatDateRange(conference.startDate, conference.endDate, conference.year)
        // const meta = [
        //   conference.venueName,
        //   dateLabel,
        //   conference.location
        // ].filter((item): item is string => Boolean(item)).join(' • ')
        const status = getStatus(conference.startDate, conference.endDate)

        // Status label mapping for "code" style
        let statusCode = 'SCHEDULED'
        if (status.label === 'Upcoming') statusCode = 'UPCOMING'
        if (status.label === 'Ongoing') statusCode = 'ONGOING'
        if (status.label === 'Completed') statusCode = 'COMPLETED'

        // Status color mapping
        let statusColorClass = 'text-muted-foreground'
        if (status.label === 'Upcoming') statusColorClass = 'text-emerald-500'
        if (status.label === 'Ongoing') statusColorClass = 'text-blue-500'


        return (
          <Link
            key={conference.id}
            href={`/explore/conferences/${conference.id}`}
            className="flex items-center justify-between gap-6 px-5 py-4 border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors group"
          >
            <div className="flex items-center gap-5 min-w-0">
              {/* ID / Year Column */}
              <div className="w-[50px] shrink-0">
                <span className="font-mono text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  #{conference.year}
                </span>
              </div>

              {/* Info Column */}
              <div className="flex flex-col gap-1 min-w-0">
                <p className="font-mono text-[13px] font-medium text-foreground truncate">
                  {conference.name}
                </p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                  <span>{dateLabel}</span>
                  {conference.location && (
                    <>
                      <span>•</span>
                      <span>{conference.location}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-8">
              {/* Status Column */}
              <div className="hidden sm:block">
                <span className={`font-mono text-[10px] font-semibold ${statusColorClass}`}>
                  [{statusCode}]
                </span>
              </div>

              {/* Stats Column */}
              <div className="text-right w-[80px]">
                <span className="font-mono text-[13px] font-semibold text-foreground">
                  +{conference.publicationCount}
                </span>
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
