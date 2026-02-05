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
    <div className="flex flex-col pb-20" style={{ gap: '35px' }}>
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-muted/50 to-background border p-6 md:p-10">
        <div className="relative z-10 max-w-3xl">
          <h1 className="text-2xl md:text-10xl font-bold tracking-tight mb-4 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Research Hub
          </h1>
          <p className="text-md md:text-xl font-small text-muted-foreground leading-relaxed">
            Discover conferences, publications, and sessions in the knowledge base
          </p>
        </div>
      </div>

      {/* Navigation Cards - Hierarchy Enforcement */}


      {/* Stats Overview */}
      <section>
        <h2 className="text-xl font-semibold tracking-tight mb-6">Platform Overview</h2>
        <Suspense fallback={<StatsSkeleton />}>
          <StatsSection />
        </Suspense>
      </section>

      {/* Analytics */}
      <section>
        <h2 className="text-xl font-semibold tracking-tight mb-6">Analytics & Trends</h2>
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
