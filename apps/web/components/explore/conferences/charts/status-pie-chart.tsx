'use client'

import { useMemo } from 'react'
import { useECharts } from '@/hooks/use-echarts'
import { StatusStats } from '@/lib/explore/types'
import type { EChartsOption } from 'echarts'

interface StatusPieChartProps {
    data: StatusStats[]
}

const STATUS_COLORS: Record<string, string> = {
    'Accept': '#22c55e',
    'Spotlight': '#eab308',
    'Poster': '#3b82f6',
    'Oral': '#a855f7',
    'Reject': '#ef4444',
    'Withdrawal': '#6b7280',
    'Other': '#f97316'
}

export function StatusPieChart({ data }: StatusPieChartProps) {
    const option = useMemo<EChartsOption>(() => {
        if (!data || data.length === 0) return {}

        const chartData = data
            .map(item => ({
                name: item.status || 'Unknown',
                value: item.count,
                itemStyle: {
                    color: STATUS_COLORS[item.status] || STATUS_COLORS['Other']
                }
            }))
            .sort((a, b) => b.value - a.value)

        return {
            tooltip: {
                trigger: 'item',
                formatter: '{b}: {c} ({d}%)'
            },
            legend: {
                orient: 'vertical',
                right: 10,
                top: 'center',
                textStyle: {
                    fontSize: 12
                }
            },
            series: [{
                type: 'pie',
                radius: ['45%', '70%'],
                center: ['35%', '50%'],
                avoidLabelOverlap: true,
                itemStyle: {
                    borderRadius: 4,
                    borderWidth: 2,
                    borderColor: 'transparent'
                },
                label: {
                    show: false
                },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 14,
                        fontWeight: 'bold'
                    },
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.3)'
                    }
                },
                data: chartData
            }]
        }
    }, [data])

    const chartRef = useECharts({ option })

    if (!data || data.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                No status data available
            </div>
        )
    }

    return <div ref={chartRef} className="w-full h-full min-h-[250px]" />
}
