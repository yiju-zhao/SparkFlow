import { Suspense } from 'react'
import Link from 'next/link'
import { getGlobalStats, getYearTrendData, getTopicsChartData, getRecentConferences } from '@/lib/explore/queries'
import { GlobalStats, RecentConferences } from '@/components/explore/hub'
import { ChartsSection } from '@/components/explore/hub/charts-section'

import { Skeleton } from '@/components/ui/skeleton'

async function StatsSection() {
  const stats = await getGlobalStats()
  return <GlobalStats stats={stats} />
}

async function ChartsSectionWrapper() {
  const [yearData, topicsData] = await Promise.all([
    getYearTrendData(),
    getTopicsChartData()
  ])

  return <ChartsSection yearData={yearData} topicsData={topicsData} />
}

async function RecentConferencesSection() {
  const conferences = await getRecentConferences(5)
  return <RecentConferences conferences={conferences} />
}

export default function ExplorePage() {
  return (
    <div className="flex flex-col gap-10">
      {/* Title Section */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">~/research-hub/overview</p>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Knowledge Base</h1>
        <p className="text-muted-foreground">
          Discover conferences, publications, and sessions in the global knowledge base
        </p>
      </div>

      {/* Stats Overview */}
      <section>
        <Suspense fallback={<StatsSkeleton />}>
          <StatsSection />
        </Suspense>
      </section>

      {/* Analytics */}
      <section>
        <Suspense fallback={<ChartsSkeleton />}>
          <ChartsSectionWrapper />
        </Suspense>
      </section>

      {/* Recent Conferences */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold font-mono tracking-tight">recent conferences</h2>
          </div>
          <Link href="/explore/conferences" className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
            view all
          </Link>
        </div>
        <Suspense fallback={<RecentConferencesSkeleton />}>
          <RecentConferencesSection />
        </Suspense>
      </section>
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-[100px] rounded-lg" />
      ))}
    </div>
  )
}

function ChartsSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="bg-card rounded-lg p-6">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-[300px] w-full" />
      </div>
      <div className="bg-card rounded-lg p-6">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    </div>
  )
}

function RecentConferencesSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-6 px-5 py-4 border-b border-border last:border-b-0">
          <div className="flex items-center gap-4">
            <Skeleton className="h-11 w-11 rounded-md" />
            <div>
              <Skeleton className="h-4 w-48 mb-2" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
          <div className="flex items-center gap-6">
            <Skeleton className="h-5 w-20 rounded-full" />
            <div className="text-right">
              <Skeleton className="h-4 w-12 mb-2" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
