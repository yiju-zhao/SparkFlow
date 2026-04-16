"use client";

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border p-4.5 bg-gradient-to-br from-[#00D084]/8 to-blue-500/4 animate-pulse">
      <div className="h-3 w-24 bg-muted rounded mb-2.5" />
      <div className="h-10 w-32 bg-muted rounded mb-2" />
      <div className="h-3 w-40 bg-muted rounded" />
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-5 w-36 bg-muted rounded mb-3" />
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {[1, 2, 3].map((i) => (
                <th key={i} className="px-3 py-2.5 bg-muted border-b-2 border-border">
                  <div className="h-3 bg-muted-foreground/20 rounded w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4].map((row) => (
              <tr key={row} className="border-b border-border">
                {[1, 2, 3].map((col) => (
                  <td key={col} className="px-3 py-2.5">
                    <div className="h-3 bg-muted rounded w-full" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ChartSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-5 w-32 bg-muted rounded mb-1 mx-auto" />
      <div className="h-3 w-24 bg-muted rounded mb-3 mx-auto" />
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div className="flex justify-between mb-0.5">
              <div className="h-3 bg-muted rounded w-24" />
              <div className="h-3 bg-muted rounded w-10" />
            </div>
            <div className="h-5 w-full rounded bg-muted overflow-hidden">
              <div
                className="h-full rounded bg-muted-foreground/20"
                style={{ width: `${40 + i * 15}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SelectSkeleton() {
  return (
    <div className="rounded-2xl border border-border p-4 bg-gradient-to-b from-[#00D084]/6 to-transparent animate-pulse">
      <div className="h-5 w-36 bg-muted rounded mb-2" />
      <div className="h-3 w-56 bg-muted rounded mb-3" />
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border p-2.5">
            <div className="h-4 bg-muted rounded w-32" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <div className="h-7 w-16 bg-muted rounded-lg" />
        <div className="h-7 w-24 bg-muted rounded-lg" />
      </div>
    </div>
  );
}

export function NavigationSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-border p-3 bg-background">
          <div className="h-4 bg-muted rounded w-40 mb-1" />
          <div className="h-3 bg-muted rounded w-56" />
        </div>
      ))}
    </div>
  );
}
