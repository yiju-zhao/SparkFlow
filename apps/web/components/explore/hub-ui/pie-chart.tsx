"use client";

import { formatNumber, DEFAULT_COLORS } from "./helpers";
import type { ChartData } from "./bar-chart";

export function PieChart({ data }: { data: ChartData }) {
  const labels = data.labels ?? [];
  const values = data.values ?? [];
  const colors = data.colors ?? DEFAULT_COLORS;
  const total = values.reduce((s, v) => s + v, 0) || 1;

  return (
    <div>
      {data.title && <div className="text-base font-semibold mb-3 text-center">{data.title}</div>}
      <div className="space-y-1.5">
        {labels.map((label, i) => {
          const pct = ((values[i] / total) * 100).toFixed(1);
          const color = colors[i % colors.length];
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
              <span className="truncate flex-1">{label}</span>
              <span className="font-medium">{formatNumber(values[i])}</span>
              <span className="text-muted-foreground w-12 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
