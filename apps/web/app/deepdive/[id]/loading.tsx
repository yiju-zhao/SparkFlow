"use client";

import { Skeleton } from "@/components/ui/skeleton";

export default function NotebookLoading() {
    return (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
            {/* Header Skeleton */}
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded" />
                    <div>
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="mt-1 h-3 w-48" />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded" />
                    <Skeleton className="h-8 w-8 rounded" />
                    <Skeleton className="h-8 w-8 rounded" />
                </div>
            </header>

            {/* Main Content - 3 Panel Grid Skeleton */}
            <div className="flex flex-1 overflow-hidden">
                {/* Sources Panel Skeleton (Left) */}
                <div className="h-full w-[280px] shrink-0 border-r border-border">
                    <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between border-b border-border px-4 py-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-6 w-12 rounded" />
                        </div>
                        <div className="flex-1 space-y-2 p-2">
                            {[...Array(5)].map((_, i) => (
                                <div key={i} className="flex items-start gap-3 rounded-lg px-3 py-2">
                                    <Skeleton className="mt-0.5 h-4 w-4" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-3/4" />
                                        <Skeleton className="h-3 w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Chat Panel Skeleton (Center) */}
                <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="flex items-center justify-between border-b border-border px-4 py-2">
                        <Skeleton className="h-4 w-10" />
                        <div className="flex gap-1">
                            <Skeleton className="h-7 w-7 rounded" />
                            <Skeleton className="h-7 w-7 rounded" />
                        </div>
                    </div>
                    <div className="flex-1 p-4">
                        <div className="flex h-full items-center justify-center">
                            <div className="text-center">
                                <Skeleton className="mx-auto h-8 w-8 rounded-full" />
                                <Skeleton className="mx-auto mt-2 h-4 w-32" />
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-border p-4">
                        <div className="flex gap-2">
                            <Skeleton className="h-10 flex-1 rounded-md" />
                            <Skeleton className="h-10 w-10 rounded-md" />
                        </div>
                    </div>
                </div>

                {/* Studio Panel Skeleton (Right) */}
                <div className="h-full w-[320px] shrink-0 border-l border-border">
                    <div className="flex h-full flex-col">
                        <div className="flex items-center justify-between border-b border-border px-4 py-2">
                            <Skeleton className="h-4 w-12" />
                            <Skeleton className="h-6 w-12 rounded" />
                        </div>
                        <div className="flex-1 space-y-3 p-3">
                            {[...Array(3)].map((_, i) => (
                                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <Skeleton className="h-4 w-3/4" />
                                        <Skeleton className="h-4 w-4 rounded-full" />
                                    </div>
                                    <Skeleton className="h-3 w-full" />
                                    <Skeleton className="h-3 w-2/3" />
                                    <div className="flex items-center gap-2 pt-1">
                                        <Skeleton className="h-4 w-12 rounded-full" />
                                        <Skeleton className="h-3 w-16" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
