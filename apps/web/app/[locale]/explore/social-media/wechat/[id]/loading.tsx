import { Skeleton } from "@/components/ui/skeleton";

export default function WechatDetailLoading() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="flex gap-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-32" />
      <div className="rounded-xl border border-border overflow-hidden">
        <Skeleton className="h-60 w-full" />
        <div className="p-10 space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
