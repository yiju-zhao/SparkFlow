'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import * as echarts from 'echarts'
import { KeywordStats } from '@/lib/explore/types'
import type { ECharts } from 'echarts'

interface KeywordCloudProps {
    data: KeywordStats[]
}

const COLORS = [
    '#2563eb', '#0891b2', '#0d9488', '#059669', '#16a34a',
    '#65a30d', '#ca8a04', '#ea580c', '#dc2626', '#7c3aed'
]

export function KeywordCloud({ data }: KeywordCloudProps) {
    const chartRef = useRef<HTMLDivElement>(null)
    const chartInstance = useRef<ECharts | null>(null)
    const { resolvedTheme } = useTheme()
    const [isReady, setIsReady] = useState(false)

    // Dynamically import echarts-wordcloud on client only
    useEffect(() => {
        import('echarts-wordcloud').then(() => {
            setIsReady(true)
        })
    }, [])

    const wordData = useMemo(() => {
        if (!data || data.length === 0) return []

        return data.map((item, i) => ({
            name: item.keyword,
            value: item.count,
            textStyle: {
                color: COLORS[i % COLORS.length]
            }
        }))
    }, [data])

    useEffect(() => {
        if (!isReady || !chartRef.current || wordData.length === 0) return

        if (chartInstance.current && !chartInstance.current.isDisposed()) {
            chartInstance.current.dispose()
            chartInstance.current = null
        }

        chartInstance.current = echarts.init(
            chartRef.current,
            resolvedTheme === 'dark' ? 'dark' : undefined
        )

        chartInstance.current.setOption({
            tooltip: {
                show: true,
                formatter: (params: any) => `${params.name}: ${params.value}`
            },
            series: [{
                type: 'wordCloud',
                shape: 'circle',
                left: 'center',
                top: 'center',
                width: '90%',
                height: '90%',
                sizeRange: [14, 50],
                rotationRange: [0, 0],
                gridSize: 8,
                drawOutOfBound: false,
                textStyle: {
                    fontFamily: 'Inter, sans-serif',
                    fontWeight: 600
                },
                emphasis: {
                    textStyle: {
                        shadowBlur: 10,
                        shadowColor: 'rgba(0, 0, 0, 0.3)'
                    }
                },
                data: wordData
            }]
        })

        const handleResize = () => {
            if (chartInstance.current && !chartInstance.current.isDisposed()) {
                chartInstance.current.resize()
            }
        }
        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            if (chartInstance.current && !chartInstance.current.isDisposed()) {
                chartInstance.current.dispose()
                chartInstance.current = null
            }
        }
    }, [isReady, wordData, resolvedTheme])

    if (!data || data.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                No keyword data available
            </div>
        )
    }

    return <div ref={chartRef} className="w-full h-full min-h-[300px]" />
}
