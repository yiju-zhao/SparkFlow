"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTransition } from "react";

/**
 * Hook for optimistic create operations with React Query.
 * Immediately adds a temporary item to the cache, then performs the actual create.
 */
export function useOptimisticCreate<T, TInput>(
  queryKey: string[],
  createAction: (input: TInput) => Promise<T>,
  tempItemFactory: (input: TInput) => T
) {
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const handleCreate = async (input: TInput, onSuccess?: () => void) => {
    startTransition(async () => {
      // Create temporary item and add to cache
      const tempItem = tempItemFactory(input);
      queryClient.setQueryData(queryKey, (old: T[] | undefined) =>
        old ? [tempItem, ...old] : [tempItem]
      );

      // Call success callback early for UI feedback
      onSuccess?.();

      try {
        // Perform the actual create
        const created = await createAction(input);

        // Replace temp item with real item
        queryClient.setQueryData(queryKey, (old: T[] | undefined) =>
          old?.map((item) =>
            (item as { id?: string }).id === (tempItem as { id?: string }).id
              ? created
              : item
          )
        );
      } finally {
        // Invalidate to ensure consistency
        await queryClient.invalidateQueries({ queryKey });
      }
    });
  };

  return { handleCreate, isPending };
}
