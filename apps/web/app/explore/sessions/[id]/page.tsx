// apps/web/app/explore/sessions/[id]/page.tsx

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getSession } from '@/lib/explore/queries'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar, Clock, MapPin, User } from 'lucide-react'

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
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant="secondary">{session.instance.year}</Badge>
          <Link href={`/explore/conferences/${session.instance.id}`}>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
              {session.instance.name}
            </Badge>
          </Link>
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

      {/* Abstract */}
      {session.abstract && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Abstract</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{session.abstract}</p>
          </CardContent>
        </Card>
      )}

      {/* Overview */}
      {session.overview && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{session.overview}</p>
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      {session.transcript && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <p className="text-muted-foreground whitespace-pre-wrap text-sm">{session.transcript}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Related Publications */}
      {session.publications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Related Publications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {session.publications.map((pub) => (
                <Link
                  key={pub.id}
                  href={`/explore/publications/${pub.id}`}
                  className="block p-3 border rounded hover:bg-muted/50 transition-colors"
                >
                  <h3 className="font-medium">{pub.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {pub.authors.slice(0, 3).join(', ')}
                    {pub.authors.length > 3 && ` +${pub.authors.length - 3} more`}
                  </p>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
