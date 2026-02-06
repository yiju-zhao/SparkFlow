'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { ConferenceStats } from '@/lib/explore/types'

interface TopicBarChartProps {
    data: ConferenceStats['topTopics']
}

export function TopicBarChart({ data }: TopicBarChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                No topic data available
            </div>
        )
    }

    // Sort by count ascending
    const chartData = [...data].sort((a, b) => a.count - b.count).slice(-10)

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
                    dataKey="topic"
                    width={120}
                    tick={({ x, y, payload }) => (
                        <g transform={`translate(${x},${y})`}>
                            <text
                                x={0}
                                y={0}
                                dy={3}
                                textAnchor="end"
                                fill="currentColor"
                                className="text-xs fill-muted-foreground font-medium"
                            >
                                {payload.value.length > 20 ? `${payload.value.substring(0, 20)}...` : payload.value}
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
                <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[0, 4, 4, 0]} barSize={20}>
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? "hsl(var(--chart-2))" : "hsl(var(--chart-2)/0.7)"} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}
