// apps/web/components/explore/hub/topics-chart.tsx

'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Hash } from 'lucide-react'

interface TopicsChartProps {
  data: { topic: string; count: number }[]
}

export function TopicsChart({ data }: TopicsChartProps) {
  const hasData = data && data.length > 0

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">Top Research Topics</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis
                  type="category"
                  dataKey="topic"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--foreground))"
                  radius={[0, 2, 2, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg">
              <Hash className="h-8 w-8 mb-3" />
              <p className="text-sm font-medium">No topics yet</p>
              <p className="text-xs mt-1">Research topics will appear here</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
