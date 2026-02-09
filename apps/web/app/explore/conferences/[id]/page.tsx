import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getConference, getConferenceStats, getSessions } from '@/lib/explore/queries'
import { ConferenceHero } from '@/components/explore/conferences'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { BarChart3, Calendar } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

import { PublicationStatsSection } from '@/components/explore/conferences/publication-stats-section'

async function SessionsSection({ conferenceId }: { conferenceId: string }) {
  const result = await getSessions({ conference: conferenceId, page: 0, sortBy: 'date', sortDir: 'asc' })

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Showing {result.data.length} of {result.total} sessions
      </p>
      <div className="space-y-8">
        {Object.entries(result.data.reduce((acc, session) => {
          const date = session.date ? new Date(session.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Unscheduled'
          if (!acc[date]) acc[date] = []
          acc[date].push(session)
          return acc
        }, {} as Record<string, typeof result.data>)).map(([date, sessions]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-4 sticky top-0 bg-background/95 backdrop-blur py-3 z-10">
              <div className="h-px flex-1 bg-border/60" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">{date}</h3>
              <div className="h-px flex-1 bg-border/60" />
            </div>
            <div className="space-y-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="relative group rounded-lg border border-border/50 bg-card p-4 hover:border-border hover:shadow-sm transition-all flex gap-4"
                >
                  <div className="w-28 shrink-0 text-sm text-muted-foreground pt-0.5 tabular-nums">
                    {session.startTime || 'TBD'}
                    {session.endTime && (
                      <>
                        <span className="text-border mx-1">–</span>
                        {session.endTime}
                      </>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <h4 className="font-medium leading-snug">
                        <Link href={`/explore/sessions/${session.id}`} className="after:absolute after:inset-0 hover:underline decoration-foreground/20 underline-offset-2">
                          {session.title}
                        </Link>
                      </h4>
                      {session.type && (
                        <Badge variant="secondary" className="shrink-0 text-xs">{session.type}</Badge>
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

      <Tabs defaultValue="publications" className="relative">
        <TabsList className="bg-transparent border-b border-border/60 rounded-none w-full justify-start h-auto p-0 gap-0">
          <TabsTrigger
            value="publications"
            className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-5 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors"
          >
            <BarChart3 className="h-3.5 w-3.5 mr-2" />
            Publications
          </TabsTrigger>
          <TabsTrigger
            value="sessions"
            className="relative rounded-none border-b-2 border-transparent data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none px-5 py-3 text-sm font-medium text-muted-foreground data-[state=active]:text-foreground transition-colors"
          >
            <Calendar className="h-3.5 w-3.5 mr-2" />
            Sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="publications" className="mt-8">
          <Suspense fallback={<ContentSkeleton />}>
            <PublicationStatsSection venueId={conference.venue.id} year={conference.year} stats={stats} />
          </Suspense>
        </TabsContent>

        <TabsContent value="sessions" className="mt-8">
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
    <div className="space-y-6">
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-40 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-4 w-32" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
