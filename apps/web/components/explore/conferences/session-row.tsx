"use client";

import Link from "next/link";
import { ArrowUpRight, Clock, ExternalLink, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SessionRowItem {
  id: string;
  title: string;
  type: string | null;
  date: Date | null;
  startTime: string | null;
  endTime: string | null;
  sessionUrl: string | null;
  instance: {
    name: string;
    year: number;
    venue: { name: string };
  };
  location?: string | null;
}

function typeTone(type: string | null | undefined) {
  const s = (type ?? "").toLowerCase();
  if (s.includes("keynote")) return "bg-sf-success-soft text-sf-success";
  if (s.includes("oral")) return "bg-sf-accent-soft text-sf-accent-ink";
  if (s.includes("spotlight")) return "bg-sf-accent text-white";
  if (s.includes("poster")) return "bg-[#EDEEF2] text-sf-ink-3";
  if (s.includes("workshop") || s.includes("tutorial")) return "bg-sf-warn-soft text-sf-warn";
  if (s.includes("panel")) return "bg-sf-black text-white";
  return "bg-[#EDEEF2] text-sf-ink-3";
}

function formatDateTime(date: Date | null, startTime: string | null, endTime: string | null) {
  const parts: string[] = [];
  if (date) {
    parts.push(
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(date)),
    );
  }
  if (startTime) {
    parts.push(endTime ? `${startTime} – ${endTime}` : startTime);
  }
  return parts.join(" · ");
}

export function SessionRow({ locale, session }: { locale: string; session: SessionRowItem }) {
  const venueTag = `${session.instance.venue.name} ${session.instance.year}`;
  const when = formatDateTime(session.date, session.startTime, session.endTime);

  return (
    <article className="bg-sf-surface border border-sf-line p-6 rounded-[10px] flex flex-col md:flex-row gap-6 transition-all hover:border-sf-line-strong hover:shadow-[0_12px_32px_-16px_rgba(16,24,40,0.14)]">
      {/* Left — content */}
      <div className="flex-grow space-y-3 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold text-sf-accent uppercase tracking-[0.16em]">
            {venueTag}
          </span>
          {session.type && (
            <span
              className={cn(
                "px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] rounded-[3px]",
                typeTone(session.type),
              )}
            >
              {session.type}
            </span>
          )}
          {when && (
            <span className="text-xs text-sf-ink-4 font-mono tabular-nums flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {when}
            </span>
          )}
        </div>

        <h2 className="text-[18px] md:text-[19px] font-bold text-sf-ink leading-snug">
          <Link
            href={`/${locale}/explore/conferences/sessions/${session.id}`}
            className="hover:text-sf-accent transition-colors"
          >
            {session.title}
          </Link>
        </h2>

        {session.location && (
          <p className="text-sm text-sf-ink-3 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-sf-ink-4" />
            {session.location}
          </p>
        )}

        {session.sessionUrl && (
          <div className="flex items-center gap-2 pt-1">
            <a
              href={session.sessionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sf-ink-2 bg-sf-bg-alt px-3 py-1.5 hover:bg-sf-line rounded-[6px] transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Session Link
            </a>
          </div>
        )}
      </div>

      {/* Right — date block + open arrow */}
      <div className="flex flex-row md:flex-col items-end justify-between md:min-w-[120px] shrink-0">
        {session.date ? (
          <div className="text-right">
            <div className="font-extrabold text-sf-accent text-[22px] md:text-[26px] leading-none tabular-nums">
              {new Date(session.date).toLocaleDateString("en-US", {
                day: "numeric",
              })}
            </div>
            <div className="text-[10px] font-bold text-sf-ink-4 uppercase tracking-[0.14em] mt-1.5">
              {new Date(session.date).toLocaleDateString("en-US", {
                month: "short",
                year: "numeric",
              })}
            </div>
          </div>
        ) : (
          <div className="text-right">
            <div className="text-[16px] font-mono tabular-nums text-sf-ink-4">
              {session.instance.year}
            </div>
            <div className="text-[10px] font-bold text-sf-ink-4 uppercase tracking-[0.14em] mt-1.5">
              TBD
            </div>
          </div>
        )}
        <Link
          href={`/${locale}/explore/conferences/sessions/${session.id}`}
          className="p-1 text-sf-ink-4 hover:text-sf-accent transition-colors"
          aria-label="Open session"
        >
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}
