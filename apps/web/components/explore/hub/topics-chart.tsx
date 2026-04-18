// apps/web/components/explore/hub/topics-chart.tsx

"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useECharts } from "@/lib/hooks/use-echarts";
import { Hash } from "lucide-react";
import { useTheme } from "next-themes";
import type { EChartsOption } from "echarts";

interface TopicsChartProps {
  data: { topic: string; count: number }[];
}

export function TopicsChart({ data }: TopicsChartProps) {
  const { theme } = useTheme();
  const t = useTranslations("explore.charts");
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
          color: theme === "dark" ? "#9aa0b7" : "#8A8F9C",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
        },
      },
      yAxis: {
        type: "category",
        data: data.map((d) => d.topic),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          color: theme === "dark" ? "#c8cde0" : "#5B6070",
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          fontWeight: 500,
          width: 140,
          overflow: "truncate",
        },
      },
      series: [
        {
          data: data.map((d) => d.count),
          type: "bar",
          itemStyle: {
            borderRadius: [0, 3, 3, 0],
            color: "#0F5FFE",
          },
          emphasis: {
            itemStyle: { color: "#0A49CC" },
          },
          barMaxWidth: 22,
        },
      ],
    };
  }, [data, hasData, theme]);

  const chartRef = useECharts({ option });

  return (
    <div className="sf-card">
      <h3 className="sf-row-label">{t("topTopics")}</h3>
      <div className="h-65 mt-3">
        {hasData ? (
          <div ref={chartRef} className="w-full h-full" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg">
            <Hash className="h-8 w-8 mb-3" />
            <p className="text-sm font-medium">{t("noData")}</p>
            <p className="text-xs mt-1">{t("noDataDesc")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
