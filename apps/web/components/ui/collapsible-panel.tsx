"use client";

import { type ReactNode, createContext, useContext, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, type Transition } from "framer-motion";

// Context to expose animation state to children
interface CollapsiblePanelContextValue {
  isAnimationComplete: boolean;
}

const CollapsiblePanelContext = createContext<CollapsiblePanelContextValue | null>(null);

export function useCollapsiblePanel() {
  return useContext(CollapsiblePanelContext);
}

interface CollapsiblePanelProps {
  isOpen: boolean;
  width: number;
  side: "left" | "right";
  children: ReactNode;
  className?: string;
}

// Spring configuration for refined, editorial feel
// Slightly underdamped for subtle organic motion without being bouncy
const springTransition: Transition = {
  type: "spring",
  stiffness: 320,
  damping: 36,
  mass: 0.95,
};

export function CollapsiblePanel({
  isOpen,
  width,
  side,
  children,
  className = "",
}: CollapsiblePanelProps) {
  const [isAnimationComplete, setIsAnimationComplete] = useState(false);
  const wasOpenRef = useRef(isOpen);

  useEffect(() => {
    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Determine border based on side
  const borderClass = side === "left" ? "border-r" : "border-l";

  // Calculate current animated width
  const animatedWidth = isOpen ? width : 0;

  return (
    <CollapsiblePanelContext.Provider value={{ isAnimationComplete }}>
      <motion.div
        className={`h-full shrink-0 overflow-hidden ${borderClass} border-border ${className}`}
        initial={false}
        animate={{
          width: animatedWidth,
          opacity: isOpen ? 1 : 0,
        }}
        transition={springTransition}
        onAnimationStart={() => {
          const wasOpen = wasOpenRef.current;
          if ((isOpen && !wasOpen) || (!isOpen && wasOpen)) {
            setIsAnimationComplete(false);
          }
        }}
        onAnimationComplete={() => {
          if (isOpen) {
            setIsAnimationComplete(true);
          }
        }}
        style={{
          minWidth: 0,
          willChange: "width, opacity",
        }}
      >
        <AnimatePresence mode="wait">
          {isOpen && (
            <motion.div
              key="content"
              className="h-full"
              style={{
                width,
                minWidth: width,
              }}
              initial={{ opacity: 0, x: side === "left" ? -12 : 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 0 }}
              transition={{
                opacity: { duration: 0.2, delay: 0.06 },
                x: { ...springTransition, delay: 0.03 },
              }}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </CollapsiblePanelContext.Provider>
  );
}
