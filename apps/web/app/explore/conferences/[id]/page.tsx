// apps/web/app/explore/conferences/[id]/page.tsx

import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getConference, getConferenceStats, getPublications, getSessions } from '@/lib/explore/queries'
import { ConferenceHero } from '@/components/explore/conferences'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'

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
        {result.data.map((pub) => (
          <Link
            key={pub.id}
            href={`/explore/publications/${pub.id}`}
            className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-medium">{pub.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {pub.authors.slice(0, 3).join(', ')}
                  {pub.authors.length > 3 && ` +${pub.authors.length - 3} more`}
                </p>
              </div>
              {pub.rating && (
                <Badge variant="secondary">{pub.rating.toFixed(1)}</Badge>
              )}
            </div>
            {pub.researchTopic && (
              <Badge variant="outline" className="mt-2">{pub.researchTopic}</Badge>
            )}
          </Link>
        ))}
      </div>
      <Link
        href={`/explore/publications?conference=${conferenceId}`}
        className="text-sm text-primary hover:underline"
      >
        View all publications →
      </Link>
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
        {result.data.map((session) => (
          <Link
            key={session.id}
            href={`/explore/sessions/${session.id}`}
            className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-medium">{session.title}</h3>
                {session.date && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {new Date(session.date).toLocaleDateString()}
                    {session.startTime && ` at ${session.startTime}`}
                  </p>
                )}
              </div>
              {session.type && (
                <Badge variant="outline">{session.type}</Badge>
              )}
            </div>
          </Link>
        ))}
      </div>
      <Link
        href={`/explore/sessions?conference=${conferenceId}`}
        className="text-sm text-primary hover:underline"
      >
        View all sessions →
      </Link>
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
