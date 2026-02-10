// apps/web/app/explore/page.tsx

import { Suspense } from 'react'
import { getGlobalStats, getYearTrendData, getTopicsChartData } from '@/lib/explore/queries'
import { GlobalStats } from '@/components/explore/hub'
import { ChartsSection } from '@/components/explore/hub/charts-section'

import { Skeleton } from '@/components/ui/skeleton'
import Link from 'next/link'
import { ArrowRight, Building2, FileText, Calendar } from 'lucide-react'

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

const quickLinks = [
  { href: '/explore/conferences', label: 'Conferences', icon: Building2 },
  { href: '/explore/publications', label: 'Publications', icon: FileText },
  { href: '/explore/sessions', label: 'Sessions', icon: Calendar },
] as const

export default function ExplorePage() {
  return (
    <div className="flex flex-col gap-10">
      {/* Title Section */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">~/research-hub/overview</p>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Knowledge Base</h1>
        <p className="text-muted-foreground mb-6">
          Discover conferences, publications, and sessions in the global knowledge base
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {quickLinks.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-lg bg-card hover:bg-muted transition-colors"
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {label}
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          ))}
        </div>
      </div>

      {/* Stats Overview */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Platform Overview</h2>
        <Suspense fallback={<StatsSkeleton />}>
          <StatsSection />
        </Suspense>
      </section>

      {/* Analytics */}
      <section>
        <h2 className="text-lg font-semibold tracking-tight mb-4">Analytics & Trends</h2>
        <Suspense fallback={<ChartsSkeleton />}>
          <ChartsSectionWrapper />
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
