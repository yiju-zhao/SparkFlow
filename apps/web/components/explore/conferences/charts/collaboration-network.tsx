'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useTheme } from 'next-themes'
import * as echarts from 'echarts'
import { NetworkGraphData } from '@/lib/explore/types'
import { Maximize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ECharts } from 'echarts'

interface CollaborationNetworkProps {
    data: NetworkGraphData
    title: string
    nodeColor?: string
}

export function CollaborationNetwork({ data, title, nodeColor = '#ef4444' }: CollaborationNetworkProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [isReady, setIsReady] = useState(false)
    const chartRef = useRef<HTMLDivElement>(null)
    const expandedChartRef = useRef<HTMLDivElement>(null)
    const chartInstance = useRef<ECharts | null>(null)
    const expandedChartInstance = useRef<ECharts | null>(null)
    const { resolvedTheme } = useTheme()

    useEffect(() => {
        setIsReady(true)
    }, [])

    const chartOption = useMemo(() => {
        if (!data || data.nodes.length === 0) return null

        // Deduplicate nodes by id
        const uniqueNodesMap = new Map<string, { id: string; val: number }>()
        data.nodes.forEach(node => {
            if (!uniqueNodesMap.has(node.id)) {
                uniqueNodesMap.set(node.id, node)
            } else {
                // If duplicate, keep the one with higher val
                const existing = uniqueNodesMap.get(node.id)!
                if (node.val > existing.val) {
                    uniqueNodesMap.set(node.id, node)
                }
            }
        })
        const uniqueNodes = Array.from(uniqueNodesMap.values())

        const maxVal = Math.max(...uniqueNodes.map(n => n.val))
        const maxLinkVal = Math.max(...data.links.map(l => l.value), 1)

        // Only include links where both source and target exist in uniqueNodes
        const nodeIds = new Set(uniqueNodes.map(n => n.id))
        const validLinks = data.links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target))

        return {
            tooltip: {
                trigger: 'item',
                formatter: (params: any) => {
                    if (params.dataType === 'node') {
                        return `<strong>${params.name}</strong><br/>Publications: ${params.data.value}`
                    } else if (params.dataType === 'edge') {
                        return `${params.data.source} ↔ ${params.data.target}<br/>Collaborations: ${params.data.value}`
                    }
                    return ''
                }
            },
            series: [{
                type: 'graph',
                layout: 'force',
                roam: true,
                draggable: true,
                force: {
                    repulsion: 200,
                    gravity: 0.1,
                    edgeLength: [80, 200],
                    friction: 0.6
                },
                label: {
                    show: true,
                    position: 'right',
                    fontSize: 10,
                    formatter: (params: any) => {
                        const name = params.name
                        return name.length > 20 ? name.substring(0, 20) + '...' : name
                    }
                },
                emphasis: {
                    focus: 'adjacency',
                    label: {
                        show: true,
                        fontSize: 12,
                        fontWeight: 'bold'
                    },
                    lineStyle: {
                        width: 4
                    }
                },
                data: uniqueNodes.map(node => ({
                    name: node.id,
                    value: node.val,
                    symbolSize: Math.max(10, Math.sqrt(node.val / maxVal) * 40),
                    itemStyle: {
                        color: nodeColor
                    }
                })),
                links: validLinks.map(link => ({
                    source: link.source,
                    target: link.target,
                    value: link.value,
                    lineStyle: {
                        width: Math.max(1, (link.value / maxLinkVal) * 5),
                        opacity: 0.4 + (link.value / maxLinkVal) * 0.4,
                        curveness: 0.1
                    }
                }))
            }]
        }
    }, [data, nodeColor])

    // Initialize main chart
    useEffect(() => {
        if (!isReady || !chartRef.current || !chartOption) return

        if (chartInstance.current && !chartInstance.current.isDisposed()) {
            chartInstance.current.dispose()
        }

        chartInstance.current = echarts.init(
            chartRef.current,
            resolvedTheme === 'dark' ? 'dark' : undefined
        )
        chartInstance.current.setOption(chartOption)

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
            }
        }
    }, [isReady, chartOption, resolvedTheme])

    // Initialize expanded chart
    useEffect(() => {
        if (!isExpanded || !expandedChartRef.current || !chartOption) return

        if (expandedChartInstance.current && !expandedChartInstance.current.isDisposed()) {
            expandedChartInstance.current.dispose()
        }

        expandedChartInstance.current = echarts.init(
            expandedChartRef.current,
            resolvedTheme === 'dark' ? 'dark' : undefined
        )

        // Enhanced options for expanded view
        const expandedOption = {
            ...chartOption,
            series: [{
                ...chartOption.series[0],
                force: {
                    ...chartOption.series[0].force,
                    repulsion: 300,
                    edgeLength: [100, 300]
                },
                label: {
                    ...chartOption.series[0].label,
                    fontSize: 12
                }
            }]
        }
        expandedChartInstance.current.setOption(expandedOption)

        const handleResize = () => {
            if (expandedChartInstance.current && !expandedChartInstance.current.isDisposed()) {
                expandedChartInstance.current.resize()
            }
        }
        window.addEventListener('resize', handleResize)

        return () => {
            window.removeEventListener('resize', handleResize)
            if (expandedChartInstance.current && !expandedChartInstance.current.isDisposed()) {
                expandedChartInstance.current.dispose()
            }
        }
    }, [isExpanded, chartOption, resolvedTheme])

    if (!data || data.nodes.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                No collaboration data available
            </div>
        )
    }

    if (isExpanded) {
        return (
            <div className="fixed inset-0 bg-background/95 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                <div className="bg-card w-full h-full rounded-lg shadow-2xl flex flex-col overflow-hidden border">
                    <div className="flex items-center justify-between p-4 border-b">
                        <h3 className="text-xl font-bold">{title}</h3>
                        <Button variant="ghost" size="icon" onClick={() => setIsExpanded(false)}>
                            <X className="h-6 w-6" />
                        </Button>
                    </div>
                    <div className="flex-1 relative">
                        <div ref={expandedChartRef} className="absolute inset-0" />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="w-full h-full relative group">
            <Button
                variant="outline"
                size="icon"
                className="absolute top-2 right-2 z-10 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80"
                onClick={() => setIsExpanded(true)}
            >
                <Maximize2 className="h-4 w-4" />
            </Button>
            <div ref={chartRef} className="w-full h-full min-h-[300px]" />
        </div>
    )
}
