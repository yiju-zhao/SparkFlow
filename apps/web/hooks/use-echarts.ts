'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import * as echarts from 'echarts'
import type { EChartsOption, ECharts } from 'echarts'

interface UseEChartsOptions {
    option: EChartsOption
}

export function useECharts({ option }: UseEChartsOptions) {
    const chartRef = useRef<HTMLDivElement>(null)
    const chartInstance = useRef<ECharts | null>(null)
    const { resolvedTheme } = useTheme()
    const [isMounted, setIsMounted] = useState(false)

    // Wait for client-side mount to avoid SSR issues
    useEffect(() => {
        setIsMounted(true)
        return () => setIsMounted(false)
    }, [])

    // Initialize and update chart
    useEffect(() => {
        if (!isMounted || !chartRef.current) return

        const theme = resolvedTheme === 'dark' ? 'dark' : undefined

        // Dispose existing instance if theme changes
        if (chartInstance.current) {
            chartInstance.current.dispose()
            chartInstance.current = null
        }

        // Initialize chart with theme
        chartInstance.current = echarts.init(chartRef.current, theme)
        chartInstance.current.setOption(option)

        // Handle resize
        const handleResize = () => {
            if (chartInstance.current && !chartInstance.current.isDisposed()) {
                chartInstance.current.resize()
            }
        }
        window.addEventListener('resize', handleResize)

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize)
            if (chartInstance.current && !chartInstance.current.isDisposed()) {
                chartInstance.current.dispose()
                chartInstance.current = null
            }
        }
    }, [isMounted, option, resolvedTheme])

    return chartRef
}
