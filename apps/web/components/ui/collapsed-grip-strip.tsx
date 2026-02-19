"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CollapsedGripStripProps {
  side: "left" | "right";
  width?: number;
  onExpand: (width: number) => void;
}

const DEFAULT_WIDTH = 10;
const DRAG_THRESHOLD = 50;

export function CollapsedGripStrip({
  side,
  width = DEFAULT_WIDTH,
  onExpand,
}: CollapsedGripStripProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dragStartRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);

  const borderClasses =
    side === "left"
      ? "border-r-2 dark:border-r border-divider"
      : "border-l-2 dark:border-l border-divider";

  const bgClasses = isHovered || isDragging
    ? "bg-[#F5F5F5] dark:bg-[#1A1A1A]"
    : "bg-[#FAFAFA] dark:bg-[#0C0C0C]";

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      setIsDragging(true);
      dragStartRef.current = e.clientX;
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingRef.current || dragStartRef.current === null) return;

      const delta = side === "left"
        ? e.clientX - dragStartRef.current
        : dragStartRef.current - e.clientX;

      if (delta >= DRAG_THRESHOLD) {
        const expandedWidth = Math.max(200, delta + 100);
        onExpand(expandedWidth);
        isDraggingRef.current = false;
        setIsDragging(false);
        dragStartRef.current = null;
      }
    },
    [side, onExpand]
  );

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    setIsDragging(false);
    dragStartRef.current = null;
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      className={`h-full shrink-0 ${borderClasses} ${bgClasses} cursor-col-resize select-none flex items-center justify-center`}
      style={{ width }}
      onMouseDown={handleMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="w-1 h-1 rounded-full bg-[#A0A0A0] dark:bg-[#555555]"
          />
        ))}
      </div>
    </div>
  );
}
