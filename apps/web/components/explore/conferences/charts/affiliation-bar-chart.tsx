'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ConferenceStats } from '@/lib/explore/types'

interface AffiliationBarChartProps {
    data: ConferenceStats['topAffiliations']
}

export function AffiliationBarChart({ data }: AffiliationBarChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                No affiliation data available
            </div>
        )
    }

    // Sort by count ascending for horizontal bar chart (top items at top)
    const chartData = [...data].sort((a, b) => a.count - b.count).slice(-15) // Top 15

    return (
        <ResponsiveContainer width="100%" height="100%">
            <BarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
            >
                <XAxis type="number" hide />
                <YAxis
                    type="category"
                    dataKey="affiliation"
                    width={150}
                    tick={({ x, y, payload }) => (
                        <g transform={`translate(${x},${y})`}>
                            <text
                                x={0}
                                y={0}
                                dy={3}
                                textAnchor="end"
                                fill="currentColor"
                                className="text-[10px] fill-muted-foreground font-medium"
                                width={140}
                            >
                                {payload.value.length > 25 ? `${payload.value.substring(0, 25)}...` : payload.value}
                            </text>
                        </g>
                    )}
                />
                <Tooltip
                    cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                    contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                        color: 'hsl(var(--foreground))'
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Bar dataKey="count" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} barSize={16}>
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? "hsl(var(--primary))" : "hsl(var(--primary)/0.7)"} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}
