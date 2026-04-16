"use client";

import { formatNumber, DEFAULT_COLORS } from "./helpers";

export interface ChartData {
  title?: string;
  subtitle?: string;
  chartType?: "bar" | "line" | "pie";
  type?: "bar" | "line" | "pie";
  labels?: string[];
  values?: number[];
  colors?: string[];
  drilldownPromptTemplate?: string;
}

export function BarChart({
  data,
  onFollowUp,
}: {
  data: ChartData;
  onFollowUp?: (message: string) => void;
}) {
  const labels = data.labels ?? [];
  const values = data.values ?? [];
  const colors = data.colors ?? DEFAULT_COLORS;
  const maxValue = Math.max(...values, 1);

  const handleBarClick = (label: string, value: number) => {
    if (!data.drilldownPromptTemplate) return;
    const msg = data.drilldownPromptTemplate
      .replaceAll("{{label}}", label)
      .replaceAll("{{value}}", String(value))
      .replaceAll("{{title}}", data.title ?? "");
    if (msg) onFollowUp?.(msg);
  };

  return (
    <div>
      {data.title && <div className="text-base font-semibold mb-1 text-center">{data.title}</div>}
      {data.subtitle && (
        <div className="text-xs text-muted-foreground mb-3 text-center">{data.subtitle}</div>
      )}
      <div className="space-y-2">
        {labels.map((label, i) => {
          const pct = (values[i] / maxValue) * 100;
          const color = colors[i % colors.length];
          return (
            <div
              key={i}
              className={data.drilldownPromptTemplate ? "cursor-pointer" : ""}
              onClick={() => handleBarClick(label, values[i])}
            >
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="truncate mr-2">{label}</span>
                <span className="font-medium shrink-0">{formatNumber(values[i])}</span>
              </div>
              <div className="h-5 w-full rounded bg-muted overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
