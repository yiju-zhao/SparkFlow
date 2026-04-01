"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CalendarSessionItem } from "@/lib/explore/types";

// 10-color palette, muted tones, dark-mode compatible
const TYPE_PALETTE = [
  "#6366f1", // indigo
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
  "#ec4899", // pink
  "#14b8a6", // teal
  "#a855f7", // purple
];

function buildTypeColorMap(sessions: CalendarSessionItem[]): Map<string, string> {
  const map = new Map<string, string>();
  let idx = 0;
  for (const s of sessions) {
    if (s.type && !map.has(s.type)) {
      map.set(s.type, TYPE_PALETTE[idx % TYPE_PALETTE.length]);
      idx++;
    }
  }
  return map;
}

function formatDateTab(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getHourKey(startTime: string | null): string | null {
  if (!startTime) return null;
  // startTime is like "09:00" or "09:30" or "9:00 AM"
  const match = startTime.match(/^(\d{1,2})/);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  return `${hour.toString().padStart(2, "0")}:00`;
}

interface SessionCardProps {
  session: CalendarSessionItem;
  color: string;
}

function SessionCard({ session, color }: SessionCardProps) {
  return (
    <div
      className="w-70 shrink-0 rounded-lg bg-card border border-border hover:bg-muted/30 transition-colors"
      style={{ borderLeftWidth: 4, borderLeftColor: color }}
    >
      <Link
        href={`/explore/sessions/${session.id}`}
        className="block p-3 space-y-2"
      >
        <h4 className="font-medium text-sm leading-snug line-clamp-2">
          {session.title}
        </h4>
        {(session.startTime || session.endTime) && (
          <p className="text-xs text-muted-foreground tabular-nums">
            {session.startTime}
            {session.endTime && ` – ${session.endTime}`}
          </p>
        )}
        {session.location && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{session.location}</span>
          </p>
        )}
        {session.speaker.length > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />
            <span className="truncate">
              {session.speaker.slice(0, 2).join(", ")}
              {session.speaker.length > 2 &&
                ` +${session.speaker.length - 2}`}
            </span>
          </p>
        )}
      </Link>
    </div>
  );
}

interface SessionCalendarProps {
  sessions: CalendarSessionItem[];
}

export function SessionCalendar({ sessions }: SessionCalendarProps) {
  const typeColorMap = useMemo(() => buildTypeColorMap(sessions), [sessions]);

  // Group sessions by date string key
  const { dateGroups, dateKeys, unscheduled } = useMemo(() => {
    const groups = new Map<string, CalendarSessionItem[]>();
    const noDate: CalendarSessionItem[] = [];

    for (const s of sessions) {
      if (!s.date) {
        noDate.push(s);
        continue;
      }
      // Normalize to date-only string for grouping
      const d = new Date(s.date);
      const key = d.toISOString().split("T")[0]; // "2026-03-17"
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    // Sort date keys chronologically
    const sortedKeys = Array.from(groups.keys()).sort();

    return { dateGroups: groups, dateKeys: sortedKeys, unscheduled: noDate };
  }, [sessions]);

  const allTabKeys = [
    ...dateKeys,
    ...(unscheduled.length > 0 ? ["unscheduled"] : []),
  ];

  const [activeTab, setActiveTab] = useState(allTabKeys[0] ?? "unscheduled");

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No sessions available.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Type color legend */}
      {typeColorMap.size > 0 && (
        <div className="flex flex-wrap gap-3">
          {Array.from(typeColorMap.entries()).map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-2.5 w-2.5 rounded-full shrink-0"
                style={{ backgroundColor: color }}
              />
              {type}
            </div>
          ))}
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-transparent rounded-none w-full justify-start h-auto p-0 gap-1 overflow-x-auto flex-nowrap">
          {dateKeys.map((key) => (
            <TabsTrigger
              key={key}
              value={key}
              className="rounded-none border border-transparent bg-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground px-3 py-1.5 text-sm font-medium shadow-none transition-colors whitespace-nowrap shrink-0"
            >
              {formatDateTab(new Date(key + "T00:00:00"))}
            </TabsTrigger>
          ))}
          {unscheduled.length > 0 && (
            <TabsTrigger
              value="unscheduled"
              className="rounded-none border border-transparent bg-transparent data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:border-primary data-[state=inactive]:border-border data-[state=inactive]:text-muted-foreground px-3 py-1.5 text-sm font-medium shadow-none transition-colors whitespace-nowrap shrink-0"
            >
              Unscheduled
            </TabsTrigger>
          )}
        </TabsList>

        {dateKeys.map((key) => (
          <TabsContent key={key} value={key} className="mt-6">
            <TimeSlotGrid
              sessions={dateGroups.get(key) ?? []}
              typeColorMap={typeColorMap}
            />
          </TabsContent>
        ))}

        {unscheduled.length > 0 && (
          <TabsContent value="unscheduled" className="mt-6">
            <TimeSlotGrid
              sessions={unscheduled}
              typeColorMap={typeColorMap}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

interface TimeSlotGridProps {
  sessions: CalendarSessionItem[];
  typeColorMap: Map<string, string>;
}

function TimeSlotGrid({ sessions, typeColorMap }: TimeSlotGridProps) {
  const { hourGroups, hourKeys, noTime } = useMemo(() => {
    const groups = new Map<string, CalendarSessionItem[]>();
    const other: CalendarSessionItem[] = [];

    for (const s of sessions) {
      const hourKey = getHourKey(s.startTime);
      if (!hourKey) {
        other.push(s);
        continue;
      }
      if (!groups.has(hourKey)) groups.set(hourKey, []);
      groups.get(hourKey)!.push(s);
    }

    const sortedKeys = Array.from(groups.keys()).sort();
    return { hourGroups: groups, hourKeys: sortedKeys, noTime: other };
  }, [sessions]);

  return (
    <div className="space-y-4">
      {hourKeys.map((hour) => (
        <div key={hour} className="flex gap-4">
          <div className="w-16 shrink-0 pt-3 text-sm font-medium text-muted-foreground tabular-nums">
            {hour}
          </div>
          <div className="flex-1 flex gap-3 overflow-x-auto pb-2">
            {(hourGroups.get(hour) ?? []).map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                color={s.type ? typeColorMap.get(s.type) ?? "#71717a" : "#71717a"}
              />
            ))}
          </div>
        </div>
      ))}
      {noTime.length > 0 && (
        <div className="flex gap-4">
          <div className="w-16 shrink-0 pt-3 text-sm font-medium text-muted-foreground">
            Other
          </div>
          <div className="flex-1 flex gap-3 overflow-x-auto pb-2">
            {noTime.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                color={s.type ? typeColorMap.get(s.type) ?? "#71717a" : "#71717a"}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
