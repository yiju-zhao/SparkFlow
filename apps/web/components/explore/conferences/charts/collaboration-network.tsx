'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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

    // Close expanded view on Escape
    useEffect(() => {
        if (!isExpanded) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsExpanded(false)
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isExpanded])

    const buildOption = useCallback((compact: boolean) => {
        if (!data || data.nodes.length === 0) return null

        // Deduplicate nodes by id (ECharts requires unique names)
        const nodeMap = new Map<string, { id: string; val: number }>()
        data.nodes.forEach(node => {
            if (!nodeMap.has(node.id)) {
                nodeMap.set(node.id, { id: node.id, val: node.val })
            } else {
                const existing = nodeMap.get(node.id)!
                existing.val += node.val
            }
        })
        const nodes = Array.from(nodeMap.values())

        const maxVal = Math.max(...nodes.map(n => n.val), 1)
        const maxLinkVal = Math.max(...data.links.map(l => l.value), 1)

        // Only include links where both source and target exist in nodes
        const nodeIds = new Set(nodes.map(n => n.id))
        const validLinks = data.links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target))

        const labelTruncate = compact ? 15 : 25

        return {
            tooltip: {
                trigger: 'item' as const,
                backgroundColor: resolvedTheme === 'dark' ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                borderColor: resolvedTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                borderWidth: 1,
                textStyle: {
                    color: resolvedTheme === 'dark' ? '#e5e5e5' : '#333',
                    fontSize: 12,
                },
                padding: [8, 12],
                formatter: (params: any) => {
                    if (params.dataType === 'node') {
                        return `<strong>${params.name}</strong><br/><span style="opacity:0.7">Publications:</span> ${params.data.value}`
                    } else if (params.dataType === 'edge') {
                        return `${params.data.source} <span style="opacity:0.5">↔</span> ${params.data.target}<br/><span style="opacity:0.7">Collaborations:</span> ${params.data.value}`
                    }
                    return ''
                }
            },
            series: [{
                type: 'graph',
                layout: 'force',
                roam: true,
                draggable: true,
                force: compact
                    ? { repulsion: 260, gravity: 0.12, edgeLength: [80, 200], friction: 0.6 }
                    : { repulsion: 400, gravity: 0.08, edgeLength: [120, 350], friction: 0.6 },
                label: {
                    show: true,
                    position: 'right' as const,
                    fontSize: compact ? 9 : 12,
                    formatter: (params: any) => {
                        const name = params.name
                        return name.length > labelTruncate ? name.substring(0, labelTruncate) + '...' : name
                    }
                },
                emphasis: {
                    focus: 'adjacency' as const,
                    label: {
                        show: true,
                        fontSize: compact ? 11 : 13,
                        fontWeight: 'bold' as const
                    }
                },
                data: nodes.map(node => ({
                    name: node.id,
                    value: node.val,
                    symbolSize: Math.max(compact ? 8 : 12, Math.sqrt(node.val / maxVal) * (compact ? 36 : 50)),
                    itemStyle: {
                        color: nodeColor,
                        shadowBlur: 4,
                        shadowColor: 'rgba(0,0,0,0.15)'
                    }
                })),
                links: validLinks.map(link => ({
                    source: link.source,
                    target: link.target,
                    value: link.value,
                    lineStyle: {
                        width: Math.max(1, (link.value / maxLinkVal) * 32),
                        opacity: 0.15 + (link.value / maxLinkVal) * 0.75,
                        curveness: 0.1
                    }
                }))
            }]
        }
    }, [data, nodeColor, resolvedTheme])

    const compactOption = useMemo(() => buildOption(true), [buildOption])
    const expandedOption = useMemo(() => buildOption(false), [buildOption])

    // Initialize main chart
    useEffect(() => {
        if (!isReady || !chartRef.current || !compactOption || isExpanded) return

        const timer = setTimeout(() => {
            if (chartInstance.current && !chartInstance.current.isDisposed()) {
                chartInstance.current.dispose()
            }

            if (chartRef.current) {
                chartInstance.current = echarts.init(
                    chartRef.current,
                    resolvedTheme === 'dark' ? 'dark' : undefined
                )
                chartInstance.current.setOption(compactOption)
            }
        }, 50)

        const handleResize = () => {
            if (chartInstance.current && !chartInstance.current.isDisposed()) {
                chartInstance.current.resize()
            }
        }
        window.addEventListener('resize', handleResize)

        return () => {
            clearTimeout(timer)
            window.removeEventListener('resize', handleResize)
        }
    }, [isReady, compactOption, resolvedTheme, isExpanded])

    // Cleanup on unmount only
    useEffect(() => {
        return () => {
            if (chartInstance.current && !chartInstance.current.isDisposed()) {
                chartInstance.current.dispose()
            }
        }
    }, [])

    // Initialize expanded chart
    useEffect(() => {
        if (!isExpanded || !expandedChartRef.current || !expandedOption) return

        const timer = setTimeout(() => {
            if (expandedChartInstance.current && !expandedChartInstance.current.isDisposed()) {
                expandedChartInstance.current.dispose()
            }

            if (expandedChartRef.current) {
                expandedChartInstance.current = echarts.init(
                    expandedChartRef.current,
                    resolvedTheme === 'dark' ? 'dark' : undefined
                )
                expandedChartInstance.current.setOption(expandedOption)
            }
        }, 50)

        const handleResize = () => {
            if (expandedChartInstance.current && !expandedChartInstance.current.isDisposed()) {
                expandedChartInstance.current.resize()
            }
        }
        window.addEventListener('resize', handleResize)

        return () => {
            clearTimeout(timer)
            window.removeEventListener('resize', handleResize)
            if (expandedChartInstance.current && !expandedChartInstance.current.isDisposed()) {
                expandedChartInstance.current.dispose()
                expandedChartInstance.current = null
            }
        }
    }, [isExpanded, expandedOption, resolvedTheme])

    if (!data || data.nodes.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                No collaboration data available
            </div>
        )
    }

    return (
        <>
            {/* Compact preview */}
            <div className={`w-full h-full relative group ${isExpanded ? 'invisible' : ''}`}>
                <Button
                    variant="outline"
                    size="icon"
                    className="absolute top-2 right-2 z-10 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-background/80 backdrop-blur-sm border-border/50 shadow-sm"
                    onClick={() => setIsExpanded(true)}
                >
                    <Maximize2 className="h-3.5 w-3.5" />
                </Button>
                <div ref={chartRef} className="w-full h-full min-h-[300px]" />
            </div>

            {/* Expanded fullscreen */}
            {isExpanded && (
                <div className="fixed inset-0 bg-background/95 z-50 flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-card w-full h-full rounded-xl shadow-2xl flex flex-col overflow-hidden border">
                        <div className="flex items-center justify-between px-6 py-4 border-b">
                            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full hover:bg-muted"
                                onClick={() => setIsExpanded(false)}
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                        <div className="flex-1 relative">
                            <div ref={expandedChartRef} className="absolute inset-0" />
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
