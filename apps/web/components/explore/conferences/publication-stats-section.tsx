'use client'

import Link from 'next/link'
import { ConferenceStats } from '@/lib/explore/types'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, FileText, CheckCircle2, XCircle, Mic, Users, Globe, Network } from 'lucide-react'
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
    // Calculate status counts for header cards
    const acceptedCount = stats.statusBreakdown.find(s => s.status === 'Accept')?.count || 0
    const spotlightCount = stats.statusBreakdown.find(s => s.status === 'Spotlight')?.count || 0
    const posterCount = stats.statusBreakdown.find(s => s.status === 'Poster')?.count || 0
    const oralCount = stats.statusBreakdown.find(s => s.status === 'Oral')?.count || 0

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Accepted', value: acceptedCount, icon: CheckCircle2, color: 'text-green-500' },
                    { label: 'Spotlights', value: spotlightCount, icon: FileText, color: 'text-yellow-500' },
                    { label: 'Posters', value: posterCount, icon: FileText, color: 'text-blue-500' },
                    { label: 'Orals', value: oralCount, icon: Mic, color: 'text-purple-500' },
                ].map((item, i) => (
                    <Card key={i}>
                        <CardContent className="p-4 flex flex-row items-center justify-between space-y-0">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{item.label}</p>
                                <div className="text-2xl font-bold">{item.value}</div>
                            </div>
                            <item.icon className={cn("h-4 w-4 text-muted-foreground", item.color)} />
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                {/* Row 1: Status Pie & Keywords */}
                <ChartCard title="Publication Status Breakdown">
                    <StatusPieChart data={stats.statusBreakdown} />
                </ChartCard>

                <ChartCard title="Popular Keywords">
                    <KeywordCloud data={stats.topKeywords} />
                </ChartCard>

                {/* Row 2: Affiliations & Countries */}
                <ChartCard title="Top Organizations" height="h-[400px]" action={<Users className="h-4 w-4 text-muted-foreground" />}>
                    <AffiliationBarChart data={stats.topAffiliations} />
                </ChartCard>

                <ChartCard title="Top Countries" height="h-[400px]" action={<Globe className="h-4 w-4 text-muted-foreground" />}>
                    <CountryBarChart data={stats.topCountries} />
                </ChartCard>

                {/* Row 3: Networks */}
                <ChartCard title="Organization Collaboration Network" height="h-[500px]" action={<Network className="h-4 w-4 text-muted-foreground" />}>
                    <CollaborationNetwork
                        data={stats.orgCollaboration}
                        title="Organization Collaboration Network"
                        nodeColor="#3b82f6" // blue
                    />
                </ChartCard>

                <ChartCard title="Geographic Collaboration Network" height="h-[500px]" action={<Globe className="h-4 w-4 text-muted-foreground" />}>
                    <CollaborationNetwork
                        data={stats.geoCollaboration}
                        title="Geographic Collaboration Network"
                        nodeColor="#ef4444" // red
                    />
                </ChartCard>
            </div>

            {/* Topics Full Width */}
            <ChartCard title="Top Research Topics" height="h-[300px]">
                <TopicBarChart data={stats.topTopics} />
            </ChartCard>

            {/* View All Button */}
            <div className="flex justify-center pt-4 pb-8">
                <Button size="lg" asChild className="group">
                    <Link href={`/explore/publications?venue=${venueId}&year=${year}`}>
                        View All {stats.publicationCount} Publications
                        <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </Button>
            </div>
        </div>
    )
}
