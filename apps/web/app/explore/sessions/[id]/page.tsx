// apps/web/app/explore/sessions/[id]/page.tsx

import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/explore/queries";
import { Calendar, Clock, MapPin, User, ExternalLink } from "lucide-react";
import { SetAIContext } from "@/app/explore/set-ai-context";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function SessionDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSession(id);

  if (!session) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6">
      <SetAIContext
        context={{
          sessionId: id,
          sessionTitle: session.title,
        }}
      />
      {/* Breadcrumb */}
      <p className="text-sm text-muted-foreground">
        ~/research-hub/sessions/{session.instance.venue.name.toLowerCase()}/
        {session.instance.year}
      </p>

      {/* Title */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          {session.title}
        </h1>
      </div>

      {/* Metadata pills */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/explore/conferences/${session.instance.id}`}
          className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors"
        >
          {session.instance.venue.name} {session.instance.year}
        </Link>
        {session.type && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            {session.type}
          </span>
        )}
        {session.date && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            {new Date(session.date).toLocaleDateString()}
          </span>
        )}
        {(session.startTime || session.endTime) && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {session.startTime}
            {session.endTime && ` – ${session.endTime}`}
          </span>
        )}
        {session.location && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            {session.location}
          </span>
        )}
        {session.speaker && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {session.speaker}
          </span>
        )}
      </div>

      {/* Actions */}
      {session.sessionUrl && (
        <div className="flex flex-wrap gap-3">
          <a
            href={session.sessionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            View Session
          </a>
        </div>
      )}

      {/* Abstract */}
      {session.abstract && (
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Abstract</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {session.abstract}
          </p>
        </div>
      )}

      {/* Overview */}
      {session.overview && (
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Overview</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {session.overview}
          </p>
        </div>
      )}

      {/* Transcript */}
      {session.transcript && (
        <div className="bg-card rounded-lg p-6">
          <h2 className="text-sm font-semibold mb-3">Transcript</h2>
          <div className="max-h-96 overflow-y-auto">
            <p className="text-muted-foreground whitespace-pre-wrap text-sm">
              {session.transcript}
            </p>
          </div>
        </div>
      )}

      {/* Related Publications */}
      {session.publications.length > 0 && (
        <div className="bg-card rounded-lg">
          <h2 className="text-sm font-semibold p-6 pb-0">
            Related Publications
          </h2>
          <div className="divide-y divide-border mt-3">
            {session.publications.map((pub) => (
              <Link
                key={pub.id}
                href={`/explore/publications/${pub.id}`}
                className="block p-5 hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <h3 className="font-medium">{pub.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {pub.authors.slice(0, 3).join(", ")}
                  {pub.authors.length > 3 && ` +${pub.authors.length - 3} more`}
                </p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
