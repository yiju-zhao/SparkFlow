"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  UserNav
} from "@/components/user-nav";
import { SourcesPanel } from "@/components/deepdive/sources/sources-panel";
import { ChatPanel } from "@/components/deepdive/chat/chat-panel";
import { StudioPanel } from "@/components/deepdive/studio/studio-panel";
import { CitationProvider, useCitation } from "@/lib/context/citation-context";
import { ResizableDivider } from "@/components/ui/resizable-divider";
import { CollapsedGripStrip } from "@/components/ui/collapsed-grip-strip";

import type { Source, Note, Notebook } from "@prisma/client";

// Pre-transformed types from RSC (avoids client-side transformation)
interface TransformedChatSession {
  id: string;
  title: string;
  lastActivity: string;
  langgraphThreadId: string | null;
  _count: { messages: number };
}

interface TransformedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface NotebookLayoutProps {
  notebook: Notebook;
  sources: Source[];
  notes: Note[];
  initialChatSessions?: TransformedChatSession[];
  initialMessages?: TransformedMessage[];
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

// Hoist stable default values to module level (Vercel best practice: rerender-memo-with-default-value)
const EMPTY_SESSIONS: TransformedChatSession[] = [];
const EMPTY_MESSAGES: TransformedMessage[] = [];

// Panel width constants
const SOURCES_DEFAULT_WIDTH = 280;
const STUDIO_DEFAULT_WIDTH = 320;
const MIN_PANEL_WIDTH = 150;
const MAX_PANEL_WIDTH = 800;
const COLLAPSE_THRESHOLD = 100;

export function NotebookLayout(props: NotebookLayoutProps) {
  return (
    <CitationProvider>
      <NotebookLayoutInner {...props} />
    </CitationProvider>
  );
}

function NotebookLayoutInner({
  notebook,
  sources,
  notes,
  initialChatSessions = EMPTY_SESSIONS,
  initialMessages = EMPTY_MESSAGES,
  user,
}: NotebookLayoutProps) {
  const [sourcesWidth, setSourcesWidth] = useState(SOURCES_DEFAULT_WIDTH);
  const [studioWidth, setStudioWidth] = useState(STUDIO_DEFAULT_WIDTH);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [targetChunkId, setTargetChunkId] = useState<string | null>(null);
  const [targetContentPreview, setTargetContentPreview] = useState<
    string | null
  >(null);
  const [targetContentSuffix, setTargetContentSuffix] = useState<string | null>(
    null,
  );
  const [navigationTrigger, setNavigationTrigger] = useState(0);

  // Citation navigation setup
  const { setOnNavigate } = useCitation();

  // Clamp width to valid range or collapse
  const clampWidth = useCallback((width: number): number => {
    if (width < COLLAPSE_THRESHOLD) return 0;
    return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width));
  }, []);

  // Drag handlers for sources panel
  const handleSourcesDrag = useCallback((delta: number) => {
    setSourcesWidth((prev) => clampWidth(prev + delta));
  }, [clampWidth]);

  const handleSourcesDoubleClick = useCallback(() => {
    setSourcesWidth(SOURCES_DEFAULT_WIDTH);
  }, []);

  const handleStudioDrag = useCallback((delta: number) => {
    setStudioWidth((prev) => clampWidth(prev - delta));
  }, [clampWidth]);

  const handleStudioDoubleClick = useCallback(() => {
    setStudioWidth(STUDIO_DEFAULT_WIDTH);
  }, []);

  // Expand handlers for collapsed panels
  const handleSourcesExpand = useCallback((width: number) => {
    setSourcesWidth(Math.max(SOURCES_DEFAULT_WIDTH, width));
  }, []);

  const handleStudioExpand = useCallback((width: number) => {
    setStudioWidth(Math.max(STUDIO_DEFAULT_WIDTH, width));
  }, []);

  // Handle citation click - look up chunk via API to find source
  const handleCitationNavigate = useCallback(async (chunkId: string) => {
    try {
      const res = await fetch(`/api/chunks/${chunkId}`);
      if (!res.ok) {
        console.warn(`Chunk ${chunkId} not found`);
        return;
      }
      const data = await res.json();
      const { contentPreview, contentSuffix, source } = data;

      if (source) {
        // Expand sources panel if collapsed
        if (sourcesWidth === 0) {
          setSourcesWidth(SOURCES_DEFAULT_WIDTH);
        }
        // Use the source from API response (guaranteed to have fresh content)
        setSelectedSource(source as Source);
        setTargetChunkId(chunkId);
        setTargetContentPreview(contentPreview);
        setTargetContentSuffix(contentSuffix || null);
        setNavigationTrigger((n) => n + 1); // Force effect to run
      }
    } catch (error) {
      console.error("Failed to navigate to chunk:", error);
    }
  }, [sourcesWidth]);

  // Register navigation handler with citation context
  useEffect(() => {
    setOnNavigate(handleCitationNavigate);
    return () => setOnNavigate(null);
  }, [setOnNavigate, handleCitationNavigate]);

  // Memoized callback for chunk navigation cleanup
  const handleChunkNavigated = useCallback(() => {
    setTargetChunkId(null);
    setTargetContentPreview(null);
    setTargetContentSuffix(null);
  }, []);

  // Determine if panels are collapsed
  const sourcesCollapsed = sourcesWidth === 0;
  const studioCollapsed = studioWidth === 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Inline Header */}
      <div className="shrink-0 h-14 border-b-2 dark:border-b border-divider bg-[#FAFAFA] dark:bg-[#0C0C0C] flex items-center justify-between px-6">
        {/* Left: Breadcrumb */}
        <div className="flex items-center gap-2.5 text-sm tracking-tight">
          <Link
            href="/"
            className="text-[#666666] dark:text-[#71717A] hover:text-foreground transition-colors font-normal"
          >
            sparkflow
          </Link>
          <span className="text-[#0A0A0A] dark:text-[#CE0E2D] font-bold text-[14px]">&gt;</span>
          <Link
            href="/deepdive"
            className="text-[#666666] dark:text-[#71717A] hover:text-foreground transition-colors font-normal"
          >
            deepdive
          </Link>
          <span className="text-[#0A0A0A] dark:text-[#CE0E2D] font-bold text-[14px]">&gt;</span>
          <span className="text-[#0A0A0A] dark:text-[#8A8A8A] font-semibold dark:font-normal text-[13px] tracking-[-0.02em] truncate max-w-[400px]">
            {notebook.name}
          </span>
        </div>

        {/* Right: User */}
        <div className="flex items-center">
          {user && (
            <div className="ml-2 pl-2 border-l border-border/60">
              <UserNav user={user} />
            </div>
          )}
        </div>
      </div>

      {/* Main Content - 3 Panel Grid */}
      <div className="flex flex-1 -mt-px pt-px overflow-hidden">
        {/* Sources Panel (Left) - Collapsible */}
        {sourcesCollapsed ? (
          <CollapsedGripStrip side="left" onExpand={handleSourcesExpand} />
        ) : (
          <>
            <motion.div
              className="h-full overflow-hidden"
              style={{ width: sourcesWidth }}
              initial={false}
              animate={{ width: sourcesWidth }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            >
              <SourcesPanel
                notebookId={notebook.id}
                datasetId={notebook.ragflowDatasetId}
                sources={sources}
                selectedSource={selectedSource}
                onSelectSource={setSelectedSource}
                targetChunkId={targetChunkId}
                targetContentPreview={targetContentPreview}
                targetContentSuffix={targetContentSuffix}
                navigationTrigger={navigationTrigger}
                onChunkNavigated={handleChunkNavigated}
              />
            </motion.div>
            <ResizableDivider
              direction="vertical"
              onDrag={handleSourcesDrag}
              onDoubleClick={handleSourcesDoubleClick}
            />
          </>
        )}

        {/* Chat Panel (Center) */}
        <motion.div
          className="flex min-w-0 flex-1 flex-col overflow-hidden"
          layout
          transition={{
            layout: {
              type: "spring",
              stiffness: 400,
              damping: 35,
              mass: 0.8,
            },
          }}
        >
          <ChatPanel
            notebookId={notebook.id}
            datasetId={notebook.ragflowDatasetId}
            sources={sources}
            initialSessions={initialChatSessions}
            initialMessages={initialMessages}
          />
        </motion.div>

        {/* Studio Panel (Right) - Collapsible */}
        {studioCollapsed ? (
          <CollapsedGripStrip side="right" onExpand={handleStudioExpand} />
        ) : (
          <>
            <ResizableDivider
              direction="vertical"
              onDrag={handleStudioDrag}
              onDoubleClick={handleStudioDoubleClick}
            />
            <motion.div
              className="h-full overflow-hidden"
              style={{ width: studioWidth }}
              initial={false}
              animate={{ width: studioWidth }}
              transition={{ type: "spring", stiffness: 400, damping: 35 }}
            >
              <StudioPanel
                notebookId={notebook.id}
                notes={notes}
                selectedNote={selectedNote}
                onSelectNote={setSelectedNote}
              />
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
