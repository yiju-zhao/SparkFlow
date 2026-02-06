'use client'

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { CountryStats } from '@/lib/explore/types'

interface CountryBarChartProps {
    data: CountryStats[]
}

export function CountryBarChart({ data }: CountryBarChartProps) {
    if (!data || data.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                No geographic data available
            </div>
        )
    }

    // Sort by count ascending
    const chartData = [...data].sort((a, b) => a.count - b.count).slice(-15)

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
                    dataKey="country"
                    width={100}
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
                                {payload.value}
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
                <Bar dataKey="count" fill="hsl(var(--chart-3))" radius={[0, 4, 4, 0]} barSize={16}>
                    {chartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? "hsl(var(--chart-3))" : "hsl(var(--chart-3)/0.7)"} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}
