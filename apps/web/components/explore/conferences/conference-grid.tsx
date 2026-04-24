// apps/web/components/explore/conferences/conference-grid.tsx

import { ConferenceCard } from "./conference-card";
import { EmptyState } from "@/components/explore/shared";
import type { ConferenceCard as ConferenceCardType } from "@/lib/explore/types";

interface ConferenceGridProps {
  conferences: ConferenceCardType[];
}

export function ConferenceGrid({ conferences }: ConferenceGridProps) {
  if (conferences.length === 0) {
    return (
      <EmptyState
        title="No conferences found"
        description="Try adjusting your filters or check back later"
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {conferences.map((conference, i) => (
        <div key={conference.id} data-guide={i === 0 ? "conf-card-click" : undefined}>
          <ConferenceCard conference={conference} />
        </div>
      ))}
    </div>
  );
}
