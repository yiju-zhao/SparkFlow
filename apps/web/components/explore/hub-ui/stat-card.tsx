"use client";

import { formatNumber } from "./helpers";

export interface StatCardData {
  title?: string;
  value?: string | number;
  subtitle?: string;
}

export function StatCard({ data }: { data: StatCardData }) {
  return (
    <div className="rounded-2xl border border-border p-4.5 bg-gradient-to-br from-[#00D084]/8 to-blue-500/4">
      {data.title && (
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
          {data.title}
        </div>
      )}
      <div className="text-4xl font-bold leading-none mb-2">{formatNumber(data.value)}</div>
      {data.subtitle && <div className="text-xs text-muted-foreground">{data.subtitle}</div>}
    </div>
  );
}
