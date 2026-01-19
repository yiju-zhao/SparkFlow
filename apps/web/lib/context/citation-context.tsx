"use client";

import { createContext, useContext, useCallback, useRef, ReactNode } from "react";

interface CitationContextValue {
  // Navigate to a chunk (called when citation is clicked)
  navigateToChunk: (chunkId: string) => void;
  // Set navigation handler (called by NotebookLayout)
  setOnNavigate: (handler: ((chunkId: string) => void) | null) => void;
}

const CitationContext = createContext<CitationContextValue | null>(null);

export function CitationProvider({ children }: { children: ReactNode }) {
  const onNavigateRef = useRef<((chunkId: string) => void) | null>(null);

  const setOnNavigate = useCallback(
    (handler: ((chunkId: string) => void) | null) => {
      onNavigateRef.current = handler;
    },
    []
  );

  const navigateToChunk = useCallback((chunkId: string) => {
    const handler = onNavigateRef.current;
    if (handler) {
      handler(chunkId);
    }
  }, []);

  return (
    <CitationContext.Provider
      value={{
        navigateToChunk,
        setOnNavigate,
      }}
    >
      {children}
    </CitationContext.Provider>
  );
}

export function useCitation() {
  const context = useContext(CitationContext);
  if (!context) {
    throw new Error("useCitation must be used within a CitationProvider");
  }
  return context;
}

// Safe hook that doesn't throw - for use in Markdown component
export function useCitationSafe() {
  return useContext(CitationContext);
}
