"use client";

import { useState } from "react";
import { ArrowUpRight, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConferenceDetail } from "@/lib/explore/types";

interface ConferenceHeroProps {
  conference: ConferenceDetail;
}

export function ConferenceHero({ conference }: ConferenceHeroProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/explore/instances/${conference.id}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        `${conference.venue.name.toLowerCase()}-${conference.year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (date: Date | null) => {
    if (!date) return null;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(date));
  };

  const dateRange =
    conference.startDate && conference.endDate
      ? `${formatDate(conference.startDate)} – ${formatDate(conference.endDate)}`
      : conference.startDate
        ? formatDate(conference.startDate)
        : null;

  return (
    <header className="flex flex-col gap-6 border-b border-sf-line pb-8">
      {/* Breadcrumb */}
      <p className="sf-eyebrow">
        HUB · CONFERENCES · {conference.venue.name.toUpperCase()} {conference.year}
      </p>

      {/* Title row with actions on right */}
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="max-w-[68ch]">
          <h1 className="sf-h1">{conference.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-sf-ink-3">
            {dateRange && <span className="font-mono tabular-nums text-[13px]">{dateRange}</span>}
            {conference.location && (
              <>
                <span className="text-sf-line-strong">·</span>
                <span>📍 {conference.location}</span>
              </>
            )}
            {conference.website && (
              <>
                <span className="text-sf-line-strong">·</span>
                <a
                  href={conference.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sf-accent hover:text-sf-accent-ink transition-colors"
                >
                  Official website
                  <ArrowUpRight className="h-3 w-3" />
                </a>
              </>
            )}
          </div>
          {conference.summary && (
            <p className="sf-lede mt-4 text-[15px]">{conference.summary}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <Button
            variant="default"
            size="sm"
            className="bg-sf-black text-white hover:bg-sf-black/85"
            onClick={handleExport}
            disabled={exporting}
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exporting ? "Exporting…" : "Export to Excel"}
          </Button>
          <Button size="sm" asChild>
            <a href={`/deepdive?venue=${conference.venue.id}&year=${conference.year}`}>
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              DeepDive
            </a>
          </Button>
        </div>
      </div>
    </header>
  );
}
