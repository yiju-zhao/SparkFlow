"use client";

import { useEffect } from "react";

export function ScrollbarAutoHide() {
  useEffect(() => {
    const timeouts = new WeakMap<Element, ReturnType<typeof setTimeout>>();
    const handler = (e: Event) => {
      let el = e.target as Element | null;
      if (el === (document as unknown)) el = document.documentElement;
      if (!el || !(el instanceof HTMLElement)) return;
      el.dataset.scrolling = "";
      const prev = timeouts.get(el);
      if (prev) clearTimeout(prev);
      timeouts.set(
        el,
        setTimeout(() => {
          delete el.dataset.scrolling;
        }, 800),
      );
    };
    document.addEventListener("scroll", handler, true);
    return () => document.removeEventListener("scroll", handler, true);
  }, []);

  return null;
}
