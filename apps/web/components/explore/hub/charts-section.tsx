// apps/web/components/explore/hub/charts-section.tsx

"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

function ChartSkeleton() {
  return (
    <div className="sf-card">
      <Skeleton className="h-5 w-40 mb-4" />
      <Skeleton className="h-65 w-full" />
    </div>
  );
}

// Lazy load chart components (follows bundle-dynamic-imports best practice)
const YearTrendChart = dynamic(
  () => import("./year-trend-chart").then((m) => ({ default: m.YearTrendChart })),
  { loading: () => <ChartSkeleton />, ssr: false },
);

const TopicsChart = dynamic(
  () => import("./topics-chart").then((m) => ({ default: m.TopicsChart })),
  { loading: () => <ChartSkeleton />, ssr: false },
);

interface ChartsSectionProps {
  yearData: { year: number; conferences: number }[];
  topicsData: { topic: string; count: number }[];
}

export function ChartsSection({ yearData, topicsData }: ChartsSectionProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <YearTrendChart data={yearData} />
      <TopicsChart data={topicsData} />
    </div>
  );
}
