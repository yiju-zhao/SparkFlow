// apps/web/app/explore/sessions/[id]/page.tsx

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/explore/queries'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, Clock, MapPin, User, ExternalLink } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SessionDetailPage({ params }: PageProps) {
  const { id } = await params
  const session = await getSession(id)

  if (!session) {
    notFound()
  }

  return (
    <div className="max-w-4xl flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Link href={`/explore/conferences/${session.instance.id}`} className="font-semibold hover:underline">
            {session.instance.venue.name}
          </Link>
          <Badge variant="secondary" className="font-normal text-muted-foreground">
            {session.instance.year}
          </Badge>
          {session.type && (
            <Badge>{session.type}</Badge>
          )}
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-4">{session.title}</h1>

        <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
          {session.date && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {new Date(session.date).toLocaleDateString()}
            </span>
          )}
          {(session.startTime || session.endTime) && (
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {session.startTime}
              {session.endTime && ` - ${session.endTime}`}
            </span>
          )}
          {session.location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-4 w-4" />
              {session.location}
            </span>
          )}
          {session.speaker && (
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {session.speaker}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {session.sessionUrl && (
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" asChild>
            <a href={session.sessionUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              View Session
            </a>
          </Button>
        </div>
      )}

      {/* Abstract */}
      {session.abstract && (
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Abstract</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">{session.abstract}</p>
        </div>
      )}

      {/* Overview */}
      {session.overview && (
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Overview</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">{session.overview}</p>
        </div>
      )}

      {/* Transcript */}
      {session.transcript && (
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Transcript</h2>
          <div className="max-h-96 overflow-y-auto">
            <p className="text-muted-foreground whitespace-pre-wrap text-sm">{session.transcript}</p>
          </div>
        </div>
      )}

      {/* Related Publications */}
      {session.publications.length > 0 && (
        <div className="bg-card rounded-lg">
          <h2 className="text-sm font-semibold p-6 pb-0">Related Publications</h2>
          <div className="divide-y divide-border mt-3">
            {session.publications.map((pub) => (
              <Link
                key={pub.id}
                href={`/explore/publications/${pub.id}`}
                className="block p-5 hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <h3 className="font-medium">{pub.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {pub.authors.slice(0, 3).join(', ')}
                  {pub.authors.length > 3 && ` +${pub.authors.length - 3} more`}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

