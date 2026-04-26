"use client";

import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { GuideStepPlacement } from "@/content/guides/types";
import { GuideBubble } from "./guide-bubble";
import { REDUCED, SPRING, tooltipPosition } from "./lib";
import { useGuideOverlay } from "./use-guide-overlay";

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
  const { mounted, isMobile, reducedMotion, rect } = useGuideOverlay({
    selector,
    onNext,
    onPrev,
    onClose,
  });

  if (!mounted) return null;

  const transition = reducedMotion ? REDUCED : SPRING;

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
        transition={transition}
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
        transition={transition}
        className="pointer-events-auto fixed z-50"
      >
        {bubble}
      </motion.div>
    </>,
    document.body,
  );
}
