"use client";

import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { GuideStepPlacement } from "@/content/guides/types";
import { GuideBubble } from "./guide-bubble";
import { REDUCED, SPRING, tooltipPosition } from "./lib";
import { useGuideOverlay } from "./use-guide-overlay";

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
        transition={transition}
        onClick={onClose}
      />
      <motion.div
        data-guide-portal
        className="pointer-events-auto fixed bg-black/55"
        animate={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }}
        transition={transition}
        onClick={onClose}
      />
      <motion.div
        data-guide-portal
        className="pointer-events-auto fixed bg-black/55"
        animate={{ top: rect.top, left: 0, width: rect.left, height: rect.height }}
        transition={transition}
        onClick={onClose}
      />
      <motion.div
        data-guide-portal
        className="pointer-events-auto fixed bg-black/55"
        animate={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }}
        transition={transition}
        onClick={onClose}
      />
      {/* Ring around the hole. */}
      <motion.div
        data-guide-portal
        className="pointer-events-none fixed rounded-md ring-2 ring-indigo-500"
        animate={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        transition={transition}
      />
      {/* Bubble. */}
      <motion.div
        data-guide-portal
        className="pointer-events-auto fixed"
        animate={{ top: pos.top, left: pos.left, x: pos.x, y: pos.y }}
        transition={transition}
      >
        {bubble}
      </motion.div>
    </div>,
    document.body,
  );
}
