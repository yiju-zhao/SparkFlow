import { Skeleton } from "@/components/ui/skeleton";

export default function WechatLoading() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <Skeleton className="h-4 w-60 mb-2" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-4 w-40 mt-2" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-45" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 flex-1" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border overflow-hidden">
            <Skeleton className="h-40 w-full" />
            <div className="p-4 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex justify-between pt-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
