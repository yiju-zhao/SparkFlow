"use client";

import { useMemo } from "react";
import { useECharts } from "@/lib/hooks/use-echarts";
import type { EChartsOption } from "echarts";

interface SessionTopicChartProps {
  data: { topic: string; count: number }[];
}

export function SessionTopicChart({ data }: SessionTopicChartProps) {
  const option = useMemo<EChartsOption>(() => {
    if (!data || data.length === 0) return {};

    const sorted = [...data].sort((a, b) => a.count - b.count).slice(-10);
    const names = sorted.map((d) =>
      d.topic.length > 25 ? `${d.topic.substring(0, 25)}...` : d.topic,
    );
    const values = sorted.map((d) => d.count);

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: any) => {
          const idx = params[0].dataIndex;
          return `${sorted[idx].topic}<br/>Sessions: <strong>${params[0].value}</strong>`;
        },
      },
      grid: { left: 10, right: 30, top: 10, bottom: 10, containLabel: true },
      xAxis: {
        type: "value",
        axisLabel: { show: false },
        splitLine: { show: false },
        axisLine: { show: false },
      },
      yAxis: {
        type: "category",
        data: names,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, width: 120, overflow: "truncate" },
      },
      series: [
        {
          type: "bar",
          data: values,
          itemStyle: {
            color: "#8b5cf6",
            borderRadius: [0, 4, 4, 0],
          },
          barWidth: 18,
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            color: "inherit",
          },
        },
      ],
    };
  }, [data]);

  const chartRef = useECharts({ option });

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No topic data available
      </div>
    );
  }

  return <div ref={chartRef} className="w-full h-full min-h-62.5" />;
}
