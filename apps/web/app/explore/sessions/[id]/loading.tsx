// apps/web/app/explore/sessions/[id]/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function SessionDetailLoading() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex gap-2 mb-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-6 w-20" />
        </div>
        <Skeleton className="h-10 w-full" />
        <div className="flex gap-4 mt-4">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-32" />
        </div>
      </div>

      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}
