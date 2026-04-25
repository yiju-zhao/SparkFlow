"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import type { EChartsOption, ECharts } from "echarts";

interface UseEChartsOptions {
  option: EChartsOption;
}

export function useECharts({ option }: UseEChartsOptions) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<ECharts | null>(null);
  const { resolvedTheme } = useTheme();

  // Hydration-safe "are we on the client" signal — React-19-sanctioned way
  // that avoids the setState-in-effect pattern.
  const isMounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Initialize and update chart
  useEffect(() => {
    if (!isMounted || !chartRef.current) return;

    let cancelled = false;

    import("echarts").then((echarts) => {
      if (cancelled || !chartRef.current) return;

      const theme = resolvedTheme === "dark" ? "dark" : undefined;

      // Dispose existing instance if theme changes
      if (chartInstance.current) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }

      // Initialize chart with theme
      chartInstance.current = echarts.init(chartRef.current, theme);
      chartInstance.current.setOption(option);
    });

    // Handle resize
    const handleResize = () => {
      if (chartInstance.current && !chartInstance.current.isDisposed()) {
        chartInstance.current.resize();
      }
    };
    window.addEventListener("resize", handleResize);

    // Cleanup
    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
      if (chartInstance.current && !chartInstance.current.isDisposed()) {
        chartInstance.current.dispose();
        chartInstance.current = null;
      }
    };
  }, [isMounted, option, resolvedTheme]);

  return chartRef;
}
