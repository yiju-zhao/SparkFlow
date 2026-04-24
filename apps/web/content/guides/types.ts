export type GuideCategory = "deepdive" | "explore" | "account";

export type GuideStepPlacement = "top" | "bottom" | "left" | "right";

export type GuideStepAction = "click" | "hover" | "none";

export interface GuideStep {
  /** CSS selector for the anchor element, e.g. '[data-guide="new-notebook-button"]'. */
  selector: string;
  placement: GuideStepPlacement;
  /** next-intl key under the `guides.*` namespace. */
  titleKey: string;
  /** next-intl key under the `guides.*` namespace. */
  bodyKey: string;
  action?: GuideStepAction;
  /** Optional route to push before showing this step, e.g. '/deepdive'. */
  route?: string;
}

export interface GuideDefinition {
  /** Stable, forever-unchanging ID. Used in dismissedGuides[]. */
  id: string;
  category: GuideCategory;
  /** lucide icon name (PascalCase). */
  icon: string;
  titleKey: string;
  summaryKey: string;
  /** Show even without login (on landing page). Default false. */
  publicOnLanding?: boolean;
  /** Include in the first-run 4-step tour. Default false. */
  includeInFirstRunTour?: boolean;
  /** 1-indexed order within the first-run tour. Required if includeInFirstRunTour. */
  firstRunTourOrder?: number;
  steps: GuideStep[];
}

export interface GuideState {
  tourCompletedAt: string | null;
  dismissedGuides: string[];
}

export interface TourProgress {
  stepIndex: number;
  /** Pathname where tour was suspended. */
  path: string;
  startedAt: string;
}

export const TOUR_PROGRESS_STORAGE_KEY = "sparkflow.tour.progress";
export const GUIDE_STATE_STORAGE_KEY = "sparkflow.guides.state";
