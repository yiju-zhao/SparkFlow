// apps/web/components/explore/hub/global-stats.tsx

import { StatsCard } from '@/components/explore/shared'
import { Building2, FileText, Calendar, TrendingUp } from 'lucide-react'
import type { GlobalStats } from '@/lib/explore/types'

interface GlobalStatsProps {
  stats: GlobalStats
}

export function GlobalStats({ stats }: GlobalStatsProps) {
  const yearsDescription = stats.yearsRange
    ? `${stats.yearsRange.min} - ${stats.yearsRange.max}`
    : 'No data'

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Conferences"
        value={stats.conferences.toLocaleString()}
        icon={<Building2 className="h-5 w-5" />}
      />
      <StatsCard
        title="Publications"
        value={stats.publications.toLocaleString()}
        icon={<FileText className="h-5 w-5" />}
      />
      <StatsCard
        title="Sessions"
        value={stats.sessions.toLocaleString()}
        icon={<Calendar className="h-5 w-5" />}
      />
      <StatsCard
        title="Years Covered"
        value={stats.yearsRange ? stats.yearsRange.max - stats.yearsRange.min + 1 : 0}
        description={yearsDescription}
        icon={<TrendingUp className="h-5 w-5" />}
      />
    </div>
  )
}
