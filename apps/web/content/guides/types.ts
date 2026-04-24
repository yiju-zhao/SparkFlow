export type GuideCategory = "deepdive" | "explore" | "account";

export type GuideStepPlacement = "top" | "bottom" | "left" | "right";

/**
 * Action fired BEFORE the step is shown to the user.
 * - `action`: invokes a named handler registered via GuideProvider.registerGuideAction(name).
 *   Handlers typically mutate local UI state (open a dialog, switch a tab).
 * - `navigate`: convenience equivalent to `route`.
 */
export type GuideTrigger =
  | { kind: "action"; name: string }
  | { kind: "navigate"; route: string };

export type GuideAdvanceMode = "next" | "selector-click" | "both";

export interface GuideStep {
  /**
   * CSS selector for the anchor element, e.g. '[data-guide="new-notebook-button"]'.
   * Optional — intro / outro steps without a specific target render a centered bubble.
   */
  selector?: string;
  placement: GuideStepPlacement;
  /** next-intl key under the `guides.*` namespace. */
  titleKey: string;
  /** next-intl key under the `guides.*` namespace. */
  bodyKey: string;
  /** Optional route to push before showing this step, e.g. '/deepdive'. */
  route?: string;
  /** Fired after navigation (if any) and before the step renders. */
  trigger?: GuideTrigger;
  /** Block rendering until this element appears (or the timeout elapses). */
  waitForSelector?: { selector: string; timeoutMs?: number };
  /**
   * How the step advances.
   * - `next`: only the bubble's Next button advances
   * - `selector-click`: only clicking the highlighted element advances
   * - `both` (default): either works; the user's click still reaches the real element
   */
  advanceOn?: GuideAdvanceMode;
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
