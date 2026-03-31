"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { StatsCard } from "@/components/explore/shared";
import { Building2, FileText, Calendar, TrendingUp } from "lucide-react";
import type { GlobalStats } from "@/lib/explore/types";

interface GlobalStatsProps {
  stats: GlobalStats;
}

export function GlobalStats({ stats }: GlobalStatsProps) {
  const t = useTranslations("explore.stats");

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 items-stretch">
      <Link href="/explore/conferences" className="block h-full">
        <StatsCard
          title={t("conferences")}
          value={stats.conferences.toLocaleString()}
          icon={<Building2 className="h-5 w-5" />}
        />
      </Link>
      <Link href="/explore/publications" className="block h-full">
        <StatsCard
          title={t("publications")}
          value={stats.publications.toLocaleString()}
          icon={<FileText className="h-5 w-5" />}
        />
      </Link>
      <Link href="/explore/sessions" className="block h-full">
        <StatsCard
          title={t("sessions")}
          value={stats.sessions.toLocaleString()}
          icon={<Calendar className="h-5 w-5" />}
        />
      </Link>
      <StatsCard
        title={t("yearsCovered")}
        value={
          stats.yearsRange ? stats.yearsRange.max - stats.yearsRange.min + 1 : 0
        }
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  );
}
