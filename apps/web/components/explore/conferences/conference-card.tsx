import Link from "next/link";
import type { ConferenceCard as ConferenceCardType } from "@/lib/explore/types";

interface ConferenceCardProps {
  conference: ConferenceCardType;
}

// Deterministic hue picker so each venue gets a stable hero tone.
function venueHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const hues = [222, 238, 214, 248, 200, 230];
  return hues[Math.abs(h) % hues.length];
}

export function ConferenceCard({ conference }: ConferenceCardProps) {
  const hue = venueHue(conference.venue.name);

  return (
    <Link
      href={`/explore/conferences/${conference.id}`}
      className="group block sf-card card-hoverable p-0 overflow-hidden"
    >
      {/* Hero band with venue name */}
      <div
        className="relative flex aspect-[16/9] items-end px-5 py-4"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 62% 18%), hsl(${hue + 12} 62% 10%))`,
        }}
      >
        <span className="sf-badge sf-badge-blue absolute left-3 top-3">{conference.year}</span>
        <div className="relative flex flex-col">
          <span className="font-extrabold text-white text-xl tracking-tight leading-tight">
            {conference.venue.name}
          </span>
          <span className="font-mono text-[11px] tracking-widest text-white/60 mt-1">
            #{conference.year}
          </span>
        </div>
        {/* Subtle grid overlay for texture */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(255,255,255,0.35) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-sf-line p-3 text-center">
            <div className="font-extrabold text-sf-ink text-[20px] tabular-nums leading-none">
              {conference.publicationCount.toLocaleString()}
            </div>
            <div className="sf-eyebrow mt-2">Publications</div>
          </div>
          <div className="rounded-lg border border-sf-line p-3 text-center">
            <div className="font-extrabold text-sf-ink text-[20px] tabular-nums leading-none">
              {conference.sessionCount.toLocaleString()}
            </div>
            <div className="sf-eyebrow mt-2">Sessions</div>
          </div>
        </div>

        {conference.topTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {conference.topTopics.slice(0, 4).map((topic) => (
              <span key={topic} className="sf-badge sf-badge-soft">
                {topic}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
