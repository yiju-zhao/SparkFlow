'use client'

import Link from 'next/link'
import { ConferenceStats } from '@/lib/explore/types'
import { Button } from '@/components/ui/button'
import { ArrowRight, FileText, Presentation } from 'lucide-react'
import { StatusPieChart } from './charts/status-pie-chart'
import { KeywordCloud } from './charts/keyword-cloud'
import { AffiliationBarChart } from './charts/affiliation-bar-chart'
import { CountryBarChart } from './charts/country-bar-chart'
import { TopicBarChart } from './charts/topic-bar-chart'
import { CollaborationNetwork } from './charts/collaboration-network'

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
        { label: 'publications', value: stats.publicationCount, icon: FileText },
        { label: 'sessions', value: stats.sessionCount, icon: Presentation },
        { label: 'spotlights', value: spotlightCount },
        { label: 'posters', value: posterCount },
        { label: 'orals', value: oralCount },
    ]

    return (
        <div className="flex flex-col gap-10">
            {/* Stat metric cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
                {statItems.map((item, i) => (
                    <div key={i} className="bg-card rounded-lg p-6">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                            {item.icon && <item.icon className="h-3.5 w-3.5" />}
                            {item.label}
                        </span>
                        <div className="text-3xl font-bold tracking-tight tabular-nums mt-2">
                            {item.value.toLocaleString()}
                        </div>
                    </div>
                ))}
            </div>

            {/* Dashboard Panel */}
            <div className="flex flex-col gap-6">

                {/* Row 1: Composition — Pie + Word Cloud */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    <div className="md:col-span-2 bg-card rounded-lg p-6">
                        <div className="h-[260px]">
                            <StatusPieChart data={stats.statusBreakdown} />
                        </div>
                    </div>
                    <div className="md:col-span-3 bg-card rounded-lg p-6">
                        <div className="h-[260px]">
                            <KeywordCloud data={stats.topKeywords} className="min-h-0" />
                        </div>
                    </div>
                </div>

                {/* Row 2: Research Topics — full width */}
                <div className="bg-card rounded-lg p-6">
                    <div className="h-[280px]">
                        <TopicBarChart data={stats.topTopics} />
                    </div>
                </div>

                {/* Row 3: Community — Organizations + Countries */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-card rounded-lg p-6">
                        <div className="h-[320px]">
                            <AffiliationBarChart data={stats.topAffiliations} />
                        </div>
                    </div>
                    <div className="bg-card rounded-lg p-6">
                        <div className="h-[320px]">
                            <CountryBarChart data={stats.topCountries} />
                        </div>
                    </div>
                </div>

                {/* Row 4: Collaboration Networks */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-card rounded-lg p-6">
                        <div className="h-[400px]">
                            <CollaborationNetwork
                                data={stats.orgCollaboration}
                                title="Organization Collaboration Network"
                                nodeColor="#3b82f6"
                            />
                        </div>
                    </div>
                    <div className="bg-card rounded-lg p-6">
                        <div className="h-[400px]">
                            <CollaborationNetwork
                                data={stats.geoCollaboration}
                                title="Geographic Collaboration Network"
                                nodeColor="#22c55e"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* CTA */}
            <div className="flex justify-center">
                <Button size="lg" asChild className="group">
                    <Link href={`/explore/publications?venue=${venueId}&year=${year}`}>
                        View All {stats.publicationCount.toLocaleString()} Publications
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </Button>
            </div>
        </div>
    )
}
