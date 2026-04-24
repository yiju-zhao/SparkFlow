"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TourProgress } from "@/content/guides/types";
import { TOUR_PROGRESS_STORAGE_KEY } from "@/content/guides/types";
import { useGuides } from "./guide-provider";

export function useFirstRunTour() {
  const { loading, tourCompletedAt, markTourCompleted } = useGuides();
  // Read resumed progress once on mount (client-only).
  const [stepIndex, setStepIndex] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = window.localStorage.getItem(TOUR_PROGRESS_STORAGE_KEY);
      if (raw) {
        const progress = JSON.parse(raw) as TourProgress;
        return typeof progress.stepIndex === "number" ? progress.stepIndex : 0;
      }
    } catch {
      /* ignore */
    }
    return 0;
  });

  // Whether there was a resumable progress marker at mount time.
  const [hadResume] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(TOUR_PROGRESS_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  });

  // Manual stage transitions (user clicks Start / Skip / Finish).
  const [manualStage, setManualStage] = useState<"running" | "done" | null>(null);

  const router = useRouter();
  const pathname = usePathname();

  // Derive stage without an effect. Order of precedence:
  //   1. Manual transitions win (user clicked a button).
  //   2. Still loading initial state → idle.
  //   3. tourCompletedAt present → done.
  //   4. Had resumable progress in localStorage → running.
  //   5. Otherwise show the welcome modal.
  const stage: "idle" | "welcome" | "running" | "done" = manualStage
    ? manualStage
    : loading
      ? "idle"
      : tourCompletedAt
        ? "done"
        : hadResume
          ? "running"
          : "welcome";

  function saveProgress(next: number) {
    if (typeof window === "undefined") return;
    const progress: TourProgress = {
      stepIndex: next,
      path: pathname ?? "/",
      startedAt: new Date().toISOString(),
    };
    window.localStorage.setItem(TOUR_PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  }

  function clearProgress() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(TOUR_PROGRESS_STORAGE_KEY);
  }

  return {
    stage,
    stepIndex,
    start: () => {
      setManualStage("running");
      saveProgress(0);
    },
    skip: async () => {
      clearProgress();
      await markTourCompleted();
      setManualStage("done");
    },
    next: () => {
      const n = stepIndex + 1;
      setStepIndex(n);
      saveProgress(n);
    },
    prev: () => {
      const n = Math.max(0, stepIndex - 1);
      setStepIndex(n);
      saveProgress(n);
    },
    finish: async () => {
      clearProgress();
      await markTourCompleted();
      setManualStage("done");
    },
    navigate: (route: string) => router.push(route),
  };
}
