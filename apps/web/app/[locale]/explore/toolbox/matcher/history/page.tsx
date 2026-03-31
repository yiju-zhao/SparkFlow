import { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HistoryTable } from "@/components/explore/toolbox/matcher/history/history-table";

export const metadata: Metadata = {
  title: "Match History | SparkFlow",
  description: "View your past matching jobs and download results",
};

export default async function MatchHistoryPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-100">
        <p className="text-muted-foreground">Please sign in to view your history.</p>
      </div>
    );
  }

  const jobs = await prisma.matchJob.findMany({
    where: { userId: session.user.id },
    include: {
      instance: {
        select: {
          name: true,
          venue: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Serialize for client component
  const serializedJobs = jobs.map((job) => ({
    id: job.id,
    targetType: job.targetType,
    status: job.status,
    queryCount: job.queryCount,
    matchCount: job.matchCount,
    topK: job.topK,
    searchK: job.searchK,
    progress: job.progress,
    queryData: job.queryData as any,
    createdAt: job.createdAt.toISOString(),
    instance: {
      name: job.instance.name,
      venue: { name: job.instance.venue.name },
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground mb-2 font-mono">
          ~/research-hub/toolbox/query-matcher/history
        </p>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Match History
            </h1>
            <p className="text-muted-foreground">
              View your past matching jobs and download results.
            </p>
          </div>
          <Link href="/explore/toolbox/matcher">
            <Button variant="outline">New Match</Button>
          </Link>
        </div>
      </div>

      {serializedJobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
          <p className="text-muted-foreground mb-4">No matching jobs yet.</p>
          <Link href="/explore/toolbox/matcher">
            <Button>Create Your First Match</Button>
          </Link>
        </div>
      ) : (
        <HistoryTable jobs={serializedJobs} />
      )}
    </div>
  );
}
