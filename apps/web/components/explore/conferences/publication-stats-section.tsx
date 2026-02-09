'use client'

import Link from 'next/link'
import { ConferenceStats } from '@/lib/explore/types'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, Layers, Mic, Users, Globe, Network } from 'lucide-react'
import { ChartCard } from './charts/chart-card'
import { StatusPieChart } from './charts/status-pie-chart'
import { KeywordCloud } from './charts/keyword-cloud'
import { AffiliationBarChart } from './charts/affiliation-bar-chart'
import { CountryBarChart } from './charts/country-bar-chart'
import { TopicBarChart } from './charts/topic-bar-chart'
import { CollaborationNetwork } from './charts/collaboration-network'
import { cn } from '@/lib/utils'

interface PublicationStatsSectionProps {
    venueId: string
    year: number
    stats: ConferenceStats
}

export function PublicationStatsSection({ venueId, year, stats }: PublicationStatsSectionProps) {
    const spotlightCount = stats.statusBreakdown.find(s => s.status === 'Spotlight')?.count || 0
    const posterCount = stats.statusBreakdown.find(s => s.status === 'Poster')?.count || 0
    const oralCount = stats.statusBreakdown.find(s => s.status === 'Oral')?.count || 0

    const statItems = [
        { label: 'Spotlights', value: spotlightCount, icon: Sparkles, accent: 'from-amber-500/20 to-orange-500/20 dark:from-amber-500/10 dark:to-orange-500/10', iconColor: 'text-amber-500' },
        { label: 'Posters', value: posterCount, icon: Layers, accent: 'from-blue-500/20 to-cyan-500/20 dark:from-blue-500/10 dark:to-cyan-500/10', iconColor: 'text-blue-500' },
        { label: 'Orals', value: oralCount, icon: Mic, accent: 'from-violet-500/20 to-purple-500/20 dark:from-violet-500/10 dark:to-purple-500/10', iconColor: 'text-violet-500' },
    ]

    return (
        <div className="space-y-8">
            {/* Stat pills — compact, scannable */}
            <div className="flex flex-wrap gap-3">
                {statItems.map((item, i) => (
                    <div
                        key={i}
                        className={cn(
                            "flex items-center gap-3 pl-3 pr-5 py-2.5 rounded-xl",
                            "bg-gradient-to-r border border-border/50",
                            item.accent
                        )}
                        style={{ animationDelay: `${i * 80}ms` }}
                    >
                        <div className={cn("p-1.5 rounded-lg bg-background/80", item.iconColor)}>
                            <item.icon className="h-4 w-4" />
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-bold tracking-tight tabular-nums">{item.value.toLocaleString()}</span>
                            <span className="text-sm text-muted-foreground font-medium">{item.label}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Section: Composition */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                    Composition
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    <div className="md:col-span-2">
                        <ChartCard title="Status Breakdown">
                            <StatusPieChart data={stats.statusBreakdown} />
                        </ChartCard>
                    </div>
                    <div className="md:col-span-3">
                        <ChartCard title="Popular Keywords" height="h-[300px]">
                            <KeywordCloud data={stats.topKeywords} />
                        </ChartCard>
                    </div>
                </div>
            </section>

            {/* Section: Landscape */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                    Research Landscape
                </h3>
                <ChartCard title="Top Research Topics" height="h-[280px]">
                    <TopicBarChart data={stats.topTopics} />
                </ChartCard>
            </section>

            {/* Section: Community */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                    Community
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ChartCard title="Top Organizations" height="h-[400px]" action={<Users className="h-4 w-4 text-muted-foreground" />}>
                        <AffiliationBarChart data={stats.topAffiliations} />
                    </ChartCard>
                    <ChartCard title="Top Countries" height="h-[400px]" action={<Globe className="h-4 w-4 text-muted-foreground" />}>
                        <CountryBarChart data={stats.topCountries} />
                    </ChartCard>
                </div>
            </section>

            {/* Section: Collaboration */}
            <section>
                <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                    Collaboration Networks
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <ChartCard title="Organization Collaboration" height="h-[500px]" action={<Network className="h-4 w-4 text-muted-foreground" />}>
                        <CollaborationNetwork
                            data={stats.orgCollaboration}
                            title="Organization Collaboration Network"
                            nodeColor="#3b82f6"
                        />
                    </ChartCard>
                    <ChartCard title="Geographic Collaboration" height="h-[500px]" action={<Globe className="h-4 w-4 text-muted-foreground" />}>
                        <CollaborationNetwork
                            data={stats.geoCollaboration}
                            title="Geographic Collaboration Network"
                            nodeColor="#ef4444"
                        />
                    </ChartCard>
                </div>
            </section>

            {/* CTA */}
            <div className="flex justify-center pt-6 pb-4">
                <Button size="lg" asChild className="group rounded-full px-8">
                    <Link href={`/explore/publications?venue=${venueId}&year=${year}`}>
                        View All {stats.publicationCount.toLocaleString()} Publications
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </Button>
            </div>
        </div>
    )
}
