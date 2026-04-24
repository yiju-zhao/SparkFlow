"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { GuideStepPlacement } from "@/content/guides/types";

interface SpotlightProps {
  selector: string;
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

const PADDING = 6;

function getRect(selector: string): Rect | null {
  if (typeof document === "undefined") return null;
  const el = document.querySelector(selector);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top + window.scrollY - PADDING,
    left: r.left + window.scrollX - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  };
}

function tooltipPosition(rect: Rect, placement: GuideStepPlacement) {
  switch (placement) {
    case "top":
      return { top: rect.top - 12, left: rect.left + rect.width / 2, transform: "translate(-50%, -100%)" };
    case "bottom":
      return { top: rect.top + rect.height + 12, left: rect.left + rect.width / 2, transform: "translate(-50%, 0)" };
    case "left":
      return { top: rect.top + rect.height / 2, left: rect.left - 12, transform: "translate(-100%, -50%)" };
    case "right":
      return { top: rect.top + rect.height / 2, left: rect.left + rect.width + 12, transform: "translate(0, -50%)" };
  }
}

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
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    let raf = 0;
    let prev: Rect | null = null;
    function update() {
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
    // Poll with RAF for ~1s to catch late-mounting anchors, then settle.
    const timeout = window.setTimeout(() => {
      window.cancelAnimationFrame(raf);
    }, 1000);
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

  const isLast = stepIndex === totalSteps - 1;

  return createPortal(
    <AnimatePresence>
      <motion.div
        key="spotlight-root"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="pointer-events-none fixed inset-0 z-50"
      >
        {rect ? (
          <>
            {/* Four masking divs around the hole */}
            <div
              className="pointer-events-auto fixed bg-black/55"
              style={{ top: 0, left: 0, right: 0, height: rect.top }}
              onClick={onClose}
            />
            <div
              className="pointer-events-auto fixed bg-black/55"
              style={{ top: rect.top + rect.height, left: 0, right: 0, bottom: 0 }}
              onClick={onClose}
            />
            <div
              className="pointer-events-auto fixed bg-black/55"
              style={{ top: rect.top, left: 0, width: rect.left, height: rect.height }}
              onClick={onClose}
            />
            <div
              className="pointer-events-auto fixed bg-black/55"
              style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }}
              onClick={onClose}
            />
            {/* Hole outline */}
            <div
              className="pointer-events-none fixed rounded-md ring-2 ring-indigo-500"
              style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
            />
            {/* Tooltip */}
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="pointer-events-auto fixed z-10 max-w-80 rounded-lg border border-border bg-background p-4 shadow-xl"
              style={tooltipPosition(rect, placement)}
            >
              <div className="mb-1 text-xs text-muted-foreground">
                {stepIndex + 1} / {totalSteps}
              </div>
              <div className="mb-1 text-sm font-semibold">{title}</div>
              <div className="mb-3 text-sm text-muted-foreground">{body}</div>
              <div className="flex items-center justify-between gap-2">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                  type="button"
                >
                  {closeLabel}
                </button>
                <div className="flex gap-2">
                  {onPrev && stepIndex > 0 ? (
                    <button
                      className="rounded border border-border px-3 py-1 text-xs"
                      onClick={onPrev}
                      type="button"
                    >
                      {prevLabel}
                    </button>
                  ) : null}
                  <button
                    className="rounded bg-indigo-500 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-600"
                    onClick={onNext}
                    type="button"
                  >
                    {isLast ? finishLabel : nextLabel}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        ) : (
          /* Anchor not yet in DOM — show a centered fallback card so the tour doesn't stall. */
          <div className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-black/55" onClick={onClose}>
            <div
              className="max-w-80 rounded-lg border border-border bg-background p-4 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-1 text-xs text-muted-foreground">
                {stepIndex + 1} / {totalSteps}
              </div>
              <div className="mb-1 text-sm font-semibold">{title}</div>
              <div className="mb-3 text-sm text-muted-foreground">{body}</div>
              <div className="flex justify-end gap-2">
                <button
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={onClose}
                  type="button"
                >
                  {closeLabel}
                </button>
                <button
                  className="rounded bg-indigo-500 px-3 py-1 text-xs font-medium text-white"
                  onClick={onNext}
                  type="button"
                >
                  {isLast ? finishLabel : nextLabel}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
