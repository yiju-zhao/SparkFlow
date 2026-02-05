// apps/web/app/explore/conferences/[id]/page.tsx

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getConference, getConferenceStats, getPublications, getSessions } from '@/lib/explore/queries'
import { ConferenceHero } from '@/components/explore/conferences'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileText } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

async function PublicationsSection({ conferenceId }: { conferenceId: string }) {
  const result = await getPublications({ conference: conferenceId, page: 0, sortBy: 'rating', sortDir: 'desc' })

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Showing top {result.data.length} of {result.total} publications
      </p>
      <div className="space-y-2">
        <div className="space-y-2">
          {result.data.map((pub) => (
            <div
              key={pub.id}
              className="relative block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="grid grid-cols-[1fr_auto] gap-4">
                <div className="flex flex-col h-full">
                  <div className="flex items-center gap-2">
                    {pub.status && (
                      <Badge variant="secondary">{pub.status}</Badge>
                    )}
                    <h3 className="font-medium">
                      <Link href={`/explore/publications/${pub.id}`} className="after:absolute after:inset-0">
                        {pub.title}
                      </Link>
                    </h3>
                    {pub.pdfUrl && (
                      <Button variant="ghost" size="icon" className="h-6 w-6 p-0 z-20 relative" asChild>
                        <a href={pub.pdfUrl} target="_blank" rel="noopener noreferrer">
                          <FileText className="h-4 w-4" />
                          <span className="sr-only">PDF</span>
                        </a>
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {pub.authors.slice(0, 3).join(', ')}
                    {pub.authors.length > 3 && ` +${pub.authors.length - 3} more`}
                  </p>
                </div>
                <div className="flex flex-col justify-between items-end h-full pointer-events-none min-w-[100px] min-h-[3.5rem]">
                  {/* Top: Rating */}
                  <div className="h-6 flex items-center">
                    {pub.rating && (
                      <Badge variant="secondary">{pub.rating.toFixed(1)}</Badge>
                    )}
                  </div>

                  {/* Bottom: Topic */}
                  <div className="h-6 flex items-center mt-auto">
                    {pub.researchTopic && (
                      <Badge variant="outline">{pub.researchTopic}</Badge>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Link
          href={`/explore/publications?conference=${conferenceId}`}
          className="text-sm text-primary hover:underline"
        >
        </Link>
      </div>
    </div>
  )
}

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
        <Link
          href={`/explore/sessions?conference=${conferenceId}`}
          className="text-sm text-primary hover:underline"
        >
        </Link>
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
            <PublicationsSection conferenceId={id} />
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
