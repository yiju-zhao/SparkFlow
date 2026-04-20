// apps/web/components/explore/hub/year-trend-chart.tsx

"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useECharts } from "@/lib/hooks/use-echarts";
import { BarChart3 } from "lucide-react";
import { useTheme } from "next-themes";
import type { EChartsOption } from "echarts";

interface YearTrendChartProps {
  data: { year: number; conferences: number }[];
}

export function YearTrendChart({ data }: YearTrendChartProps) {
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
        top: 20,
        right: 20,
        bottom: 20,
        left: 40,
        containLabel: true,
      },
      xAxis: {
        type: "category",
        data: data.map((d) => d.year),
        axisTick: { show: false },
        axisLine: { show: false },
        axisLabel: {
          color: theme === "dark" ? "#9aa0b7" : "#8A8F9C",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
        },
      },
      yAxis: {
        type: "value",
        splitLine: {
          lineStyle: {
            color: theme === "dark" ? "#272d40" : "#E3E5EC",
            type: "dashed",
          },
        },
        axisLabel: {
          color: theme === "dark" ? "#9aa0b7" : "#8A8F9C",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
        },
      },
      series: [
        {
          data: data.map((d) => d.conferences),
          type: "bar",
          itemStyle: {
            borderRadius: [3, 3, 0, 0],
            color: "#0F5FFE",
          },
          emphasis: {
            itemStyle: { color: "#0A49CC" },
          },
          barMaxWidth: 28,
        },
      ],
    };
  }, [data, hasData, theme]);

  const chartRef = useECharts({ option });

  return (
    <div className="sf-card">
      <h3 className="sf-row-label">{t("conferencesByYear")}</h3>
      <div className="h-65 mt-3">
        {hasData ? (
          <div ref={chartRef} className="w-full h-full" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground border border-dashed rounded-lg">
            <BarChart3 className="h-8 w-8 mb-3" />
            <p className="text-sm font-medium">{t("noData")}</p>
            <p className="text-xs mt-1">{t("noDataDesc")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
