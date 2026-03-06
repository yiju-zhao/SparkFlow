"use client";

import { useMemo } from "react";
import { z } from "zod";
import { useECharts } from "@/hooks/use-echarts";
import { useTheme } from "next-themes";
import { BarChart3, TrendingUp, PieChart } from "lucide-react";
import type { EChartsOption } from "echarts";

// Zod schema for AI-generated chart props
export const GenerativeChartPropsSchema = z.object({
  title: z.string().describe("The title displayed above the chart"),
  chartType: z
    .enum(["bar", "line", "pie"])
    .describe("The type of chart to render: bar, line, or pie"),
  data: z
    .array(
      z.object({
        label: z.string().describe("The label for this data point"),
        value: z.number().describe("The numeric value for this data point"),
      })
    )
    .describe("Array of data points with labels and values"),
});

export type GenerativeChartProps = z.infer<typeof GenerativeChartPropsSchema>;

// Color palette matching existing hub charts
const COLOR_PALETTE = [
  "#00D084", // Primary green
  "#3b82f6", // Blue
  "#eab308", // Yellow
  "#a855f7", // Purple
  "#ef4444", // Red
  "#f97316", // Orange
];

export function GenerativeChart({ title, chartType, data }: GenerativeChartProps) {
  const { theme } = useTheme();
  const hasData = data && data.length > 0;

  const option = useMemo<EChartsOption>(() => {
    if (!hasData) return {};

    const isDark = theme === "dark";
    const textColor = isDark ? "#a1a1aa" : "#71717a";
    const gridColor = isDark ? "#27272a" : "#e4e4e7";

    switch (chartType) {
      case "bar":
        return {
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
          },
          grid: {
            top: 20,
            right: 20,
            bottom: 20,
            left: 10,
            containLabel: true,
          },
          xAxis: {
            type: "category",
            data: data.map((d) => d.label),
            axisTick: { show: false },
            axisLine: { show: false },
            axisLabel: {
              color: textColor,
              rotate: data.length > 6 ? 45 : 0,
            },
          },
          yAxis: {
            type: "value",
            splitLine: {
              lineStyle: { color: gridColor, type: "dashed" },
            },
            axisLabel: { color: textColor },
          },
          series: [
            {
              data: data.map((d) => d.value),
              type: "bar",
              itemStyle: {
                borderRadius: [4, 4, 0, 0],
                color: COLOR_PALETTE[0],
              },
              barMaxWidth: 40,
            },
          ],
        };

      case "line":
        return {
          tooltip: {
            trigger: "axis",
          },
          grid: {
            top: 20,
            right: 20,
            bottom: 20,
            left: 10,
            containLabel: true,
          },
          xAxis: {
            type: "category",
            data: data.map((d) => d.label),
            axisTick: { show: false },
            axisLine: { show: false },
            axisLabel: { color: textColor },
          },
          yAxis: {
            type: "value",
            splitLine: {
              lineStyle: { color: gridColor, type: "dashed" },
            },
            axisLabel: { color: textColor },
          },
          series: [
            {
              data: data.map((d) => d.value),
              type: "line",
              smooth: true,
              symbol: "circle",
              symbolSize: 8,
              lineStyle: {
                color: COLOR_PALETTE[0],
                width: 2,
              },
              itemStyle: {
                color: COLOR_PALETTE[0],
              },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: `${COLOR_PALETTE[0]}40` },
                    { offset: 1, color: `${COLOR_PALETTE[0]}05` },
                  ],
                },
              },
            },
          ],
        };

      case "pie":
        return {
          tooltip: {
            trigger: "item",
            formatter: "{b}: {c} ({d}%)",
          },
          legend: {
            orient: "vertical",
            right: 10,
            top: "center",
            textStyle: { color: textColor },
          },
          series: [
            {
              type: "pie",
              radius: ["40%", "70%"],
              center: ["40%", "50%"],
              avoidLabelOverlap: true,
              itemStyle: {
                borderRadius: 4,
                borderColor: isDark ? "#18181b" : "#fff",
                borderWidth: 2,
              },
              label: {
                show: false,
              },
              emphasis: {
                label: {
                  show: true,
                  fontSize: 12,
                  fontWeight: "bold",
                },
              },
              labelLine: { show: false },
              data: data.map((d, i) => ({
                value: d.value,
                name: d.label,
                itemStyle: { color: COLOR_PALETTE[i % COLOR_PALETTE.length] },
              })),
            },
          ],
        };

      default:
        return {};
    }
  }, [data, chartType, hasData, theme]);

  const chartRef = useECharts({ option });

  const EmptyIcon = {
    bar: BarChart3,
    line: TrendingUp,
    pie: PieChart,
  }[chartType];

  return (
    <div className="bg-card rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-4">{title}</h3>
      <div className="h-[200px]">
        {hasData ? (
          <div ref={chartRef} className="w-full h-full" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg">
            <EmptyIcon className="h-8 w-8 mb-3" />
            <p className="text-sm font-medium">No data to display</p>
            <p className="text-xs mt-1">Chart data will appear here</p>
          </div>
        )}
      </div>
    </div>
  );
}
