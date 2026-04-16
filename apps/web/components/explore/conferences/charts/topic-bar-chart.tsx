"use client";

import { useMemo } from "react";
import { useECharts } from "@/lib/hooks/use-echarts";
import { ConferenceStats } from "@/lib/explore/types";
import type { EChartsOption } from "echarts";

interface TopicBarChartProps {
  data: ConferenceStats["topTopics"];
}

export function TopicBarChart({ data }: TopicBarChartProps) {
  const option = useMemo<EChartsOption>(() => {
    if (!data || data.length === 0) return {};

    // Sort ascending and take top 10
    const sortedData = [...data].sort((a, b) => a.count - b.count).slice(-10);

    const names = sortedData.map((d) =>
      d.topic.length > 25 ? `${d.topic.substring(0, 25)}...` : d.topic,
    );
    const values = sortedData.map((d) => d.count);

    return {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params: unknown) => {
          const arr = Array.isArray(params) ? params : [params];
          const first = arr[0] as { dataIndex?: number; value?: unknown };
          const idx = first?.dataIndex;
          if (idx === undefined || idx < 0) return "";
          const fullTopic = sortedData[idx].topic;
          const val = typeof first.value === "number" ? first.value : 0;
          return `${fullTopic}<br/>Publications: <strong>${val}</strong>`;
        },
      },
      grid: {
        left: 10,
        right: 30,
        top: 10,
        bottom: 10,
        containLabel: true,
      },
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
        axisLabel: {
          fontSize: 11,
          width: 120,
          overflow: "truncate",
        },
      },
      series: [
        {
          type: "bar",
          data: values,
          itemStyle: {
            color: "hsl(262.1, 83.3%, 57.8%)", // violet-500
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
