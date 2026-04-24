"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { SourcesPanel } from "@/components/deepdive/sources/sources-panel";
import { ChatPanel } from "@/components/deepdive/chat/chat-panel";
import { WikiPanel } from "@/components/deepdive/wiki/wiki-panel";
import { StudioPanel } from "@/components/deepdive/studio/studio-panel";
import { CitationProvider, useCitation } from "@/lib/context/citation-context";
import { ResizableDivider } from "@/components/ui/resizable-divider";
import { CollapsedGripStrip } from "@/components/ui/collapsed-grip-strip";
import { BookOpen, NotebookPen } from "lucide-react";

import type { Source, Note, Notebook } from "@prisma/client";
import type { GraphData } from "@/lib/services/graph-service";

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
  graphData?: GraphData | null;
}

// Hoist stable default values to module level (Vercel best practice: rerender-memo-with-default-value)
const EMPTY_SESSIONS: TransformedChatSession[] = [];
const EMPTY_MESSAGES: TransformedMessage[] = [];
const EMPTY_WIKI_PAGES: WikiPageSummary[] = [];

// Panel width constants
const SOURCES_DEFAULT_WIDTH = 280;
const SOURCES_CONTENT_WIDTH = 480;
const RIGHT_DEFAULT_WIDTH = 360;
const RIGHT_CONTENT_WIDTH = 480;
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
  graphData,
}: NotebookLayoutProps) {
  const [sourcesWidth, setSourcesWidth] = useState(SOURCES_DEFAULT_WIDTH);
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT_WIDTH);
  const [rightTab, setRightTab] = useState<"wiki" | "notes">("wiki");
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [wikiNavigateSlug, setWikiNavigateSlug] = useState<string | null>(null);

  // Citation navigation setup
  const { setOnNavigate, setOnNavigateSource } = useCitation();

  // Clamp width to valid range or collapse
  const clampWidth = useCallback((width: number): number => {
    if (width < COLLAPSE_THRESHOLD) return 0;
    return Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, width));
  }, []);

  // Drag handlers for sources panel
  const handleSourcesDrag = useCallback(
    (delta: number) => {
      setSourcesWidth((prev) => clampWidth(prev + delta));
    },
    [clampWidth],
  );

  const handleSourcesDoubleClick = useCallback(() => {
    setSourcesWidth(SOURCES_DEFAULT_WIDTH);
  }, []);

  const handleRightDrag = useCallback(
    (delta: number) => {
      setRightWidth((prev) => clampWidth(prev - delta));
    },
    [clampWidth],
  );

  const handleRightDoubleClick = useCallback(() => {
    setRightWidth(RIGHT_DEFAULT_WIDTH);
  }, []);

  // Expand handlers for collapsed panels
  const handleSourcesExpand = useCallback((width: number) => {
    setSourcesWidth(Math.max(SOURCES_DEFAULT_WIDTH, width));
  }, []);

  const handleRightExpand = useCallback((width: number) => {
    setRightWidth(Math.max(RIGHT_DEFAULT_WIDTH, width));
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
      setRightWidth(RIGHT_CONTENT_WIDTH);
    } else {
      setRightWidth(RIGHT_DEFAULT_WIDTH);
    }
  }, []);

  // Widen / restore the right panel when a wiki page is opened or closed,
  // mirroring handleSelectNote's width-snapping.
  const handleWikiPageSelectionChange = useCallback((hasSelection: boolean) => {
    if (hasSelection) {
      setRightWidth(RIGHT_CONTENT_WIDTH);
    } else {
      setRightWidth(RIGHT_DEFAULT_WIDTH);
    }
  }, []);

  // Handle citation click — placeholder for future wiki-based navigation
  const handleCitationNavigate = useCallback(async () => {
    // TODO: Implement wiki-based citation navigation
    // For now, just expand the sources panel
    if (sourcesWidth === 0) {
      setSourcesWidth(SOURCES_CONTENT_WIDTH);
    }
  }, [sourcesWidth]);

  // Navigate to wiki page from chat [[wiki-link]] click
  const handleWikiNavigate = useCallback(
    (slug: string) => {
      setRightTab("wiki");
      if (rightWidth === 0) setRightWidth(RIGHT_DEFAULT_WIDTH);
      setWikiNavigateSlug(slug);
    },
    [rightWidth],
  );

  // Navigate to source — uses same width-snapping as user click
  const handleSourceNavigate = useCallback(
    (sourceId: string) => {
      const source = sources.find((s) => s.id === sourceId);
      if (source) {
        handleSelectSource(source);
      }
    },
    [sources, handleSelectSource],
  );

  // Register navigation handlers with citation context
  useEffect(() => {
    setOnNavigate(handleCitationNavigate);
    setOnNavigateSource(handleSourceNavigate);
    return () => {
      setOnNavigate(null);
      setOnNavigateSource(null);
    };
  }, [setOnNavigate, setOnNavigateSource, handleCitationNavigate, handleSourceNavigate]);

  // Determine if panels are collapsed
  const sourcesCollapsed = sourcesWidth === 0;
  const rightCollapsed = rightWidth === 0;

  return (
    <div className="flex flex-1 overflow-hidden bg-sf-bg">
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
          userId={notebook.userId}
          sources={sources}
          initialSessions={initialChatSessions}
          initialMessages={initialMessages}
          onWikiNavigate={handleWikiNavigate}
          onNoteAdded={() => {
            setRightTab("notes");
            if (rightWidth === 0) setRightWidth(RIGHT_DEFAULT_WIDTH);
          }}
        />
      </motion.div>

      {/* Right Panel (Wiki + Notes tabs) - Collapsible */}
      {rightCollapsed ? (
        <CollapsedGripStrip side="right" onExpand={handleRightExpand} />
      ) : (
        <>
          <ResizableDivider
            direction="vertical"
            onDrag={handleRightDrag}
            onDoubleClick={handleRightDoubleClick}
          />
          <motion.div
            className="flex h-full flex-col overflow-hidden"
            style={{ width: rightWidth }}
            initial={false}
            animate={{ width: rightWidth }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
          >
            {/* Tab Bar — underline-active (matches Stitch mockup) */}
            <div className="shrink-0 bg-sf-surface border-b border-sf-line flex h-12 px-2 pt-2">
              <button
                data-guide="wiki-panel"
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 border-b-2 text-sm font-semibold transition-colors ${
                  rightTab === "wiki"
                    ? "border-sf-accent text-sf-accent"
                    : "border-transparent text-sf-ink-3 hover:bg-sf-bg-alt"
                }`}
                onClick={() => setRightTab("wiki")}
              >
                <BookOpen className="h-4 w-4" strokeWidth={1.75} />
                Wiki
              </button>
              <button
                data-guide="notes-panel"
                type="button"
                className={`flex-1 flex items-center justify-center gap-2 border-b-2 text-sm font-semibold transition-colors ${
                  rightTab === "notes"
                    ? "border-sf-accent text-sf-accent"
                    : "border-transparent text-sf-ink-3 hover:bg-sf-bg-alt"
                }`}
                onClick={() => setRightTab("notes")}
              >
                <NotebookPen className="h-4 w-4" strokeWidth={1.75} />
                Notes
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden">
              {rightTab === "wiki" ? (
                <WikiPanel
                  notebookId={notebook.id}
                  initialPages={wikiPages}
                  sources={sources.map((s) => ({ id: s.id, title: s.title }))}
                  graphData={graphData}
                  onSourceClick={handleSourceNavigate}
                  navigateToSlug={wikiNavigateSlug}
                  onNavigateComplete={() => setWikiNavigateSlug(null)}
                  onPageSelectionChange={handleWikiPageSelectionChange}
                />
              ) : (
                <StudioPanel
                  notebookId={notebook.id}
                  notes={notes}
                  selectedNote={selectedNote}
                  onSelectNote={handleSelectNote}
                  onWikiNavigate={handleWikiNavigate}
                />
              )}
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
