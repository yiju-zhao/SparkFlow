"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
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

interface WikiPageSummary {
  id: string;
  slug: string;
  title: string;
  pageType: string;
  sourceRefs: string[];
  updatedAt: string;
}

interface NotebookLayoutProps {
  notebook: Notebook;
  sources: Source[];
  notes: Note[];
  initialChatSessions?: TransformedChatSession[];
  initialMessages?: TransformedMessage[];
  wikiPages?: WikiPageSummary[];
}

// Hoist stable default values to module level (Vercel best practice: rerender-memo-with-default-value)
const EMPTY_SESSIONS: TransformedChatSession[] = [];
const EMPTY_MESSAGES: TransformedMessage[] = [];
const EMPTY_WIKI_PAGES: WikiPageSummary[] = [];

// Panel width constants
const SOURCES_DEFAULT_WIDTH = 280;
const SOURCES_CONTENT_WIDTH = 480;
const STUDIO_DEFAULT_WIDTH = 320;
const STUDIO_CONTENT_WIDTH = 480;
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
  wikiPages = EMPTY_WIKI_PAGES,
}: NotebookLayoutProps) {
  const [sourcesWidth, setSourcesWidth] = useState(SOURCES_DEFAULT_WIDTH);
  const [studioWidth, setStudioWidth] = useState(STUDIO_DEFAULT_WIDTH);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  // Citation navigation state (placeholder for future wiki-based navigation)

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

  // Wrap setSelectedSource with width-snapping logic
  const handleSelectSource = useCallback((source: Source | null) => {
    setSelectedSource(source);
    if (source) {
      setSourcesWidth(SOURCES_CONTENT_WIDTH);
    } else {
      setSourcesWidth(SOURCES_DEFAULT_WIDTH);
    }
  }, []);

  // Wrap setSelectedNote with width-snapping logic
  const handleSelectNote = useCallback((note: Note | null) => {
    setSelectedNote(note);
    if (note) {
      setStudioWidth(STUDIO_CONTENT_WIDTH);
    } else {
      setStudioWidth(STUDIO_DEFAULT_WIDTH);
    }
  }, []);

  // Handle citation click — placeholder for future wiki-based navigation
  const handleCitationNavigate = useCallback(async (_refId: string) => {
    // TODO: Implement wiki-based citation navigation
    // For now, just expand the sources panel
    if (sourcesWidth === 0) {
      setSourcesWidth(SOURCES_CONTENT_WIDTH);
    }
  }, [sourcesWidth]);

  // Register navigation handler with citation context
  useEffect(() => {
    setOnNavigate(handleCitationNavigate);
    return () => setOnNavigate(null);
  }, [setOnNavigate, handleCitationNavigate]);

  // Determine if panels are collapsed
  const sourcesCollapsed = sourcesWidth === 0;
  const studioCollapsed = studioWidth === 0;

  return (
    <div className="flex flex-1 overflow-hidden">
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
              sources={sources}
              selectedSource={selectedSource}
              onSelectSource={handleSelectSource}
              wikiPages={wikiPages}
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
              onSelectNote={handleSelectNote}
            />
          </motion.div>
        </>
      )}
    </div>
  );
}
