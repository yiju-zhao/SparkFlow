// apps/web/components/explore/hub/topics-chart.tsx

"use client";

import { useMemo } from "react";
import { useECharts } from "@/hooks/use-echarts";
import { Hash } from "lucide-react";
import { useTheme } from "next-themes";
import type { EChartsOption } from "echarts";

interface TopicsChartProps {
  data: { topic: string; count: number }[];
}

export function TopicsChart({ data }: TopicsChartProps) {
  const { theme } = useTheme();
  const hasData = data && data.length > 0;

  const option = useMemo<EChartsOption>(() => {
    if (!hasData) return {};

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "shadow",
        },
      },
      grid: {
        top: 10,
        right: 20,
        bottom: 20,
        left: 10,
        containLabel: true,
      },
      xAxis: {
        type: "value",
        splitLine: {
          lineStyle: {
            color: theme === "dark" ? "#27272a" : "#e4e4e7",
            type: "dashed",
          },
        },
        axisLabel: {
          color: theme === "dark" ? "#a1a1aa" : "#71717a",
        },
      },
      yAxis: {
        type: "category",
        data: data.map((d) => d.topic),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          color: theme === "dark" ? "#a1a1aa" : "#71717a",
          width: 120,
          overflow: "truncate",
        },
      },
      series: [
        {
          data: data.map((d) => d.count),
          type: "bar",
          itemStyle: {
            borderRadius: [0, 4, 4, 0],
            color: theme === "dark" ? "#fafafa" : "#09090b",
          },
          barMaxWidth: 30,
        },
      ],
    };
  }, [data, hasData, theme]);

  const chartRef = useECharts({ option });

  return (
    <div className="bg-card rounded-lg p-6">
      <h3 className="text-sm font-semibold mb-4">Top Research Topics</h3>
      <div className="h-65">
        {hasData ? (
          <div ref={chartRef} className="w-full h-full" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg">
            <Hash className="h-8 w-8 mb-3" />
            <p className="text-sm font-medium">No topics yet</p>
            <p className="text-xs mt-1">Research topics will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}
