import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  getConference,
  getConferenceStats,
  getConferenceSessions,
} from "@/lib/explore/queries";
import { ConferenceHero, SessionCalendar } from "@/components/explore/conferences";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { SetAIContext } from "@/components/explore/set-ai-context";

interface PageProps {
  params: Promise<{ id: string }>;
}

import { PublicationStatsSection } from "@/components/explore/conferences/publication-stats-section";

async function SessionsCalendarSection({ conferenceId }: { conferenceId: string }) {
  const sessions = await getConferenceSessions(conferenceId);
  return <SessionCalendar sessions={sessions} />;
}

export default async function ConferenceDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [conference, stats, tDetail] = await Promise.all([
    getConference(id),
    getConferenceStats(id),
    getTranslations("explore.conferenceDetail"),
  ]);

  if (!conference) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-10">
      <SetAIContext
        context={{
          conferenceId: id,
          conferenceName: `${conference.venue.name} ${conference.year}`,
        }}
      />
      <ConferenceHero conference={conference} />

      <Tabs defaultValue={stats.publicationCount === 0 && stats.sessionCount > 0 ? "sessions" : "publications"} className="relative">
        <TabsList className="bg-transparent rounded-none w-full justify-start h-auto p-0 gap-4">
          <TabsTrigger
            value="publications"
            className="rounded-none border border-transparent bg-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground px-4 py-2 text-sm font-medium shadow-none transition-colors"
          >
            {tDetail("tabPublications")}
            <span className="ml-1.5 tabular-nums">
              ({stats.publicationCount.toLocaleString()})
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="sessions"
            className="rounded-none border border-transparent bg-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground px-4 py-2 text-sm font-medium shadow-none transition-colors"
          >
            {tDetail("tabSessions")}
            <span className="ml-1.5 tabular-nums">
              ({stats.sessionCount.toLocaleString()})
            </span>
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
            <SessionsCalendarSection conferenceId={id} />
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
