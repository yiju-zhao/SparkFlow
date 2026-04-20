import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import type { ConferenceCard as ConferenceCardType } from "@/lib/explore/types";

interface ConferenceCardProps {
  conference: ConferenceCardType;
}

// Deterministic hue → each venue gets a stable hero tone.
function venueHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hues = [222, 238, 214, 248, 200, 230, 260, 192];
  return hues[Math.abs(h) % hues.length];
}

function computeStatus(startDate: Date | null, endDate: Date | null) {
  const now = new Date();
  if (startDate && new Date(startDate) > now) {
    return { label: "Upcoming", tone: "bg-sf-accent text-white" as const };
  }
  if (endDate && new Date(endDate) < now) {
    return { label: "Completed", tone: "bg-sf-black text-white" as const };
  }
  if (startDate || endDate) {
    return { label: "Ongoing", tone: "bg-sf-success text-white" as const };
  }
  return { label: "Scheduled", tone: "bg-sf-ink-3 text-white" as const };
}

function formatDateRange(startDate: Date | null, endDate: Date | null, year: number) {
  if (!startDate && !endDate) return String(year);
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
  if (startDate && endDate) return `${fmt(new Date(startDate))} – ${fmt(new Date(endDate))}`;
  if (startDate) return fmt(new Date(startDate));
  return endDate ? fmt(new Date(endDate)) : String(year);
}

export function ConferenceCard({ conference }: ConferenceCardProps) {
  const hue = venueHue(conference.venue.name);
  const status = computeStatus(conference.startDate, conference.endDate);
  const dateRange = formatDateRange(conference.startDate, conference.endDate, conference.year);

  return (
    <Link
      href={`/explore/conferences/${conference.id}`}
      className="group flex flex-col bg-sf-surface border border-sf-line rounded-[10px] overflow-hidden transition-all duration-300 hover:border-sf-line-strong hover:shadow-[0_20px_40px_-20px_rgba(16,24,40,0.18)]"
    >
      {/* Hero band — venue-colored gradient, reveals richer color on hover */}
      <div className="relative h-40 overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 transition-transform duration-500 group-hover:scale-[1.04]"
          style={{
            background: `linear-gradient(135deg, hsl(${hue} 60% 22%), hsl(${hue + 18} 66% 10%))`,
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.22) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        {/* Venue wordmark faint in center */}
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center font-black text-white/10 text-[64px] tracking-[-0.04em] uppercase select-none"
        >
          {conference.venue.name}
        </span>
        {/* Status badge top-left */}
        <div className="absolute top-4 left-4">
          <span
            className={`${status.tone} text-[10px] font-bold uppercase tracking-[0.16em] px-2 py-1 rounded-[3px]`}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 flex flex-col flex-grow">
        {/* Year + location */}
        <div className="flex justify-between items-start mb-2">
          <span className="font-mono text-sm text-sf-accent font-semibold tabular-nums">
            {conference.year}
          </span>
          {conference.location && (
            <div className="flex items-center gap-1 text-sf-ink-3 text-xs">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate max-w-[14ch]">{conference.location}</span>
            </div>
          )}
        </div>

        {/* Conference name */}
        <h3 className="text-xl font-bold text-sf-ink mb-2 leading-tight">{conference.name}</h3>

        {/* Date range */}
        <p className="text-xs text-sf-ink-3 mb-6">{dateRange}</p>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-sf-bg p-3 text-center rounded-[6px]">
            <span className="block text-lg font-bold text-sf-ink tabular-nums">
              {conference.publicationCount.toLocaleString()}
            </span>
            <span className="text-[10px] uppercase font-semibold text-sf-ink-3 tracking-wider">
              Publications
            </span>
          </div>
          <div className="bg-sf-bg p-3 text-center rounded-[6px]">
            <span className="block text-lg font-bold text-sf-ink tabular-nums">
              {conference.sessionCount.toLocaleString()}
            </span>
            <span className="text-[10px] uppercase font-semibold text-sf-ink-3 tracking-wider">
              Sessions
            </span>
          </div>
        </div>

        {/* Top topics */}
        {conference.topTopics.length > 0 && (
          <div className="mb-6">
            <p className="text-[10px] uppercase font-bold text-sf-ink-3 mb-2 tracking-[0.14em]">
              Top Topics
            </p>
            <div className="flex flex-wrap gap-1.5">
              {conference.topTopics.slice(0, 3).map((topic) => (
                <span
                  key={topic}
                  className="px-2 py-0.5 bg-sf-bg-alt text-sf-ink text-[11px] font-medium rounded-[3px]"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Divider + CTA */}
        <div className="mt-auto border-t border-sf-line pt-4 flex justify-between items-center">
          <span className="text-xs font-bold text-sf-accent uppercase tracking-[0.14em] flex items-center gap-1 group-hover:underline">
            Explore Details
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}
