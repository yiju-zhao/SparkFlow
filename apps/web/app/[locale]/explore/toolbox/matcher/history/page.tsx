import { Metadata } from "next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { HistoryTable } from "@/components/explore/toolbox/matcher/history/history-table";
import type { ParsedQuery } from "@/lib/matcher/types";
import { FileSearch, Plus } from "lucide-react";

export const metadata: Metadata = {
  title: "Match History | SparkFlow",
  description: "View your past matching jobs and download results",
};

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function MatchHistoryPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <div className="flex flex-col items-center justify-center min-h-80">
        <p className="text-sf-ink-3">Please sign in to view your history.</p>
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

  const serializedJobs = jobs.map((job) => {
    const queryData = job.queryData ? (JSON.parse(String(job.queryData)) as ParsedQuery[]) : null;
    return {
      id: job.id,
      targetType: job.targetType,
      status: job.status,
      queryCount: job.queryCount,
      matchCount: job.matchCount,
      topK: job.topK,
      searchK: job.searchK,
      progress: job.progress,
      queryData,
      createdAt: job.createdAt.toISOString(),
      instance: {
        name: job.instance.name,
        venue: { name: job.instance.venue.name },
      },
    };
  });

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="mb-10">
        <p className="text-sf-accent text-xs font-bold uppercase tracking-[0.22em] mb-3">
          Toolbox · Query Matcher · History
        </p>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-[36px] md:text-[48px] font-black text-sf-ink tracking-[-0.025em] leading-[1.03]">
              Match History
            </h1>
            <p className="mt-3 max-w-[64ch] text-lg leading-relaxed text-sf-ink-3">
              View your past matching jobs, inspect query data, and download results.
            </p>
          </div>
          <Link href={`/${locale}/explore/toolbox/matcher`}>
            <Button className="gap-2 h-10">
              <Plus className="h-4 w-4" />
              New Match
            </Button>
          </Link>
        </div>
      </section>

      {/* Meta row */}
      <div className="flex items-baseline justify-between mb-4 border-b border-sf-line pb-4">
        <p className="font-mono text-sf-accent text-[11px] font-bold tracking-[0.2em]">JOBS</p>
        <p className="text-sm text-sf-ink-3">
          <span className="font-bold text-sf-ink tabular-nums">{serializedJobs.length}</span> total
        </p>
      </div>

      {serializedJobs.length === 0 ? (
        <div className="sf-card border-dashed flex flex-col items-center justify-center py-16 text-center gap-4">
          <span className="sf-icon-tile h-12 w-12">
            <FileSearch className="h-5 w-5" strokeWidth={1.5} />
          </span>
          <div>
            <h3 className="sf-h3">No matching jobs yet</h3>
            <p className="sf-meta mt-1.5">
              Upload a query file, pick a target conference, and run your first match.
            </p>
          </div>
          <Link href={`/${locale}/explore/toolbox/matcher`}>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Your First Match
            </Button>
          </Link>
        </div>
      ) : (
        <HistoryTable jobs={serializedJobs} />
      )}
    </div>
  );
}
