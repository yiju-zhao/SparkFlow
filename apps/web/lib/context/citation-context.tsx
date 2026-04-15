"use client";

import { createContext, useContext, useCallback, useRef, ReactNode } from "react";

interface CitationContextValue {
  navigateToChunk: (chunkId: string) => void;
  navigateToSource: (sourceId: string) => void;
  setOnNavigate: (handler: ((chunkId: string) => void) | null) => void;
  setOnNavigateSource: (handler: ((sourceId: string) => void) | null) => void;
}

const CitationContext = createContext<CitationContextValue | null>(null);

export function CitationProvider({ children }: { children: ReactNode }) {
  const onNavigateRef = useRef<((chunkId: string) => void) | null>(null);
  const onNavigateSourceRef = useRef<((sourceId: string) => void) | null>(null);

  const setOnNavigate = useCallback((handler: ((chunkId: string) => void) | null) => {
    onNavigateRef.current = handler;
  }, []);

  const setOnNavigateSource = useCallback((handler: ((sourceId: string) => void) | null) => {
    onNavigateSourceRef.current = handler;
  }, []);

  const navigateToChunk = useCallback((chunkId: string) => {
    onNavigateRef.current?.(chunkId);
  }, []);

  const navigateToSource = useCallback((sourceId: string) => {
    onNavigateSourceRef.current?.(sourceId);
  }, []);

  return (
    <CitationContext.Provider
      value={{ navigateToChunk, navigateToSource, setOnNavigate, setOnNavigateSource }}
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
