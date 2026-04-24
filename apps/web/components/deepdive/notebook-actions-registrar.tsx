"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGuides } from "@/components/guides/guide-provider";

/**
 * Registers guide actions that need the user's notebook list.
 * Mounted inside `/deepdive` (the list page). If the user has ≥ 1 notebook,
 * the `goto-last-notebook` action navigates into the most recent one so
 * downstream guide steps can anchor on workspace elements.
 */
export function NotebookActionsRegistrar({ notebookIds }: { notebookIds: string[] }) {
  const { registerGuideAction } = useGuides();
  const router = useRouter();

  useEffect(() => {
    const unregister = registerGuideAction("goto-last-notebook", () => {
      if (notebookIds.length > 0) {
        router.push(`/deepdive/${notebookIds[0]}`);
      }
    });
    return unregister;
  }, [registerGuideAction, notebookIds, router]);

  return null;
}
