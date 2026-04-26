"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TourProgress } from "@/content/guides/types";
import { TOUR_PROGRESS_STORAGE_KEY } from "@/content/guides/types";
import { useGuides } from "./guide-provider";

export function useFirstRunTour() {
  const { loading, welcomePending, tourCompletedAt, dismissWelcome, markTourCompleted } = useGuides();

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
  const [hadResume, setHadResume] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(TOUR_PROGRESS_STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  });

  // Manual stage transitions (user clicks Start / Skip / Finish).
  const [manualStage, setManualStage] = useState<"running" | "done" | null>(null);

  // When the drawer's "Replay tour" button fires, the server flips
  // welcomePending back on. Drop stale manualStage / hadResume so the welcome
  // modal can re-appear in the same session — setState-during-render keeps
  // this side-effect free without bouncing through useEffect.
  const [lastWelcomePending, setLastWelcomePending] = useState(welcomePending);
  if (welcomePending !== lastWelcomePending) {
    setLastWelcomePending(welcomePending);
    if (welcomePending && !loading) {
      setManualStage(null);
      setHadResume(false);
      setStepIndex(0);
    }
  }

  const router = useRouter();
  const pathname = usePathname();

  // Stage decision (in priority order):
  //   1. While loading initial state → idle (don't flash a welcome).
  //   2. welcomePending true → welcome (unless user already clicked Start).
  //   3. Manual transition is the source of truth in-session.
  //   4. Resumable progress → running.
  //   5. Otherwise dormant.
  let stage: "idle" | "welcome" | "running" | "done";
  if (loading) {
    stage = "idle";
  } else if (welcomePending) {
    stage = manualStage === "running" ? "running" : "welcome";
  } else if (manualStage) {
    stage = manualStage;
  } else if (hadResume) {
    stage = "running";
  } else {
    stage = "done";
  }

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
    tourCompletedAt,
    start: async () => {
      setManualStage("running");
      saveProgress(0);
      // Flip welcomePending off so a reload mid-tour resumes via hadResume,
      // not by re-showing the welcome modal.
      await dismissWelcome();
    },
    skip: async () => {
      clearProgress();
      setManualStage("done");
      await markTourCompleted();
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
      setManualStage("done");
      await markTourCompleted();
    },
    navigate: (route: string) => router.push(route),
  };
}
