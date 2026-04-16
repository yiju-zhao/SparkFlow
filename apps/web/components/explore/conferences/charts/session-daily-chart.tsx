"use client";

import { useMemo } from "react";
import { useECharts } from "@/lib/hooks/use-echarts";
import type { EChartsOption } from "echarts";

interface SessionDailyChartProps {
  data: { date: string; label: string; count: number }[];
}

export function SessionDailyChart({ data }: SessionDailyChartProps) {
  const option = useMemo<EChartsOption>(() => {
    if (!data || data.length === 0) return {};

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const p = arr[0] as { name?: string; value?: unknown };
          if (!p?.name) return "";
          const val = typeof p.value === "number" ? p.value : 0;
          return `${p.name}<br/>Sessions: <strong>${val}</strong>`;
        },
      },
      grid: { left: 10, right: 20, top: 20, bottom: 10, containLabel: true },
      xAxis: {
        type: "category",
        data: data.map((d) => d.label),
        axisLabel: { fontSize: 11, rotate: data.length > 5 ? 30 : 0 },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { fontSize: 11 },
        splitLine: { lineStyle: { type: "dashed", opacity: 0.3 } },
        axisLine: { show: false },
      },
      series: [
        {
          type: "bar",
          data: data.map((d) => d.count),
          itemStyle: {
            color: "#6366f1",
            borderRadius: [4, 4, 0, 0],
          },
          barMaxWidth: 40,
          label: {
            show: true,
            position: "top",
            fontSize: 11,
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
        No daily data available
      </div>
    );
  }

  return <div ref={chartRef} className="w-full h-full min-h-62.5" />;
}
