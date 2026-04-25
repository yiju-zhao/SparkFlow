"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { GuideStepPlacement } from "@/content/guides/types";
import { GuideBubble } from "./guide-bubble";

interface GuideLayerProps {
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
      return {
        top: rect.top - 12,
        left: rect.left + rect.width / 2,
        x: "-50%",
        y: "-100%",
      };
    case "bottom":
      return {
        top: rect.top + rect.height + 12,
        left: rect.left + rect.width / 2,
        x: "-50%",
        y: 0,
      };
    case "left":
      return {
        top: rect.top + rect.height / 2,
        left: rect.left - 12,
        x: "-100%",
        y: "-50%",
      };
    case "right":
      return {
        top: rect.top + rect.height / 2,
        left: rect.left + rect.width + 12,
        x: 0,
        y: "-50%",
      };
  }
}

/**
 * Lighter guide overlay: ring around the target element + floating bubble.
 * No dark mask — page stays fully interactive. Used by the drawer Play mode.
 * Step transitions animate via Framer (spring on position).
 */
export function GuideLayer({
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
}: GuideLayerProps) {
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
      // Skip events that originated inside the guide overlay — the bubble's
      // Next / Back buttons handle Enter natively, so letting the window
      // listener ALSO fire would advance twice.
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

  // Mobile: always a bottom sheet, no ring.
  if (isMobile) {
    return createPortal(
      <AnimatePresence>
        <motion.div
          key="guide-layer-mobile"
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

  // No target → centered bubble (intro / fallback).
  if (!rect) {
    return createPortal(
      <AnimatePresence>
        <motion.div
          key="guide-layer-centered"
          data-guide-portal
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="pointer-events-auto fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2"
        >
          {bubble}
        </motion.div>
      </AnimatePresence>,
      document.body,
    );
  }

  const pos = tooltipPosition(rect, placement);

  return createPortal(
    <>
      {/* Ring — animated position */}
      <motion.div
        key="guide-layer-ring"
        data-guide-portal
        initial={false}
        animate={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
        transition={SPRING}
        className="pointer-events-none fixed z-50 rounded-md ring-2 ring-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.15)]"
      />
      {/* Bubble — also animated */}
      <motion.div
        key="guide-layer-bubble"
        data-guide-portal
        initial={false}
        animate={{
          top: pos.top,
          left: pos.left,
          x: pos.x,
          y: pos.y,
        }}
        transition={SPRING}
        className="pointer-events-auto fixed z-50"
      >
        {bubble}
      </motion.div>
    </>,
    document.body,
  );
}
