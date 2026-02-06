'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'
import { StatusStats } from '@/lib/explore/types'

interface StatusPieChartProps {
    data: StatusStats[]
}

const COLORS = {
    'Accept': '#22c55e', // green-500
    'Spotlight': '#eab308', // yellow-500
    'Poster': '#3b82f6', // blue-500
    'Oral': '#a855f7', // purple-500
    'Reject': '#ef4444', // red-500
    'Withdrawal': '#6b7280', // gray-500
    'Other': '#f97316' // orange-500
}

export function StatusPieChart({ data }: StatusPieChartProps) {
    const chartData = useMemo(() => {
        return data.map(item => ({
            name: item.status || 'Unknown',
            value: item.count
        })).sort((a, b) => b.value - a.value)
    }, [data])

    if (!data || data.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                No status data available
            </div>
        )
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <PieChart>
                <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                >
                    {chartData.map((entry, index) => {
                        const color = COLORS[entry.name as keyof typeof COLORS] || COLORS['Other']
                        return <Cell key={`cell-${index}`} fill={color} stroke="none" />
                    })}
                </Pie>
                <Tooltip
                    contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: 'var(--radius)',
                        color: 'hsl(var(--foreground))'
                    }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend
                    layout="vertical"
                    verticalAlign="middle"
                    align="right"
                    formatter={(value, entry: any) => (
                        <span className="text-sm font-medium text-foreground ml-1">
                            {value} <span className="text-muted-foreground ml-1">({entry.payload.value})</span>
                        </span>
                    )}
                />
            </PieChart>
        </ResponsiveContainer>
    )
}
