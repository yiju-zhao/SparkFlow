import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
  delta?: { label: string; trend?: "up" | "down" | "neutral" };
  className?: string;
}

export function StatsCard({ title, value, description, icon, delta, className }: StatsCardProps) {
  return (
    <div className={cn("sf-stat h-full flex flex-col gap-1.5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="sf-row-label text-[11px] tracking-[0.12em]">{title}</p>
        {icon && (
          <span className="sf-icon-tile h-7 w-7 text-sf-accent" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="sf-stat-value">{value}</span>
        {delta && (
          <span
            className={cn(
              "sf-stat-delta",
              delta.trend === "down" && "is-down",
              delta.trend === "neutral" && "text-sf-ink-4 font-medium",
            )}
          >
            {delta.label}
          </span>
        )}
      </div>
      {description && <p className="sf-stat-note">{description}</p>}
    </div>
  );
}
