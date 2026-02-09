'use client'

import Link from 'next/link'
import { ConferenceStats } from '@/lib/explore/types'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles, Layers, Mic, Users, Globe, Network } from 'lucide-react'
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

function SectionLabel({ children }: { children: React.ReactNode }) {
    return (
        <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
            {children}
        </h3>
    )
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

            {/* Unified Bento Dashboard Panel */}
            <div className="rounded-2xl border border-border/60 bg-card overflow-hidden">

                {/* Row 1: Composition — Pie + Word Cloud */}
                <div className="grid grid-cols-1 md:grid-cols-5">
                    <div className="md:col-span-2 p-5">
                        <SectionLabel>Status Breakdown</SectionLabel>
                        <div className="h-[260px]">
                            <StatusPieChart data={stats.statusBreakdown} />
                        </div>
                    </div>
                    <div className="md:col-span-3 p-5 md:border-l border-t md:border-t-0 border-border/40">
                        <SectionLabel>Popular Keywords</SectionLabel>
                        <div className="h-[260px]">
                            <KeywordCloud data={stats.topKeywords} className="min-h-0" />
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border/40" />

                {/* Row 2: Research Topics — full width for readability */}
                <div className="p-5">
                    <SectionLabel>Top Research Topics</SectionLabel>
                    <div className="h-[280px]">
                        <TopicBarChart data={stats.topTopics} />
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border/40" />

                {/* Row 3: Community — Countries + Organizations side by side */}
                <div className="grid grid-cols-1 md:grid-cols-2">
                    <div className="p-5">
                        <SectionLabel>
                            <Users className="h-3.5 w-3.5" />
                            Top Organizations
                        </SectionLabel>
                        <div className="h-[320px]">
                            <AffiliationBarChart data={stats.topAffiliations} />
                        </div>
                    </div>
                    <div className="p-5 md:border-l border-t md:border-t-0 border-border/40">
                        <SectionLabel>
                            <Globe className="h-3.5 w-3.5" />
                            Top Countries
                        </SectionLabel>
                        <div className="h-[320px]">
                            <CountryBarChart data={stats.topCountries} />
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border/40" />

                {/* Row 3: Collaboration Networks */}
                <div className="grid grid-cols-1 md:grid-cols-2">
                    <div className="p-5">
                        <SectionLabel>
                            <Network className="h-3.5 w-3.5" />
                            Organization Collaboration
                        </SectionLabel>
                        <div className="h-[400px]">
                            <CollaborationNetwork
                                data={stats.orgCollaboration}
                                title="Organization Collaboration Network"
                                nodeColor="#3b82f6"
                            />
                        </div>
                    </div>
                    <div className="p-5 md:border-l border-t md:border-t-0 border-border/40">
                        <SectionLabel>
                            <Globe className="h-3.5 w-3.5" />
                            Geographic Collaboration
                        </SectionLabel>
                        <div className="h-[400px]">
                            <CollaborationNetwork
                                data={stats.geoCollaboration}
                                title="Geographic Collaboration Network"
                                nodeColor="#ef4444"
                            />
                        </div>
                    </div>
                </div>
            </div>

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
