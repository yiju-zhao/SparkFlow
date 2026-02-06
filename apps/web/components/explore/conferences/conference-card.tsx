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
        <CardHeader className="pb-2">
          {/* Top: Venue + Year */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground font-medium">{conference.venue.name}</span>
            <Badge variant="secondary">{conference.year}</Badge>
          </div>
          {/* Title below */}
          <CardTitle className="text-lg mt-1">{conference.name}</CardTitle>
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
