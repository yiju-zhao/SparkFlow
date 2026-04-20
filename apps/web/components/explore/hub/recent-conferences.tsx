"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { RecentConferenceItem } from "@/lib/explore/types";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function formatDate(date: Date) {
  return dateFormatter.format(date);
}

function formatDateRange(startDate: Date | null, endDate: Date | null, year: number) {
  if (!startDate && !endDate) return `${year}`;
  if (startDate && endDate) return `${formatDate(startDate)} – ${formatDate(endDate)}`;
  if (startDate) return formatDate(startDate);
  return endDate ? formatDate(endDate) : `${year}`;
}

interface RecentConferencesProps {
  conferences: RecentConferenceItem[];
}

export function RecentConferences({ conferences }: RecentConferencesProps) {
  const locale = useLocale();
  const t = useTranslations("explore.status");
  const tExplore = useTranslations("explore");

  function getStatus(startDate: Date | null, endDate: Date | null) {
    const now = new Date();
    if (startDate && startDate > now) return { label: t("upcoming"), badge: "sf-badge-soft" };
    if (endDate && endDate < now) return { label: t("completed"), badge: "sf-badge-muted" };
    if (startDate || endDate) return { label: t("ongoing"), badge: "sf-badge-success" };
    return { label: t("scheduled"), badge: "sf-badge-muted" };
  }

  if (!conferences.length) {
    return (
      <div className="sf-card border-dashed text-sf-ink-4 text-sm py-8">
        {tExplore("noRecentConferences")}
      </div>
    );
  }

  return (
    <div className="sf-keyline">
      {conferences.map((conference) => {
        const dateLabel = formatDateRange(
          conference.startDate,
          conference.endDate,
          conference.year,
        );
        const status = getStatus(conference.startDate, conference.endDate);

        return (
          <Link
            key={conference.id}
            href={`/${locale}/explore/conferences/${conference.id}`}
            className="sf-keyline-row group hover:bg-sf-surface-muted transition-colors"
          >
            <span className="time w-16">#{conference.year}</span>
            <div className="flex-1 min-w-0">
              <div className="title truncate">{conference.name}</div>
              <div className="meta mt-0.5 truncate">
                {dateLabel}
                {conference.location ? ` · ${conference.location}` : ""}
              </div>
            </div>
            <span className={`sf-badge ${status.badge}`}>{status.label}</span>
            <div className="text-right hidden sm:block">
              <p className="font-mono tabular-nums text-[12px] font-semibold text-sf-ink">
                {conference.sessionCount} {tExplore("stats.sessions")}
              </p>
              <p className="font-mono tabular-nums text-[12px] font-semibold text-sf-ink">
                {conference.publicationCount} {tExplore("stats.publications")}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
