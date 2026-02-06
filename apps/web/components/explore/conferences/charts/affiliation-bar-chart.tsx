'use client'

import { useMemo } from 'react'
import { useECharts } from '@/hooks/use-echarts'
import { ConferenceStats } from '@/lib/explore/types'
import type { EChartsOption } from 'echarts'

interface AffiliationBarChartProps {
    data: ConferenceStats['topAffiliations']
}

export function AffiliationBarChart({ data }: AffiliationBarChartProps) {
    const option = useMemo<EChartsOption>(() => {
        if (!data || data.length === 0) return {}

        // Sort ascending and take top 15
        const sortedData = [...data]
            .sort((a, b) => a.count - b.count)
            .slice(-15)

        const names = sortedData.map(d =>
            d.affiliation.length > 30 ? `${d.affiliation.substring(0, 30)}...` : d.affiliation
        )
        const values = sortedData.map(d => d.count)

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (params: any) => {
                    const idx = params[0].dataIndex
                    const fullName = sortedData[idx].affiliation
                    return `${fullName}<br/>Publications: <strong>${params[0].value}</strong>`
                }
            },
            grid: {
                left: 10,
                right: 30,
                top: 10,
                bottom: 10,
                containLabel: true
            },
            xAxis: {
                type: 'value',
                axisLabel: { show: false },
                splitLine: { show: false },
                axisLine: { show: false }
            },
            yAxis: {
                type: 'category',
                data: names,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: {
                    fontSize: 11,
                    width: 140,
                    overflow: 'truncate'
                }
            },
            series: [{
                type: 'bar',
                data: values,
                itemStyle: {
                    color: 'hsl(221.2, 83.2%, 53.3%)', // primary color
                    borderRadius: [0, 4, 4, 0]
                },
                barWidth: 16,
                label: {
                    show: true,
                    position: 'right',
                    fontSize: 10,
                    color: 'inherit'
                }
            }]
        }
    }, [data])

    const chartRef = useECharts({ option })

    if (!data || data.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                No affiliation data available
            </div>
        )
    }

    return <div ref={chartRef} className="w-full h-full min-h-[300px]" />
}
