// apps/web/app/explore/publications/[id]/loading.tsx

import { Skeleton } from '@/components/ui/skeleton'

export default function PublicationDetailLoading() {
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <div className="flex gap-2 mb-3">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-24" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-5 w-96 mt-4" />
      </div>

      <div className="flex gap-3">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-24" />
      </div>

      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />

      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  )
}
