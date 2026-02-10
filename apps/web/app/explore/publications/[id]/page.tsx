// apps/web/app/explore/publications/[id]/page.tsx

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getPublication } from '@/lib/explore/queries'
import { AddToNotebook } from '@/components/explore/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
    <div className="max-w-4xl flex flex-col gap-6">
      {/* Header */}
      <div>
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
      <div className="flex flex-wrap gap-3">
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
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Abstract</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">{publication.abstract}</p>
        </div>
      )}

      {/* Summary */}
      {publication.summary && (
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Summary</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">{publication.summary}</p>
        </div>
      )}

      {/* Metadata */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Affiliations */}
        {publication.affiliations.length > 0 && (
          <div className="bg-card rounded-lg p-6">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Building2 className="h-4 w-4" />
              Affiliations
            </h2>
            <div className="flex flex-wrap gap-2">
              {publication.affiliations.map((aff, i) => (
                <Badge key={i} variant="outline">{aff}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Countries */}
        {publication.countries.length > 0 && (
          <div className="bg-card rounded-lg p-6">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <MapPin className="h-4 w-4" />
              Countries
            </h2>
            <div className="flex flex-wrap gap-2">
              {publication.countries.map((country, i) => (
                <Badge key={i} variant="outline">{country}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Keywords & Topic */}
      <div className="grid gap-6 md:grid-cols-2">
        {publication.keywords.length > 0 && (
          <div className="bg-card rounded-lg p-6">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
              <Tag className="h-4 w-4" />
              Keywords
            </h2>
            <div className="flex flex-wrap gap-2">
              {publication.keywords.map((kw, i) => (
                <Badge key={i} variant="secondary">{kw}</Badge>
              ))}
            </div>
          </div>
        )}

        {publication.researchTopic && (
          <div className="bg-card rounded-lg p-6">
            <h2 className="text-sm font-semibold mb-3">Research Topic</h2>
            <Badge>{publication.researchTopic}</Badge>
          </div>
        )}
      </div>

      {/* Related Sessions */}
      {publication.sessions.length > 0 && (
        <div className="bg-card rounded-lg">
          <h2 className="text-sm font-semibold p-6 pb-0">Related Sessions</h2>
          <div className="divide-y divide-border mt-3">
            {publication.sessions.map((session) => (
              <Link
                key={session.id}
                href={`/explore/sessions/${session.id}`}
                className="block p-5 hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg"
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
        </div>
      )}
    </div>
  )
}

