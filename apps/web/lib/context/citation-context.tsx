"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

export interface ChunkInfo {
  chunkId: string;
  docId: string;
  docName: string;
  content?: string;
}

interface CitationContextValue {
  // Chunk registry: chunkId -> ChunkInfo
  chunkRegistry: Map<string, ChunkInfo>;
  // Register chunks from tool results
  registerChunks: (chunks: ChunkInfo[]) => void;
  // Navigate to a chunk (called when citation is clicked)
  navigateToChunk: (chunkId: string) => void;
  // Callback set by NotebookLayout to handle navigation
  onNavigate: ((chunkId: string, chunkInfo: ChunkInfo) => void) | null;
  setOnNavigate: (handler: ((chunkId: string, chunkInfo: ChunkInfo) => void) | null) => void;
}

const CitationContext = createContext<CitationContextValue | null>(null);

export function CitationProvider({ children }: { children: ReactNode }) {
  const [chunkRegistry, setChunkRegistry] = useState<Map<string, ChunkInfo>>(
    () => new Map()
  );
  // Use ref for immediate access in callbacks (avoids stale closure)
  const chunkRegistryRef = useRef<Map<string, ChunkInfo>>(chunkRegistry);
  const onNavigateRef = useRef<((chunkId: string, chunkInfo: ChunkInfo) => void) | null>(null);

  const registerChunks = useCallback((chunks: ChunkInfo[]) => {
    setChunkRegistry((prev) => {
      const newMap = new Map(prev);
      for (const chunk of chunks) {
        newMap.set(chunk.chunkId, chunk);
      }
      // Keep ref in sync
      chunkRegistryRef.current = newMap;
      return newMap;
    });
  }, []);

  const setOnNavigate = useCallback(
    (handler: ((chunkId: string, chunkInfo: ChunkInfo) => void) | null) => {
      onNavigateRef.current = handler;
    },
    []
  );

  const navigateToChunk = useCallback((chunkId: string) => {
    // Use refs for immediate access
    const chunkInfo = chunkRegistryRef.current.get(chunkId);
    const handler = onNavigateRef.current;

    if (chunkInfo && handler) {
      handler(chunkId, chunkInfo);
    } else {
      console.warn(`Citation not found: ${chunkId}`, {
        hasChunkInfo: !!chunkInfo,
        hasHandler: !!handler,
        registrySize: chunkRegistryRef.current.size,
      });
    }
  }, []);

  return (
    <CitationContext.Provider
      value={{
        chunkRegistry,
        registerChunks,
        navigateToChunk,
        onNavigate: onNavigateRef.current,
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
