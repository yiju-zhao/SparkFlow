import { notFound } from "next/navigation";
import Link from "next/link";
import { getSession } from "@/lib/explore/queries";
import {
  Calendar,
  Clock,
  MapPin,
  User,
  ExternalLink,
  Video,
  Monitor,
  Users,
  Globe,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SetAIContext } from "@/components/explore/set-ai-context";

interface PageProps {
  params: Promise<{ id: string }>;
}

function FormatBadge({ format }: { format: string }) {
  const iconMap: Record<string, React.ReactNode> = {
    IN_PERSON: <Users className="h-3.5 w-3.5" />,
    VIRTUAL: <Monitor className="h-3.5 w-3.5" />,
    BOTH: <Globe className="h-3.5 w-3.5" />,
  };
  const icon = iconMap[format] ?? <Globe className="h-3.5 w-3.5" />;
  const label = format.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
      {icon}
      {label}
    </span>
  );
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
      <h1 className="text-4xl font-bold tracking-tight">{session.title}</h1>

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
        {session.sessionFormat && (
          <FormatBadge format={session.sessionFormat} />
        )}
        {session.intendedAudience && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-muted-foreground">
            {session.intendedAudience}
          </span>
        )}
        {session.hasRecording && (
          <span className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm text-emerald-600 dark:text-emerald-400">
            <Video className="h-3.5 w-3.5" />
            Recording Available
          </span>
        )}
        {session.sessionUrl && (
          <a
            href={session.sessionUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1.5 border border-border text-sm hover:bg-muted/30 transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            View Session
          </a>
        )}
      </div>

      {/* Speakers */}
      {session.speaker.length > 0 && (
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <div className="flex flex-wrap gap-2">
            {session.speaker.map((name) => (
              <span
                key={name}
                className="px-2.5 py-1 bg-muted rounded-md text-sm"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {(session.topic.length > 0 ||
        session.technology.length > 0 ||
        session.affiliation.length > 0) && (
        <div className="space-y-3">
          {session.topic.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Topics
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {session.topic.map((t) => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            </div>
          )}
          {session.technology.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Technologies
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {session.technology.map((t) => (
                  <Badge key={t} variant="secondary">{t}</Badge>
                ))}
              </div>
            </div>
          )}
          {session.affiliation.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Affiliations
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {session.affiliation.map((a) => (
                  <Badge key={a} variant="secondary">{a}</Badge>
                ))}
              </div>
            </div>
          )}
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
