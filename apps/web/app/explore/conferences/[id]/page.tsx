import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getConference, getConferenceStats, getSessions } from '@/lib/explore/queries'
import { ConferenceHero } from '@/components/explore/conferences'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  params: Promise<{ id: string }>
}

import { PublicationStatsSection } from '@/components/explore/conferences/publication-stats-section'

// Wrapper for PublicationStatsSection to handle Suspense if needed, 
// though stats are already fetched in parent.
// We can just use the component directly in the page.

async function SessionsSection({ conferenceId }: { conferenceId: string }) {
  const result = await getSessions({ conference: conferenceId, page: 0, sortBy: 'date', sortDir: 'asc' })

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Showing {result.data.length} of {result.total} sessions
      </p>
      <div className="space-y-2">
        <div className="space-y-6">
          {Object.entries(result.data.reduce((acc, session) => {
            const date = session.date ? new Date(session.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Unscheduled'
            if (!acc[date]) acc[date] = []
            acc[date].push(session)
            return acc
          }, {} as Record<string, typeof result.data>)).map(([date, sessions]) => (
            <div key={date}>
              <h3 className="font-semibold text-lg mb-3 sticky top-0 bg-background/95 backdrop-blur py-2 z-10">{date}</h3>
              <div className="space-y-px border rounded-lg overflow-hidden">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="relative group bg-card p-4 hover:bg-muted/50 transition-colors border-b last:border-b-0 flex gap-4"
                  >
                    <div className="w-32 shrink-0 text-sm text-muted-foreground pt-0.5">
                      {session.startTime || 'Time TBD'}
                      {session.endTime && ` - ${session.endTime}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <h4 className="font-medium truncate pr-8">
                          <Link href={`/explore/sessions/${session.id}`} className="after:absolute after:inset-0">
                            {session.title}
                          </Link>
                        </h4>
                        {session.type && (
                          <Badge variant="secondary" className="shrink-0">{session.type}</Badge>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function ConferenceDetailPage({ params }: PageProps) {
  const { id } = await params

  // Parallel fetch (follows async-parallel best practice)
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
            <PublicationStatsSection venueId={conference.venue.id} year={conference.year} stats={stats} />
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
