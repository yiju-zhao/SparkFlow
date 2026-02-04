"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTransition } from "react";

/**
 * Hook for optimistic delete operations with React Query.
 * Immediately removes the item from the cache, then performs the actual delete.
 */
export function useOptimisticDelete<T extends { id: string }>(
  queryKey: string[],
  deleteAction: (id: string) => Promise<void>
) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const handleDelete = (id: string) => {
    startTransition(async () => {
      // Optimistically remove from cache
      queryClient.setQueryData(queryKey, (old: T[] | undefined) =>
        old?.filter((item) => item.id !== id)
      );

      // Perform the actual delete
      await deleteAction(id);

      // Invalidate to ensure consistency
      await queryClient.invalidateQueries({ queryKey });
    });
  };

  return { handleDelete, isPending };
}
