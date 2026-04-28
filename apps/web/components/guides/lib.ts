import type { Transition } from "framer-motion";
import type { GuideStepPlacement } from "@/content/guides/types";

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const RING_PADDING = 6;

// Bubble dimensions (kept in sync with GuideBubble): w-80 = 320px wide. Height
// is dynamic; ~200px is a safe upper bound used for vertical viewport clamping.
export const BUBBLE_WIDTH = 320;
export const BUBBLE_MAX_HEIGHT = 200;
export const VIEWPORT_MARGIN = 12;

export const SPRING: Transition = { type: "spring", damping: 30, stiffness: 280 };
// Used when the OS reports prefers-reduced-motion — drop the spring overshoot.
export const REDUCED: Transition = { type: "tween", duration: 0.15, ease: "easeOut" };

export function getRect(selector: string): Rect | null {
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

export function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export interface TooltipPos {
  top: number;
  left: number;
  x: string | number;
  y: string | number;
}

export function tooltipPosition(rect: Rect, placement: GuideStepPlacement): TooltipPos {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const bubbleW = Math.min(BUBBLE_WIDTH, vw * 0.9);
  const minCx = bubbleW / 2 + VIEWPORT_MARGIN;
  const maxCx = vw - bubbleW / 2 - VIEWPORT_MARGIN;
  const minCy = BUBBLE_MAX_HEIGHT / 2 + VIEWPORT_MARGIN;
  const maxCy = vh - BUBBLE_MAX_HEIGHT / 2 - VIEWPORT_MARGIN;
  switch (placement) {
    case "top":
      return {
        top: rect.top - 12,
        left: clamp(rect.left + rect.width / 2, minCx, maxCx),
        x: "-50%",
        y: "-100%",
      };
    case "bottom":
      return {
        top: rect.top + rect.height + 12,
        left: clamp(rect.left + rect.width / 2, minCx, maxCx),
        x: "-50%",
        y: 0,
      };
    case "left":
      return {
        top: clamp(rect.top + rect.height / 2, minCy, maxCy),
        left: rect.left - 12,
        x: "-100%",
        y: "-50%",
      };
    case "right":
      return {
        top: clamp(rect.top + rect.height / 2, minCy, maxCy),
        left: rect.left + rect.width + 12,
        x: 0,
        y: "-50%",
      };
  }
}
