"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TourProgress } from "@/content/guides/types";
import { TOUR_PROGRESS_STORAGE_KEY } from "@/content/guides/types";
import { useGuides } from "./guide-provider";

export function useFirstRunTour() {
  const { loading, tourCompletedAt, markTourCompleted } = useGuides();
  const [stage, setStage] = useState<"idle" | "welcome" | "running" | "done">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (tourCompletedAt) {
      setStage("done");
      return;
    }
    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem(TOUR_PROGRESS_STORAGE_KEY);
      if (raw) {
        try {
          const progress = JSON.parse(raw) as TourProgress;
          setStepIndex(progress.stepIndex);
          setStage("running");
          return;
        } catch {
          /* ignore */
        }
      }
    }
    setStage("welcome");
  }, [loading, tourCompletedAt]);

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
      setStage("running");
      saveProgress(0);
    },
    skip: async () => {
      clearProgress();
      await markTourCompleted();
      setStage("done");
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
      setStage("done");
    },
    navigate: (route: string) => router.push(route),
  };
}
