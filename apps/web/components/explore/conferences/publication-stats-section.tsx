"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { ConferenceStats } from "@/lib/explore/types";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={`w-full ${className || "h-70"}`} />;
}

const StatusPieChart = dynamic(
  () => import("./charts/status-pie-chart").then((m) => ({ default: m.StatusPieChart })),
  { loading: () => <ChartSkeleton />, ssr: false },
);
const KeywordCloud = dynamic(
  () => import("./charts/keyword-cloud").then((m) => ({ default: m.KeywordCloud })),
  { loading: () => <ChartSkeleton />, ssr: false },
);
const AffiliationBarChart = dynamic(
  () => import("./charts/affiliation-bar-chart").then((m) => ({ default: m.AffiliationBarChart })),
  { loading: () => <ChartSkeleton className="h-100" />, ssr: false },
);
const CountryBarChart = dynamic(
  () => import("./charts/country-bar-chart").then((m) => ({ default: m.CountryBarChart })),
  { loading: () => <ChartSkeleton className="h-100" />, ssr: false },
);
const TopicBarChart = dynamic(
  () => import("./charts/topic-bar-chart").then((m) => ({ default: m.TopicBarChart })),
  { loading: () => <ChartSkeleton />, ssr: false },
);
const CollaborationNetwork = dynamic(
  () => import("./charts/collaboration-network").then((m) => ({ default: m.CollaborationNetwork })),
  { loading: () => <ChartSkeleton className="h-100" />, ssr: false },
);

interface PublicationStatsSectionProps {
  venueId: string;
  year: number;
  stats: ConferenceStats;
}

export function PublicationStatsSection({ venueId, year, stats }: PublicationStatsSectionProps) {
  return (
    <div className="flex flex-col gap-10">
      {/* Dashboard Panel */}
      <div className="flex flex-col gap-6">
        {/* Row 1: Pie + Word Cloud + Topics — evenly spaced */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div className="bg-card rounded-lg p-6">
            <div className="h-70">
              <StatusPieChart data={stats.statusBreakdown} />
            </div>
          </div>
          <div className="bg-card rounded-lg p-6">
            <div className="h-70">
              <KeywordCloud data={stats.topKeywords} className="min-h-0" />
            </div>
          </div>
          <div className="bg-card rounded-lg p-6">
            <div className="h-70">
              <TopicBarChart data={stats.topTopics} />
            </div>
          </div>
        </div>

        {/* Row 2: Affiliation Bar (left) + Org Network (right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg p-6">
            <div className="h-100">
              <AffiliationBarChart data={stats.topAffiliations} />
            </div>
          </div>
          <div className="bg-card rounded-lg p-6">
            <div className="h-100">
              <CollaborationNetwork
                data={stats.orgCollaboration}
                title="Organization Collaboration Network"
                nodeColor="#3b82f6"
              />
            </div>
          </div>
        </div>

        {/* Row 3: Country Bar (left) + Geo Network (right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg p-6">
            <div className="h-100">
              <CountryBarChart data={stats.topCountries} />
            </div>
          </div>
          <div className="bg-card rounded-lg p-6">
            <div className="h-100">
              <CollaborationNetwork
                data={stats.geoCollaboration}
                title="Geographic Collaboration Network"
                nodeColor="#22c55e"
              />
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <div className="flex justify-center">
        <Button size="lg" asChild className="group">
          <Link href={`/explore/publications?venue=${venueId}&year=${year}`}>
            View All {stats.publicationCount.toLocaleString()} Publications
            <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
