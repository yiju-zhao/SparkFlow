// apps/web/app/explore/page.tsx

import { Suspense } from 'react'
import { getGlobalStats, getYearTrendData, getTopicsChartData } from '@/lib/explore/queries'
import { GlobalStats } from '@/components/explore/hub'
import { ChartsSection } from '@/components/explore/hub/charts-section'
import { Skeleton } from '@/components/ui/skeleton'

async function StatsSection() {
  const stats = await getGlobalStats()
  return <GlobalStats stats={stats} />
}

async function ChartsSectionWrapper() {
  // Parallel fetch (follows async-parallel best practice)
  const [yearData, topicsData] = await Promise.all([
    getYearTrendData(),
    getTopicsChartData()
  ])

  return <ChartsSection yearData={yearData} topicsData={topicsData} />
}

export default function ExplorePage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Explore</h1>
        <p className="text-muted-foreground mt-2">
          Discover conferences, publications, and sessions in the knowledge base
        </p>
      </div>

      <section>
        <Suspense fallback={<StatsSkeleton />}>
          <StatsSection />
        </Suspense>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-4">Analytics</h2>
        <Suspense fallback={<ChartsSkeleton />}>
          <ChartsSectionWrapper />
        </Suspense>
      </section>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[100px]" />
      ))}
    </div>
  )
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="border rounded-lg p-6">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-[300px] w-full" />
      </div>
      <div className="border rounded-lg p-6">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    </div>
  )
}
