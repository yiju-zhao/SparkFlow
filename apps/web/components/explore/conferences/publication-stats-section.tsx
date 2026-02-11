"use client";

import Link from "next/link";
import { ConferenceStats } from "@/lib/explore/types";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { StatusPieChart } from "./charts/status-pie-chart";
import { KeywordCloud } from "./charts/keyword-cloud";
import { AffiliationBarChart } from "./charts/affiliation-bar-chart";
import { CountryBarChart } from "./charts/country-bar-chart";
import { TopicBarChart } from "./charts/topic-bar-chart";
import { CollaborationNetwork } from "./charts/collaboration-network";

interface PublicationStatsSectionProps {
  venueId: string;
  year: number;
  stats: ConferenceStats;
}

export function PublicationStatsSection({
  venueId,
  year,
  stats,
}: PublicationStatsSectionProps) {
  return (
    <div className="flex flex-col gap-10">
      {/* Dashboard Panel */}
      <div className="flex flex-col gap-6">
        {/* Row 1: Pie + Word Cloud + Topics — evenly spaced */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          <div className="bg-card rounded-lg p-6">
            <div className="h-[280px]">
              <StatusPieChart data={stats.statusBreakdown} />
            </div>
          </div>
          <div className="bg-card rounded-lg p-6">
            <div className="h-[280px]">
              <KeywordCloud data={stats.topKeywords} className="min-h-0" />
            </div>
          </div>
          <div className="bg-card rounded-lg p-6">
            <div className="h-[280px]">
              <TopicBarChart data={stats.topTopics} />
            </div>
          </div>
        </div>

        {/* Row 2: Affiliation Bar (left) + Org Network (right) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-lg p-6">
            <div className="h-[400px]">
              <AffiliationBarChart data={stats.topAffiliations} />
            </div>
          </div>
          <div className="bg-card rounded-lg p-6">
            <div className="h-[400px]">
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
            <div className="h-[400px]">
              <CountryBarChart data={stats.topCountries} />
            </div>
          </div>
          <div className="bg-card rounded-lg p-6">
            <div className="h-[400px]">
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
