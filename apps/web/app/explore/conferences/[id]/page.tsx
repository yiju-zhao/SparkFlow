import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getConference,
  getConferenceStats,
  getSessions,
} from "@/lib/explore/queries";
import { ConferenceHero } from "@/components/explore/conferences";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface PageProps {
  params: Promise<{ id: string }>;
}

import { PublicationStatsSection } from "@/components/explore/conferences/publication-stats-section";

async function SessionsSection({ conferenceId }: { conferenceId: string }) {
  const result = await getSessions({
    conference: conferenceId,
    page: 0,
    sortBy: "date",
    sortDir: "asc",
  });

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Showing {result.data.length} of {result.total} sessions
      </p>
      <div className="space-y-8">
        {Object.entries(
          result.data.reduce(
            (acc, session) => {
              const date = session.date
                ? new Date(session.date).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })
                : "Unscheduled";
              if (!acc[date]) acc[date] = [];
              acc[date].push(session);
              return acc;
            },
            {} as Record<string, typeof result.data>,
          ),
        ).map(([date, sessions]) => (
          <div key={date}>
            <div className="flex items-center gap-3 mb-4 sticky top-0 bg-secondary/95 backdrop-blur py-3 z-10">
              <div className="h-px flex-1 bg-border" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                {date}
              </h3>
              <div className="h-px flex-1 bg-border" />
            </div>
            <div className="bg-card rounded-lg divide-y divide-border">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="relative group p-4 hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg flex gap-4"
                >
                  <div className="w-28 shrink-0 text-sm text-muted-foreground pt-0.5 tabular-nums">
                    {session.startTime || "TBD"}
                    {session.endTime && (
                      <>
                        <span className="text-border mx-1">–</span>
                        {session.endTime}
                      </>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <h4 className="font-medium leading-snug">
                        <Link
                          href={`/explore/sessions/${session.id}`}
                          className="after:absolute after:inset-0 hover:underline decoration-foreground/20 underline-offset-2"
                        >
                          {session.title}
                        </Link>
                      </h4>
                      {session.type && (
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {session.type}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ConferenceDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [conference, stats] = await Promise.all([
    getConference(id),
    getConferenceStats(id),
  ]);

  if (!conference) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-10">
      <ConferenceHero conference={conference} />

      <Tabs defaultValue="publications" className="relative">
        <TabsList className="bg-transparent rounded-none w-full justify-start h-auto p-0 gap-4">
          <TabsTrigger
            value="publications"
            className="rounded-none border border-transparent bg-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground px-4 py-2 text-sm font-medium shadow-none transition-colors"
          >
            Publications
          </TabsTrigger>
          <TabsTrigger
            value="sessions"
            className="rounded-none border border-transparent bg-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground px-4 py-2 text-sm font-medium shadow-none transition-colors"
          >
            Sessions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="publications" className="mt-8">
          <Suspense fallback={<ContentSkeleton />}>
            <PublicationStatsSection
              venueId={conference.venue.id}
              year={conference.year}
              stats={stats}
            />
          </Suspense>
        </TabsContent>

        <TabsContent value="sessions" className="mt-8">
          <Suspense fallback={<ContentSkeleton />}>
            <SessionsSection conferenceId={id} />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContentSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-40 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-4 w-32" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
