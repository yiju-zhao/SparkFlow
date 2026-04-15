// apps/web/components/explore/hub/charts-section.tsx

"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

function ChartSkeleton() {
  return (
    <div className="bg-card rounded-lg p-6">
      <Skeleton className="h-6 w-48 mb-4" />
      <Skeleton className="h-75 w-full" />
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
