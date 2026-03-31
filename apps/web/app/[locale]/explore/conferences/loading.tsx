// apps/web/app/explore/conferences/loading.tsx

import { Skeleton } from "@/components/ui/skeleton";

export default function ConferencesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-5 w-64 mt-2" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-10 w-45" />
        <Skeleton className="h-10 w-45" />
        <Skeleton className="h-10 w-45" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-45" />
        ))}
      </div>
    </div>
  );
}
