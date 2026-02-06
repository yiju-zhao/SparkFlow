'use client'

import { useMemo } from 'react'
import { useECharts } from '@/hooks/use-echarts'
import { CountryStats } from '@/lib/explore/types'
import type { EChartsOption } from 'echarts'

interface CountryBarChartProps {
    data: CountryStats[]
}

export function CountryBarChart({ data }: CountryBarChartProps) {
    const option = useMemo<EChartsOption>(() => {
        if (!data || data.length === 0) return {}

        // Sort ascending and take top 15
        const sortedData = [...data]
            .sort((a, b) => a.count - b.count)
            .slice(-15)

        const names = sortedData.map(d => d.country)
        const values = sortedData.map(d => d.count)

        return {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' }
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
                    width: 100,
                    overflow: 'truncate'
                }
            },
            series: [{
                type: 'bar',
                data: values,
                itemStyle: {
                    color: 'hsl(142.1, 76.2%, 36.3%)', // green-600
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
                No geographic data available
            </div>
        )
    }

    return <div ref={chartRef} className="w-full h-full min-h-[300px]" />
}
