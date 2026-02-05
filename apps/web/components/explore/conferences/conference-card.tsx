// apps/web/components/explore/conferences/conference-card.tsx

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileText, Calendar } from 'lucide-react'
import type { ConferenceCard as ConferenceCardType } from '@/lib/explore/types'

interface ConferenceCardProps {
  conference: ConferenceCardType
}

export function ConferenceCard({ conference }: ConferenceCardProps) {
  return (
    <Link href={`/explore/conferences/${conference.id}`}>
      <Card className="h-full hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{conference.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{conference.venue.name}</p>
            </div>
            <Badge variant="secondary">{conference.year}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
            <span className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              {conference.publicationCount} papers
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {conference.sessionCount} sessions
            </span>
          </div>

          {conference.topTopics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {conference.topTopics.map((topic) => (
                <Badge key={topic} variant="outline" className="text-xs">
                  {topic}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
