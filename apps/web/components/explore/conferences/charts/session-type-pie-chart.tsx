"use client";

import { useMemo } from "react";
import { useECharts } from "@/lib/hooks/use-echarts";
import type { EChartsOption } from "echarts";

const TYPE_COLORS: Record<string, string> = {
  Keynote: "#6366f1",
  Workshop: "#f59e0b",
  Tutorial: "#10b981",
  "Paper Session": "#ef4444",
  Panel: "#8b5cf6",
  Demo: "#06b6d4",
  Social: "#f97316",
  "Poster Session": "#ec4899",
};

interface SessionTypePieChartProps {
  data: { type: string; count: number }[];
}

export function SessionTypePieChart({ data }: SessionTypePieChartProps) {
  const option = useMemo<EChartsOption>(() => {
    if (!data || data.length === 0) return {};

    const chartData = data
      .map((item) => ({
        name: item.type,
        value: item.count,
        itemStyle: {
          color: TYPE_COLORS[item.type] || undefined,
        },
      }))
      .sort((a, b) => b.value - a.value);

    return {
      tooltip: {
        trigger: "item",
        formatter: "{b}: {c} ({d}%)",
      },
      legend: {
        orient: "vertical",
        right: 10,
        top: "center",
        textStyle: { fontSize: 12 },
      },
      series: [
        {
          type: "pie",
          radius: ["45%", "70%"],
          center: ["35%", "50%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 4,
            borderWidth: 2,
            borderColor: "transparent",
          },
          label: { show: false },
          emphasis: {
            label: { show: true, fontSize: 14, fontWeight: "bold" },
            itemStyle: {
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowColor: "rgba(0, 0, 0, 0.3)",
            },
          },
          data: chartData,
        },
      ],
    };
  }, [data]);

  const chartRef = useECharts({ option });

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No type data available
      </div>
    );
  }

  return <div ref={chartRef} className="w-full h-full min-h-62.5" />;
}
