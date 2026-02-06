'use client'

import { useMemo, useState, useEffect } from 'react'
import { Text } from '@visx/text'
import { scaleLog } from '@visx/scale'
import { Wordcloud } from '@visx/wordcloud'
import { KeywordStats } from '@/lib/explore/types'
import { useTheme } from 'next-themes'

interface KeywordCloudProps {
    data: KeywordStats[]
}

const COLORS = [
    '#2563eb', // blue-600
    '#0891b2', // cyan-600
    '#0d9488', // teal-600
    '#059669', // emerald-600
    '#16a34a', // green-600
    '#65a30d', // lime-600
    '#ca8a04', // yellow-600
    '#ea580c', // orange-600
    '#dc2626', // red-600
    '#7c3aed', // violet-600
]

export function KeywordCloud({ data }: KeywordCloudProps) {
    const { theme } = useTheme()
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    const words = useMemo(() => {
        return data.map(k => ({
            text: k.keyword,
            value: k.count
        }))
    }, [data])

    const fontScale = useMemo(() => {
        if (words.length === 0) return () => 12
        const minVal = Math.min(...words.map(w => w.value))
        const maxVal = Math.max(...words.map(w => w.value))

        return scaleLog({
            domain: [minVal, maxVal],
            range: [12, 60] // Font size range
        })
    }, [words])

    if (!isMounted) return null

    if (!data || data.length === 0) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                No keyword data available
            </div>
        )
    }

    return (
        <div className="w-full h-full flex items-center justify-center overflow-hidden">
            <Wordcloud
                words={words}
                width={500}
                height={300}
                fontSize={(datum) => fontScale(datum.value)}
                font={'Inter, sans-serif'}
                padding={2}
                spiral="rectangular"
                rotate={0}
                random={() => 0.5}
            >
                {(cloudWords) =>
                    cloudWords.map((w, i) => (
                        <Text
                            key={w.text}
                            fill={COLORS[i % COLORS.length]}
                            textAnchor="middle"
                            transform={`translate(${w.x}, ${w.y}) rotate(${w.rotate})`}
                            fontSize={w.size}
                            fontFamily={w.font}
                            className="cursor-default hover:opacity-80 transition-opacity select-none"
                            style={{ fontWeight: 600 }}
                        >
                            {w.text}
                        </Text>
                    ))
                }
            </Wordcloud>
        </div>
    )
}
