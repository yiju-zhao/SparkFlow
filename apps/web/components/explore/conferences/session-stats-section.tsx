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
const SessionSpeakerChart = dynamic(
  () =>
    import("./charts/session-speaker-chart").then((m) => ({
      default: m.SessionSpeakerChart,
    })),
  { loading: () => <ChartSkeleton className="h-100" />, ssr: false },
);
const SessionTopicChart = dynamic(
  () =>
    import("./charts/session-topic-chart").then((m) => ({
      default: m.SessionTopicChart,
    })),
  { loading: () => <ChartSkeleton className="h-100" />, ssr: false },
);
const SessionTimeHeatmap = dynamic(
  () =>
    import("./charts/session-time-heatmap").then((m) => ({
      default: m.SessionTimeHeatmap,
    })),
  { loading: () => <ChartSkeleton className="h-80" />, ssr: false },
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

  // Top speakers
  const speakerCounts = new Map<string, number>();
  for (const s of sessions) {
    for (const sp of s.speaker) {
      if (sp) speakerCounts.set(sp, (speakerCounts.get(sp) || 0) + 1);
    }
  }
  const speakerData = Array.from(speakerCounts.entries())
    .map(([speaker, count]) => ({ speaker, count }))
    .sort((a, b) => b.count - a.count);

  // Topic distribution
  const topicCounts = new Map<string, number>();
  for (const s of sessions) {
    for (const t of s.topic) {
      if (t) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
    }
  }
  const topicData = Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count);

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

  // Sort days chronologically using the dailyData order
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

  return { typeData, dailyData, speakerData, topicData, heatmapData, days, hours };
}

export function SessionStatsSection({ sessions }: SessionStatsSectionProps) {
  const stats = useMemo(() => computeStats(sessions), [sessions]);

  const hasTypes = stats.typeData.length > 1;
  const hasDays = stats.dailyData.length > 1;
  const hasSpeakers = stats.speakerData.length > 0;
  const hasTopics = stats.topicData.length > 0;
  const hasHeatmap = stats.heatmapData.length > 0;

  // Don't render stats section if no meaningful data
  if (!hasTypes && !hasDays && !hasSpeakers && !hasTopics) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: Type Pie + Daily Bar + Heatmap */}
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

      {/* Row 2: Speakers + Topics */}
      {(hasSpeakers || hasTopics) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {hasSpeakers && (
            <div className="bg-card rounded-lg p-6">
              <h3 className="text-sm font-semibold text-foreground/80 mb-4">
                Top Speakers
              </h3>
              <div className="h-100">
                <SessionSpeakerChart data={stats.speakerData} />
              </div>
            </div>
          )}
          {hasTopics && (
            <div className="bg-card rounded-lg p-6">
              <h3 className="text-sm font-semibold text-foreground/80 mb-4">
                Topic Coverage
              </h3>
              <div className="h-100">
                <SessionTopicChart data={stats.topicData} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
