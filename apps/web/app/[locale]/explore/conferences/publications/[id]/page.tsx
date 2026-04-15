// apps/web/app/explore/publications/[id]/page.tsx

import { notFound } from "next/navigation";
import Link from "next/link";
import { getPublication } from "@/lib/explore/queries";
import { AddToNotebook } from "@/components/explore/shared";
import { Badge } from "@/components/ui/badge";
import { FileText, Github, Globe, ExternalLink, Star, Building2, MapPin, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PublicationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const publication = await getPublication(id);

  if (!publication) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <p className="text-sm text-muted-foreground">
        ~/research-hub/publications/
        {publication.instance.venue.name.toLowerCase()}/{publication.instance.year}
      </p>

      {/* Title */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">{publication.title}</h1>
        <p className="text-muted-foreground">{publication.authors.join(", ")}</p>
      </div>

      {/* Metadata pills */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/explore/conferences/${publication.instance.id}`}
          className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors"
        >
          {publication.instance.venue.name} {publication.instance.year}
        </Link>
        {publication.status && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            {publication.status}
          </span>
        )}
        {publication.rating && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm">
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
            {publication.rating.toFixed(1)}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <AddToNotebook publication={publication} />

        {publication.pdfUrl && (
          <a
            href={publication.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors"
          >
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
            View PDF
          </a>
        )}

        {publication.githubUrl && (
          <a
            href={publication.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors"
          >
            <Github className="h-3.5 w-3.5 text-muted-foreground" />
            GitHub
          </a>
        )}

        {publication.websiteUrl && (
          <a
            href={publication.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors"
          >
            <Globe className="h-3.5 w-3.5 text-muted-foreground" />
            Website
          </a>
        )}

        {publication.doi && (
          <a
            href={`https://doi.org/${publication.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            DOI
          </a>
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
                <Badge key={i} variant="outline">
                  {aff}
                </Badge>
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
                <Badge key={i} variant="outline">
                  {country}
                </Badge>
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
                <Badge key={i} variant="secondary">
                  {kw}
                </Badge>
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
              <div
                key={session.id}
                className="relative px-5 py-3 hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium truncate flex-1 min-w-0">
                      <Link
                        href={`/explore/sessions/${session.id}`}
                        className="after:absolute after:inset-0"
                      >
                        {session.title}
                      </Link>
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      {session.sessionUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 p-0 z-20 relative"
                          asChild
                        >
                          <a href={session.sessionUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span className="sr-only">View Session</span>
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {session.type && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 h-5 px-1.5 text-[10px] font-medium"
                      >
                        {session.type}
                      </Badge>
                    )}
                    {session.date && (
                      <span className="truncate">
                        {new Date(session.date).toISOString().split("T")[0]}
                        {session.startTime && ` ${session.startTime}`}
                        {session.endTime && ` - ${session.endTime}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
