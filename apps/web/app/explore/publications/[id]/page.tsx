// apps/web/app/explore/publications/[id]/page.tsx

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublication } from '@/lib/explore/queries'
import { AddToNotebook } from '@/components/explore/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Github, Globe, ExternalLink, Star, Building2, MapPin, Tag } from 'lucide-react'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PublicationDetailPage({ params }: PageProps) {
  const { id } = await params
  const publication = await getPublication(id)

  if (!publication) {
    notFound()
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <Link href={`/explore/conferences/${publication.instance.id}`} className="font-semibold hover:underline">
            {publication.instance.venue.name}
          </Link>
          <Badge variant="secondary" className="font-normal text-muted-foreground">
            {publication.instance.year}
          </Badge>
          {publication.status && (
            <Badge variant="outline" className="font-normal">
              {publication.status}
            </Badge>
          )}
          {publication.rating && (
            <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
              <Star className="h-3 w-3 mr-1 fill-current" />
              {publication.rating.toFixed(1)}
            </Badge>
          )}
        </div>

        <h1 className="text-3xl font-bold tracking-tight mb-4">{publication.title}</h1>

        <p className="text-muted-foreground">
          {publication.authors.join(', ')}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-8">
        <AddToNotebook publication={publication} />

        {publication.pdfUrl && (
          <Button variant="outline" asChild>
            <a href={publication.pdfUrl} target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4 mr-2" />
              View PDF
            </a>
          </Button>
        )}

        {publication.githubUrl && (
          <Button variant="outline" asChild>
            <a href={publication.githubUrl} target="_blank" rel="noopener noreferrer">
              <Github className="h-4 w-4 mr-2" />
              GitHub
            </a>
          </Button>
        )}

        {publication.websiteUrl && (
          <Button variant="outline" asChild>
            <a href={publication.websiteUrl} target="_blank" rel="noopener noreferrer">
              <Globe className="h-4 w-4 mr-2" />
              Website
            </a>
          </Button>
        )}

        {publication.doi && (
          <Button variant="outline" asChild>
            <a href={`https://doi.org/${publication.doi}`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              DOI
            </a>
          </Button>
        )}
      </div>

      {/* Abstract */}
      {publication.abstract && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Abstract</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{publication.abstract}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {publication.summary && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground whitespace-pre-wrap">{publication.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Metadata */}
      <div className="grid gap-6 md:grid-cols-2 mb-6">
        {/* Affiliations */}
        {publication.affiliations.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Affiliations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {publication.affiliations.map((aff, i) => (
                  <Badge key={i} variant="outline">{aff}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Countries */}
        {publication.countries.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Countries
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {publication.countries.map((country, i) => (
                  <Badge key={i} variant="outline">{country}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Keywords & Topic */}
      <div className="grid gap-6 md:grid-cols-2 mb-6">
        {publication.keywords.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                Keywords
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {publication.keywords.map((kw, i) => (
                  <Badge key={i} variant="secondary">{kw}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {publication.researchTopic && (
          <Card>
            <CardHeader>
              <CardTitle>Research Topic</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge>{publication.researchTopic}</Badge>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Related Sessions */}
      {publication.sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Related Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {publication.sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/explore/sessions/${session.id}`}
                  className="block p-3 border rounded hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{session.title}</span>
                    {session.type && (
                      <Badge variant="outline">{session.type}</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
