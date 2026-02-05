// apps/web/app/explore/sessions/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function SessionsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-5 w-48 mt-2" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-10 w-[180px]" />
        <Skeleton className="h-10 w-[180px]" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>

      <div className="flex justify-between">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-10 w-64" />
      </div>
    </div>
  )
}
