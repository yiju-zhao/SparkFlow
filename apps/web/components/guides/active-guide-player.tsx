"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { GUIDES } from "@/content/guides";
import type { GuideTrigger } from "@/content/guides/types";
import { GuideLayer } from "./guide-layer";
import { useGuides } from "./guide-provider";

/**
 * Player for guides invoked from the drawer "Play" button.
 *
 * Per step, in order:
 *   1. Navigate if `step.route` is set and we're not already there.
 *   2. Run `step.trigger` (navigate OR named action, or an array of either).
 *      When an array, triggers run sequentially — steps can declare multiple
 *      UI-state side effects (open dialog + switch tab) to converge on their
 *      required state from any direction (forward next OR backward prev).
 *   3. Optionally wait for `step.waitForSelector` before rendering the overlay.
 *   4. Render the <GuideLayer> (soft ring + bubble, no dark mask).
 *   5. Advance when the user clicks Next OR clicks the highlighted element
 *      (controlled by `step.advanceOn`, default "both"). Click does NOT
 *      preventDefault — the real button still fires (e.g. dialog opens).
 *   6. On Finish / Close / Skip run `guide.onExit` to return the page to a
 *      neutral state (e.g. close the dialog the guide opened).
 */
export function ActiveGuidePlayer() {
  const { activeGuideId, closeGuide, runGuideAction } = useGuides();
  const [stepIndex, setStepIndex] = useState(0);
  const [lastSeenGuideId, setLastSeenGuideId] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("guides.tour");
  const tGuides = useTranslations("guides");

  const guide = GUIDES.find((g) => g.id === activeGuideId) ?? null;

  // Reset stepIndex when the active guide changes.
  if (activeGuideId !== lastSeenGuideId) {
    setLastSeenGuideId(activeGuideId);
    setStepIndex(0);
  }

  const step = guide ? guide.steps[stepIndex] : null;

  const runTriggers = useCallback(
    async (triggers: GuideTrigger | GuideTrigger[] | undefined) => {
      if (!triggers) return;
      const list = Array.isArray(triggers) ? triggers : [triggers];
      for (const trigger of list) {
        if (trigger.kind === "navigate") {
          router.push(trigger.route);
        } else {
          await runGuideAction(trigger.name);
        }
      }
    },
    [router, runGuideAction],
  );

  const finishGuide = useCallback(async () => {
    if (guide?.onExit) {
      await runTriggers(guide.onExit);
    }
    closeGuide();
  }, [guide, runTriggers, closeGuide]);

  // Setup: navigate, run trigger, (optionally) wait for selector.
  // Runs whenever we move to a new step.
  const setupSeq = useRef(0);
  useEffect(() => {
    if (!step) return;
    const seq = ++setupSeq.current;
    let cancelled = false;

    async function setup() {
      if (!step) return;
      // 1. Route — navigate if we're not on the exact route.
      if (step.route && pathname) {
        const stripped = pathname.replace(/^\/(en|zh)(?=\/|$)/, "") || "/";
        if (stripped !== step.route) {
          router.push(step.route);
        }
      }
      // 2. Trigger(s) — may be a single trigger or an array run in sequence.
      await runTriggers(step.trigger);
      // 3. waitForSelector (best-effort; if it never shows up the layer still
      //    renders a centered fallback)
      if (step.waitForSelector) {
        const timeoutMs = step.waitForSelector.timeoutMs ?? 1000;
        const start = Date.now();
        while (!cancelled && seq === setupSeq.current && Date.now() - start < timeoutMs) {
          if (document.querySelector(step.waitForSelector.selector)) break;
          await new Promise((r) => setTimeout(r, 50));
        }
      }
    }
    setup();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGuideId, stepIndex]);

  // While a guide is running, the guide's own overlay (Next / Back / Close)
  // is the ONLY interactive surface. Block clicks, keystrokes, and focus on
  // every other element so the user can't type into highlighted inputs,
  // submit forms, or tab into the page.
  useEffect(() => {
    if (!guide || !step) return;

    function isInPortal(target: EventTarget | null) {
      return target instanceof HTMLElement && Boolean(target.closest("[data-guide-portal]"));
    }

    function onClick(e: MouseEvent) {
      if (isInPortal(e.target)) return;
      e.stopImmediatePropagation();
      e.preventDefault();
    }

    // preventDefault on keydown suppresses character insertion and default
    // actions (form submit, button-as-Enter) while still letting the guide's
    // own window-level keyboard handler bubble up to handle Next / Back /
    // Escape. Don't stopImmediatePropagation — that would kill the guide
    // handler too.
    function onKeyDown(e: KeyboardEvent) {
      if (isInPortal(e.target)) return;
      e.preventDefault();
    }

    // Radix focus traps re-focus the first input when a dialog opens. Steal
    // focus back onto body so highlighted inputs don't get a visible cursor.
    function onFocusIn(e: FocusEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-guide-portal]")) return;
      if (target === document.body) return;
      target.blur();
    }

    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [guide, step]);

  if (!guide || !step) return null;

  const stripPrefix = (k: string) => k.replace(/^guides\./, "");

  return (
    <GuideLayer
      selector={step.selector}
      placement={step.placement}
      title={tGuides(stripPrefix(step.titleKey))}
      body={tGuides(stripPrefix(step.bodyKey))}
      stepIndex={stepIndex}
      totalSteps={guide.steps.length}
      onNext={() => {
        if (stepIndex === guide.steps.length - 1) void finishGuide();
        else setStepIndex(stepIndex + 1);
      }}
      onPrev={stepIndex > 0 ? () => setStepIndex(stepIndex - 1) : undefined}
      onClose={() => void finishGuide()}
      nextLabel={t("next")}
      prevLabel={t("prev")}
      closeLabel={t("close")}
      finishLabel={t("finish")}
    />
  );
}
