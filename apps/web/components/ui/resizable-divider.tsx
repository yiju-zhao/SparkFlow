"use client";

import { useCallback, useRef, useState } from "react";
import { motion, type Transition } from "framer-motion";

interface ResizableDividerProps {
  direction: "vertical" | "horizontal";
  onDrag?: (delta: number) => void;
  onDoubleClick?: () => void;
  collapsed?: boolean;
  className?: string;
}

const springTransition: Transition = {
  type: "spring",
  stiffness: 450,
  damping: 32,
  mass: 0.6,
};

export function ResizableDivider({
  direction,
  onDrag,
  onDoubleClick,
  collapsed = false,
  className = "",
}: ResizableDividerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const startPositionRef = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPositionRef.current =
        direction === "horizontal" ? e.clientY : e.clientX;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentPosition =
          direction === "horizontal" ? moveEvent.clientY : moveEvent.clientX;
        const delta = currentPosition - startPositionRef.current;
        startPositionRef.current = currentPosition;
        onDrag?.(delta);
      };

      const handleMouseUp = () => {
        setIsDragging(false);
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "none";
      document.body.style.cursor =
        direction === "vertical" ? "col-resize" : "row-resize";
    },
    [direction, onDrag]
  );

  const handleDoubleClick = useCallback(() => {
    onDoubleClick?.();
  }, [onDoubleClick]);

  const isVertical = direction === "vertical";

  const baseStyles = `
    ${isVertical ? "w-[2px]" : "h-[2px]"}
    ${isVertical ? "cursor-col-resize" : "cursor-row-resize"}
    shrink-0
    bg-divider
    dark:bg-divider
    transition-colors
    duration-150
  `;

  const hoverStyles = isHovered && !collapsed
    ? "bg-divider dark:bg-divider"
    : "";

  const dragStyles = isDragging
    ? "bg-divider dark:bg-divider"
    : "";

  const borderStyles = "";

  return (
    <motion.div
      className={`
        ${baseStyles}
        ${hoverStyles}
        ${dragStyles}
        ${borderStyles}
        ${className}
      `}
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      initial={false}
      animate={{
        backgroundColor: isDragging
          ? "rgba(var(--divider-rgb), 0.8)"
          : "rgba(var(--divider-rgb), 1)",
      }}
      transition={isDragging ? { duration: 0.1 } : springTransition}
      style={{
        flexShrink: 0,
        willChange: "background-color",
      }}
      data-dragging={isDragging}
    />
  );
}
