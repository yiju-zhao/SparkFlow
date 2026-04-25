"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { GuideStepPlacement } from "@/content/guides/types";
import { GuideBubble } from "./guide-bubble";

interface SpotlightProps {
  /** Optional — intro / outro steps without a target render a centered bubble. */
  selector?: string;
  placement: GuideStepPlacement;
  title: string;
  body: string;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev?: () => void;
  onClose: () => void;
  nextLabel: string;
  prevLabel: string;
  closeLabel: string;
  finishLabel: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const RING_PADDING = 6;
const SPRING = { type: "spring" as const, damping: 30, stiffness: 280 };

function getRect(selector: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    top: r.top + window.scrollY - RING_PADDING,
    left: r.left + window.scrollX - RING_PADDING,
    width: r.width + RING_PADDING * 2,
    height: r.height + RING_PADDING * 2,
  };
}

function tooltipPosition(rect: Rect, placement: GuideStepPlacement) {
  switch (placement) {
    case "top":
      return { top: rect.top - 12, left: rect.left + rect.width / 2, x: "-50%", y: "-100%" };
    case "bottom":
      return { top: rect.top + rect.height + 12, left: rect.left + rect.width / 2, x: "-50%", y: 0 };
    case "left":
      return { top: rect.top + rect.height / 2, left: rect.left - 12, x: "-100%", y: "-50%" };
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.left + rect.width + 12, x: 0, y: "-50%" };
  }
}

/**
 * Dark-mask spotlight: 4 animated mask divs form a hole around the target,
 * ring outlines the hole, bubble tooltip sits beside it. Transitions between
 * steps animate smoothly via Framer springs. Used by the first-run tour.
 */
export function Spotlight({
  selector,
  placement,
  title,
  body,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onClose,
  nextLabel,
  prevLabel,
  closeLabel,
  finishLabel,
}: SpotlightProps) {
  const [rect, setRect] = useState<Rect | null>(null);
  const [lastSelector, setLastSelector] = useState<string | undefined>(selector);
  const [isMobile, setIsMobile] = useState(false);

  // Reset rect when the selector changes (setState-during-render pattern — the
  // React 19 idiom to derive state from a prop without a useEffect).
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

  useLayoutEffect(() => {
    if (!selector) return;
    let raf = 0;
    let prev: Rect | null = null;
    function update() {
      if (!selector) return;
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
      raf = window.requestAnimationFrame(update);
    }
    const timeout = window.setTimeout(() => {
      window.cancelAnimationFrame(raf);
    }, 1500);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [selector]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
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

  if (!mounted) return null;

  const bubble = (
    <GuideBubble
      title={title}
      body={body}
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      onNext={onNext}
      onPrev={onPrev}
      onClose={onClose}
      nextLabel={nextLabel}
      prevLabel={prevLabel}
      closeLabel={closeLabel}
      finishLabel={finishLabel}
    />
  );

  // Mobile: bottom sheet, no mask hole.
  if (isMobile) {
    return createPortal(
      <AnimatePresence>
        <motion.div
          key="spotlight-mobile"
          data-guide-portal
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          className="pointer-events-auto fixed right-0 bottom-0 left-0 z-50 p-3"
        >
          {bubble}
        </motion.div>
      </AnimatePresence>,
      document.body,
    );
  }

  // No target → full dark overlay with a centered bubble.
  if (!rect) {
    return createPortal(
      <motion.div
        key="spotlight-centered"
        data-guide-portal
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/55"
        onClick={onClose}
      >
        <div onClick={(e) => e.stopPropagation()}>{bubble}</div>
      </motion.div>,
      document.body,
    );
  }

  const pos = tooltipPosition(rect, placement);

  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Four animated masks forming a hole. */}
      <motion.div
        data-guide-portal
        className="pointer-events-auto fixed bg-black/55"
        animate={{ top: 0, left: 0, right: 0, height: rect.top }}
        transition={SPRING}
        onClick={onClose}
      />
      <motion.div
        data-guide-portal
        className="pointer-events-auto fixed bg-black/55"
        animate={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }}
        transition={SPRING}
        onClick={onClose}
      />
      <motion.div
        data-guide-portal
        className="pointer-events-auto fixed bg-black/55"
        animate={{ top: rect.top, left: 0, width: rect.left, height: rect.height }}
        transition={SPRING}
        onClick={onClose}
      />
      <motion.div
        data-guide-portal
        className="pointer-events-auto fixed bg-black/55"
        animate={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }}
        transition={SPRING}
        onClick={onClose}
      />
      {/* Ring around the hole. */}
      <motion.div
        data-guide-portal
        className="pointer-events-none fixed rounded-md ring-2 ring-indigo-500"
        animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        transition={SPRING}
      />
      {/* Bubble. */}
      <motion.div
        data-guide-portal
        className="pointer-events-auto fixed"
        animate={{ top: pos.top, left: pos.left, x: pos.x, y: pos.y }}
        transition={SPRING}
      >
        {bubble}
      </motion.div>
    </div>,
    document.body,
  );
}
