import { Suspense } from "react";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import {
  getGlobalStats,
  getYearTrendData,
  getTopicsChartData,
  getRecentConferences,
} from "@/lib/explore/queries";
import { GlobalStats, RecentConferences } from "@/components/explore/hub";
import { ChartsSection } from "@/components/explore/hub/charts-section";

import { Skeleton } from "@/components/ui/skeleton";

interface ExplorePageProps {
  params: Promise<{ locale: string }>;
}

async function StatsSection() {
  const stats = await getGlobalStats();
  return <GlobalStats stats={stats} />;
}

async function ChartsSectionWrapper() {
  const [yearData, topicsData] = await Promise.all([getYearTrendData(), getTopicsChartData()]);
  return <ChartsSection yearData={yearData} topicsData={topicsData} />;
}

async function RecentConferencesSection() {
  const conferences = await getRecentConferences(5);
  return <RecentConferences conferences={conferences} />;
}

export default async function ExplorePage({ params }: ExplorePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("explore");

  return (
    <div className="flex flex-col gap-10">
      {/* Header block — eyebrow / h1 / lede / meta */}
      <header className="flex flex-col gap-3">
        <p className="sf-eyebrow">{t("breadcrumb")}</p>
        <h1 className="sf-h1">{t("title")}</h1>
        <p className="sf-lede max-w-[72ch]">{t("subtitle")}</p>
      </header>

      {/* Stats overview — 4-up */}
      <section>
        <Suspense fallback={<StatsSkeleton />}>
          <StatsSection />
        </Suspense>
      </section>

      {/* Analytics — 2-up */}
      <section>
        <Suspense fallback={<ChartsSkeleton />}>
          <ChartsSectionWrapper />
        </Suspense>
      </section>

      {/* Recent conferences keyline */}
      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between border-b border-sf-line pb-3">
          <div>
            <p className="sf-eyebrow">{t("recentConferences")}</p>
            <h2 className="sf-h3 mt-1">Latest conference activity</h2>
          </div>
          <Link
            href={`/${locale}/explore/conferences`}
            className="text-sm font-medium text-sf-accent hover:text-sf-accent-ink transition-colors"
          >
            {t("viewAll")} →
          </Link>
        </div>
        <Suspense fallback={<RecentConferencesSkeleton />}>
          <RecentConferencesSection />
        </Suspense>
      </section>
    </div>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-[10px]" />
      ))}
    </div>
  );
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="sf-card">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
      <div className="sf-card">
        <Skeleton className="h-5 w-40 mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}

function RecentConferencesSkeleton() {
  return (
    <div className="sf-keyline">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="sf-keyline-row">
          <Skeleton className="h-4 w-12" />
          <div className="flex-1">
            <Skeleton className="h-4 w-56 mb-2" />
            <Skeleton className="h-3 w-40" />
          </div>
          <Skeleton className="h-5 w-20 rounded-md" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
