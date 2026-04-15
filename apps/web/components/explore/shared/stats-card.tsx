// apps/web/components/explore/shared/stats-card.tsx

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon?: React.ReactNode;
}

export function StatsCard({ title, value, description, icon }: StatsCardProps) {
  return (
    <div className="bg-card rounded-lg p-6 h-full transition-colors hover:bg-card/80">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight">{value}</p>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {icon && <div className="p-3 rounded-lg bg-secondary text-muted-foreground">{icon}</div>}
      </div>
    </div>
  );
}
