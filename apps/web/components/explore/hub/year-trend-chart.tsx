// apps/web/components/explore/hub/year-trend-chart.tsx

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
import { BarChart3 } from 'lucide-react'

interface YearTrendChartProps {
  data: { year: number; publications: number }[]
}

export function YearTrendChart({ data }: YearTrendChartProps) {
  const hasData = data && data.length > 0

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-base font-medium">Publications by Year</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          {hasData ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                <XAxis
                  dataKey="year"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                />
                <Bar
                  dataKey="publications"
                  fill="hsl(var(--foreground))"
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg">
              <BarChart3 className="h-8 w-8 mb-3" />
              <p className="text-sm font-medium">No data yet</p>
              <p className="text-xs mt-1">Publication trends will appear here</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
