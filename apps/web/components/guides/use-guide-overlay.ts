"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { getRect, type Rect } from "./lib";

interface OverlayOptions {
  selector: string | undefined;
  onNext: () => void;
  onPrev?: () => void;
  onClose: () => void;
}

interface OverlayState {
  /** False during SSR / first render → portal is gated until hydration. */
  mounted: boolean;
  /** True under the 640px breakpoint — both overlays switch to a bottom sheet. */
  isMobile: boolean;
  /** True when the OS reports prefers-reduced-motion: reduce. */
  reducedMotion: boolean;
  /** Document-relative rect of the highlighted element, or null when missing. */
  rect: Rect | null;
}

/**
 * Shared lifecycle for tour overlays. Tracks the target element's rect, mobile
 * breakpoint, and reduced-motion preference; wires Escape / Arrow / Enter so
 * both Spotlight (first-run) and GuideLayer (drawer Play) stay in sync.
 *
 * Position tracking uses a ResizeObserver on the target plus window scroll /
 * resize listeners — far cheaper than the previous 60fps rAF burst and, more
 * importantly, keeps tracking forever (no 1500 ms cap), so panel resizes mid
 * tour update the highlight correctly.
 */
export function useGuideOverlay({ selector, onNext, onPrev, onClose }: OverlayOptions): OverlayState {
  const [rect, setRect] = useState<Rect | null>(null);
  const [lastSelector, setLastSelector] = useState<string | undefined>(selector);
  const [isMobile, setIsMobile] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  // Reset rect when the selector changes (setState-during-render — the React 19
  // idiom to derive state from a prop without a useEffect).
  if (selector !== lastSelector) {
    setLastSelector(selector);
    setRect(null);
  }

  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => setReducedMotion(mq.matches);
    handler();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useLayoutEffect(() => {
    if (!selector) return;
    let cancelled = false;
    let prev: Rect | null = null;
    let observed: Element | null = null;
    let resizeObs: ResizeObserver | null = null;
    let mutationObs: MutationObserver | null = null;

    function update() {
      if (cancelled || !selector) return;
      const next = getRect(selector);
      const changed =
        (prev === null) !== (next === null) ||
        (prev !== null &&
          next !== null &&
          (prev.top !== next.top ||
            prev.left !== next.left ||
            prev.width !== next.width ||
            prev.height !== next.height));
      if (changed) {
        prev = next;
        setRect(next);
      }
      // Re-attach the ResizeObserver if the selector now resolves to a
      // different element (e.g. the dialog the trigger opens).
      const el = selector ? document.querySelector(selector) : null;
      if (el !== observed) {
        if (resizeObs && observed) resizeObs.unobserve(observed);
        observed = el;
        if (resizeObs && el) resizeObs.observe(el);
      }
    }

    if (typeof ResizeObserver !== "undefined") {
      resizeObs = new ResizeObserver(update);
    }

    // DOM mutations can swap the matched element (e.g. before/after a
    // dialog mounts) — re-run update so we re-bind the observer.
    if (typeof MutationObserver !== "undefined") {
      mutationObs = new MutationObserver(update);
      mutationObs.observe(document.body, { childList: true, subtree: true });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    // Settle initial layout — Framer step-in animations may shift the target a
    // few frames after mount. A short rAF burst captures those without paying
    // the 60fps cost forever.
    let raf = 0;
    const start = performance.now();
    function settle() {
      update();
      if (cancelled) return;
      if (performance.now() - start < 400) {
        raf = window.requestAnimationFrame(settle);
      }
    }
    raf = window.requestAnimationFrame(settle);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      resizeObs?.disconnect();
      mutationObs?.disconnect();
    };
  }, [selector]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      // Skip events that originated inside the guide overlay — the bubble's
      // own buttons handle Enter natively, so letting this listener also fire
      // would advance twice.
      if (target?.closest("[data-guide-portal]")) return;
      const tag = target?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable === true;
      if (isEditable) return;
      if (e.key === "ArrowRight" || e.key === "Enter") onNext();
      else if (e.key === "ArrowLeft" && onPrev) onPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext, onPrev, onClose]);

  return { mounted, isMobile, reducedMotion, rect };
}
