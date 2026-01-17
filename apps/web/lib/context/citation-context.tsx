"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

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
  const [onNavigate, setOnNavigate] = useState<
    ((chunkId: string, chunkInfo: ChunkInfo) => void) | null
  >(null);

  const registerChunks = useCallback((chunks: ChunkInfo[]) => {
    setChunkRegistry((prev) => {
      const newMap = new Map(prev);
      for (const chunk of chunks) {
        newMap.set(chunk.chunkId, chunk);
      }
      return newMap;
    });
  }, []);

  const navigateToChunk = useCallback(
    (chunkId: string) => {
      const chunkInfo = chunkRegistry.get(chunkId);
      if (chunkInfo && onNavigate) {
        onNavigate(chunkId, chunkInfo);
      }
    },
    [chunkRegistry, onNavigate]
  );

  return (
    <CitationContext.Provider
      value={{
        chunkRegistry,
        registerChunks,
        navigateToChunk,
        onNavigate,
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
