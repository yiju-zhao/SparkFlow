'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import { NetworkGraphData } from '@/lib/explore/types'
import { Maximize2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Dynamically import ForceGraph2D with no SSR
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
    ssr: false,
    loading: () => <div className="flex h-full items-center justify-center text-muted-foreground">Loading graph...</div>
})

interface CollaborationNetworkProps {
    data: NetworkGraphData
    title: string
    nodeColor?: string
}

export function CollaborationNetwork({ data, title, nodeColor = '#ef4444' }: CollaborationNetworkProps) {
    const [isExpanded, setIsExpanded] = useState(false)
    const [dimensions, setDimensions] = useState({ width: 400, height: 300 })
    const containerRef = useRef<HTMLDivElement>(null)
    const [isMounted, setIsMounted] = useState(false)

    // Mount check
    useEffect(() => {
        setIsMounted(true)
    }, [])

    // Measure container dimensions with ResizeObserver
    useEffect(() => {
        if (!containerRef.current) return

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0]
            if (entry) {
                const { width, height } = entry.contentRect
                if (width > 0 && height > 0) {
                    setDimensions({ width, height })
                }
            }
        })

        observer.observe(containerRef.current)
        return () => observer.disconnect()
    }, [])

    const renderGraph = useCallback((width: number, height: number, isFullscreen = false) => (
        <ForceGraph2D
            graphData={data}
            width={width}
            height={height}
            nodeLabel="id"
            nodeAutoColorBy="group"
            nodeRelSize={6}
            linkWidth={1}
            linkColor={() => isFullscreen ? 'rgba(150,150,150,0.4)' : 'rgba(200,200,200,0.5)'}
            backgroundColor={isFullscreen ? '#ffffff' : 'rgba(0,0,0,0)'}
            cooldownTicks={100}
            minZoom={2}
            maxZoom={10}
            nodeCanvasObject={(node: any, ctx, globalScale) => {
                const label = node.id
                const fontSize = isFullscreen ? 14 / globalScale : 12 / globalScale
                ctx.font = `${fontSize}px Sans-Serif`
                const textWidth = ctx.measureText(label).width
                const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2)

                if (typeof node.x === 'number' && typeof node.y === 'number') {
                    ctx.beginPath()
                    ctx.arc(node.x, node.y, isFullscreen ? 5 : 4, 0, 2 * Math.PI, false)
                    ctx.fillStyle = nodeColor
                    ctx.fill()

                    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
                    ctx.fillRect(
                        node.x - bckgDimensions[0] / 2,
                        node.y - bckgDimensions[1] / 2,
                        bckgDimensions[0],
                        bckgDimensions[1]
                    )

                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillStyle = '#000000'
                    ctx.fillText(label, node.x, node.y)
                }
            }}
        />
    ), [data, nodeColor])

    if (!isMounted) return null

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
                        <div className="absolute inset-0">
                            {renderGraph(window.innerWidth - 32, window.innerHeight - 100, true)}
                        </div>
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

            <div ref={containerRef} className="w-full h-full">
                {dimensions.width > 0 && renderGraph(dimensions.width, dimensions.height)}
            </div>
        </div>
    )
}
