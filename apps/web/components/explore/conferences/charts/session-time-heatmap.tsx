"use client";

import { useMemo } from "react";
import { useECharts } from "@/lib/hooks/use-echarts";
import type { EChartsOption } from "echarts";

type TooltipParams =
  | {
      dataIndex?: number;
      value?: number | number[];
      data?: unknown;
      name?: string;
    }
  | Array<{ dataIndex?: number; value?: number | number[]; data?: unknown; name?: string }>;

interface SessionTimeHeatmapProps {
  data: { day: string; hour: string; count: number }[];
  days: string[];
  hours: string[];
}

export function SessionTimeHeatmap({ data, days, hours }: SessionTimeHeatmapProps) {
  const option = useMemo<EChartsOption>(() => {
    if (!data || data.length === 0) return {};

    const maxCount = Math.max(...data.map((d) => d.count));

    // ECharts heatmap expects [xIndex, yIndex, value]
    const heatData = data.map((d) => [days.indexOf(d.day), hours.indexOf(d.hour), d.count]);

    return {
      tooltip: {
        formatter: (params: TooltipParams) => {
          const p = Array.isArray(params) ? params[0] : params;
          const arr = Array.isArray(p.data) ? p.data : [];
          const [dayIdx, hourIdx, count] = arr;
          if (dayIdx === undefined || hourIdx === undefined) return "";
          return `${days[dayIdx]}, ${hours[hourIdx]}<br/>Sessions: <strong>${count}</strong>`;
        },
      },
      grid: { left: 60, right: 30, top: 10, bottom: 40 },
      xAxis: {
        type: "category",
        data: days,
        axisLabel: { fontSize: 11, rotate: days.length > 5 ? 30 : 0 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitArea: { show: true },
      },
      yAxis: {
        type: "category",
        data: hours,
        axisLabel: { fontSize: 11 },
        axisLine: { show: false },
        axisTick: { show: false },
        splitArea: { show: true },
      },
      visualMap: {
        min: 0,
        max: maxCount || 1,
        calculable: false,
        orient: "horizontal",
        left: "center",
        bottom: 0,
        show: false,
        inRange: {
          color: ["#eef2ff", "#818cf8", "#4338ca"],
        },
      },
      series: [
        {
          type: "heatmap",
          data: heatData,
          label: {
            show: true,
            fontSize: 11,
            color: "inherit",
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: "rgba(0, 0, 0, 0.3)",
            },
          },
          itemStyle: {
            borderWidth: 2,
            borderColor: "transparent",
            borderRadius: 3,
          },
        },
      ],
    };
  }, [data, days, hours]);

  const chartRef = useECharts({ option });

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        No schedule data available
      </div>
    );
  }

  return <div ref={chartRef} className="w-full h-full min-h-62.5" />;
}
