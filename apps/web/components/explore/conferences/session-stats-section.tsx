"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalendarSessionItem } from "@/lib/explore/types";

function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={`w-full ${className || "h-70"}`} />;
}

const SessionTypePieChart = dynamic(
  () =>
    import("./charts/session-type-pie-chart").then((m) => ({
      default: m.SessionTypePieChart,
    })),
  { loading: () => <ChartSkeleton />, ssr: false },
);
const SessionDailyChart = dynamic(
  () =>
    import("./charts/session-daily-chart").then((m) => ({
      default: m.SessionDailyChart,
    })),
  { loading: () => <ChartSkeleton />, ssr: false },
);
const SessionTimeHeatmap = dynamic(
  () =>
    import("./charts/session-time-heatmap").then((m) => ({
      default: m.SessionTimeHeatmap,
    })),
  { loading: () => <ChartSkeleton />, ssr: false },
);

interface SessionStatsSectionProps {
  sessions: CalendarSessionItem[];
}

function computeStats(sessions: CalendarSessionItem[]) {
  // Type distribution
  const typeCounts = new Map<string, number>();
  for (const s of sessions) {
    const type = s.type || "Other";
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }
  const typeData = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // Daily distribution
  const dayCounts = new Map<string, { label: string; count: number }>();
  for (const s of sessions) {
    if (!s.date) continue;
    const d = new Date(s.date);
    const key = d.toISOString().split("T")[0];
    const label = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const existing = dayCounts.get(key);
    if (existing) {
      existing.count++;
    } else {
      dayCounts.set(key, { label, count: 1 });
    }
  }
  const dailyData = Array.from(dayCounts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, { label, count }]) => ({ date, label, count }));

  // Time heatmap (day x hour)
  const heatmapEntries = new Map<string, number>();
  const daySet = new Set<string>();
  const hourSet = new Set<string>();
  for (const s of sessions) {
    if (!s.date || !s.startTime) continue;
    const d = new Date(s.date);
    const dayLabel = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const hourMatch = s.startTime.match(/^(\d{1,2})/);
    if (!hourMatch) continue;
    const hour = `${parseInt(hourMatch[1], 10).toString().padStart(2, "0")}:00`;
    daySet.add(dayLabel);
    hourSet.add(hour);
    const key = `${dayLabel}|${hour}`;
    heatmapEntries.set(key, (heatmapEntries.get(key) || 0) + 1);
  }

  const dayLabelsOrdered = dailyData.map((d) => d.label);
  const days = dayLabelsOrdered.filter((d) => daySet.has(d));
  const hours = Array.from(hourSet).sort();

  const heatmapData: { day: string; hour: string; count: number }[] = [];
  for (const day of days) {
    for (const hour of hours) {
      const count = heatmapEntries.get(`${day}|${hour}`) || 0;
      if (count > 0) {
        heatmapData.push({ day, hour, count });
      }
    }
  }

  return { typeData, dailyData, heatmapData, days, hours };
}

export function SessionStatsSection({ sessions }: SessionStatsSectionProps) {
  const stats = useMemo(() => computeStats(sessions), [sessions]);

  const hasTypes = stats.typeData.length > 1;
  const hasDays = stats.dailyData.length > 1;
  const hasHeatmap = stats.heatmapData.length > 0;

  if (!hasTypes && !hasDays && !hasHeatmap) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
      {hasTypes && (
        <div className="bg-card rounded-lg p-6">
          <h3 className="text-sm font-semibold text-foreground/80 mb-4">
            Session Types
          </h3>
          <div className="h-70">
            <SessionTypePieChart data={stats.typeData} />
          </div>
        </div>
      )}
      {hasDays && (
        <div className="bg-card rounded-lg p-6">
          <h3 className="text-sm font-semibold text-foreground/80 mb-4">
            Daily Distribution
          </h3>
          <div className="h-70">
            <SessionDailyChart data={stats.dailyData} />
          </div>
        </div>
      )}
      {hasHeatmap && (
        <div className="bg-card rounded-lg p-6">
          <h3 className="text-sm font-semibold text-foreground/80 mb-4">
            Schedule Density
          </h3>
          <div className="h-70">
            <SessionTimeHeatmap
              data={stats.heatmapData}
              days={stats.days}
              hours={stats.hours}
            />
          </div>
        </div>
      )}
    </div>
  );
}
