// apps/web/app/explore/conferences/[id]/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function ConferenceDetailLoading() {
  return (
    <div className="space-y-6">
      <div className="border-b pb-6">
        <div className="flex gap-2 mb-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-9 w-96" />
        <div className="flex gap-4 mt-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>

      <Skeleton className="h-10 w-64" />

      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    </div>
  )
}
