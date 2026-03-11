// apps/web/components/explore/hub/year-trend-chart.tsx

"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useECharts } from "@/lib/hooks/use-echarts";
import { BarChart3 } from "lucide-react";
import { useTheme } from "next-themes";
import type { EChartsOption } from "echarts";

interface YearTrendChartProps {
  data: { year: number; publications: number }[];
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
          color: theme === "dark" ? "#a1a1aa" : "#71717a",
        },
      },
      yAxis: {
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
      series: [
        {
          data: data.map((d) => d.publications),
          type: "bar",
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: theme === "dark" ? "#fafafa" : "#09090b",
          },
          barMaxWidth: 40,
        },
      ],
    };
  }, [data, hasData, theme]);

  const chartRef = useECharts({ option });

  return (
    <div className="bg-card rounded-lg p-6">
      <h3 className="text-sm font-semibold mb-4">{t("publicationsByYear")}</h3>
      <div className="h-65">
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
