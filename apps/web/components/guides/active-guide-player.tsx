"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { GUIDES } from "@/content/guides";
import { GuideLayer } from "./guide-layer";
import { useGuides } from "./guide-provider";

/**
 * Player for guides invoked from the drawer "Play" button.
 *
 * Per step, in order:
 *   1. Navigate if `step.route` is set and we're not already there.
 *   2. Run `step.trigger` (navigate OR named action registered by a component).
 *   3. Optionally wait for `step.waitForSelector` before rendering the overlay.
 *   4. Render the <GuideLayer> (soft ring + bubble, no dark mask).
 *   5. Advance when the user clicks Next OR clicks the highlighted element
 *      (controlled by `step.advanceOn`, default "both"). Click does NOT
 *      preventDefault — the real button still fires (e.g. dialog opens).
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

  // Setup: navigate, run trigger, (optionally) wait for selector.
  // Runs whenever we move to a new step.
  const setupSeq = useRef(0);
  useEffect(() => {
    if (!step) return;
    const seq = ++setupSeq.current;
    let cancelled = false;

    async function setup() {
      if (!step) return;
      // 1. Route
      if (step.route && pathname && !pathname.includes(step.route)) {
        router.push(step.route);
      }
      // 2. Trigger
      if (step.trigger) {
        if (step.trigger.kind === "navigate") {
          router.push(step.trigger.route);
        } else if (step.trigger.kind === "action") {
          await runGuideAction(step.trigger.name);
        }
      }
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

  // Click-to-advance: when user clicks the highlighted element, advance to the
  // next step after a short delay (so the click's natural effect — e.g. opening
  // a dialog — completes first).
  useEffect(() => {
    if (!step?.selector) return;
    const mode = step.advanceOn ?? "both";
    if (mode === "next") return;

    const selector = step.selector;
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(selector)) {
        // Let the native click fire first, then advance.
        window.setTimeout(() => {
          if (!guide) return;
          if (stepIndex === guide.steps.length - 1) closeGuide();
          else setStepIndex((n) => n + 1);
        }, 80);
      }
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [step, stepIndex, guide, closeGuide]);

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
      counterLabel={step.counterLabel}
      onNext={() => {
        if (stepIndex === guide.steps.length - 1) closeGuide();
        else setStepIndex(stepIndex + 1);
      }}
      onPrev={stepIndex > 0 ? () => setStepIndex(stepIndex - 1) : undefined}
      onClose={closeGuide}
      nextLabel={t("next")}
      prevLabel={t("prev")}
      closeLabel={t("close")}
      finishLabel={t("finish")}
    />
  );
}
