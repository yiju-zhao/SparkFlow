"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface AIContext {
  conferenceId?: string;
  conferenceName?: string;
  sessionId?: string;
  sessionTitle?: string;
}

interface AIContextValue {
  context: AIContext | null;
  setContext: (context: AIContext | null) => void;
}

const AIContextContext = createContext<AIContextValue | null>(null);

export function AIContextProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<AIContext | null>(null);

  return (
    <AIContextContext.Provider value={{ context, setContext }}>
      {children}
    </AIContextContext.Provider>
  );
}

export function useAIContext() {
  const value = useContext(AIContextContext);
  if (!value) {
    throw new Error("useAIContext must be used within AIContextProvider");
  }
  return value;
}

/**
 * Hook to set AI context from a page component.
 * Automatically clears context on unmount.
 */
export function useSetAIContext(context: AIContext | null) {
  const { setContext } = useAIContext();

  useEffect(() => {
    setContext(context);
    return () => setContext(null);
  }, [context, setContext]);
}
