"use client";

import { useEffect } from "react";
import { useGuides } from "./guide-provider";

export function useGuidesShortcut() {
  const { setDrawerOpen } = useGuides();

  useEffect(() => {
    let armed = false;
    let timeout = 0;

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA"].includes(target.tagName))) return;

      if (e.key === "?") {
        armed = true;
        window.clearTimeout(timeout);
        timeout = window.setTimeout(() => {
          armed = false;
        }, 1500);
        return;
      }
      if (armed && (e.key === "g" || e.key === "G")) {
        armed = false;
        setDrawerOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timeout);
    };
  }, [setDrawerOpen]);
}
