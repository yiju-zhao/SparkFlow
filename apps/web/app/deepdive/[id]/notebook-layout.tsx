"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { SourcesPanel } from "@/components/sources/sources-panel";
import { ChatPanel } from "@/components/chat/chat-panel";
import { StudioPanel } from "@/components/studio/studio-panel";
import { CitationProvider, useCitation } from "@/lib/context/citation-context";
import { CollapsiblePanel } from "@/components/ui/collapsible-panel";

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
}

// Hoist stable default values to module level (Vercel best practice: rerender-memo-with-default-value)
const EMPTY_SESSIONS: TransformedChatSession[] = [];
const EMPTY_MESSAGES: TransformedMessage[] = [];

// Panel widths
const SOURCES_LIST_WIDTH = 280;
const SOURCES_EXPANDED_WIDTH = 480;
const STUDIO_LIST_WIDTH = 320;
const STUDIO_EXPANDED_WIDTH = 480;

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
}: NotebookLayoutProps) {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [targetChunkId, setTargetChunkId] = useState<string | null>(null);
  const [targetContentPreview, setTargetContentPreview] = useState<string | null>(null);
  const [targetContentSuffix, setTargetContentSuffix] = useState<string | null>(null);
  const [navigationTrigger, setNavigationTrigger] = useState(0);

  // Citation navigation setup
  const { setOnNavigate } = useCitation();

  // Handle citation click - look up chunk via API to find source
  const handleCitationNavigate = useCallback(
    async (chunkId: string) => {
      try {
        const res = await fetch(`/api/chunks/${chunkId}`);
        if (!res.ok) {
          console.warn(`Chunk ${chunkId} not found`);
          return;
        }
        const data = await res.json();
        const { contentPreview, contentSuffix, source } = data;

        if (source) {
          setLeftPanelOpen(true);
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
    },
    []
  );

  // Register navigation handler with citation context
  useEffect(() => {
    setOnNavigate(handleCitationNavigate);
    return () => setOnNavigate(null);
  }, [setOnNavigate, handleCitationNavigate]);

  // Determine the width of the sources panel based on whether a source is selected
  const sourcesPanelWidth = selectedSource
    ? SOURCES_EXPANDED_WIDTH
    : SOURCES_LIST_WIDTH;

  // Determine the width of the studio panel based on whether a note is selected
  const studioPanelWidth = selectedNote
    ? STUDIO_EXPANDED_WIDTH
    : STUDIO_LIST_WIDTH;

  // Memoized callback for chunk navigation cleanup
  const handleChunkNavigated = useCallback(() => {
    setTargetChunkId(null);
    setTargetContentPreview(null);
    setTargetContentSuffix(null);
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <Link href="/deepdive">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-sm font-medium">{notebook.name}</h1>
            {notebook.description && (
              <p className="text-xs text-muted-foreground">
                {notebook.description}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 transition-colors"
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
            aria-label={leftPanelOpen ? "Collapse sources panel" : "Expand sources panel"}
          >
            <motion.div
              initial={false}
              animate={{ scale: 1 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              {leftPanelOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </motion.div>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 transition-colors"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
            aria-label={rightPanelOpen ? "Collapse studio panel" : "Expand studio panel"}
          >
            <motion.div
              initial={false}
              animate={{ scale: 1 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              {rightPanelOpen ? (
                <PanelRightClose className="h-4 w-4" />
              ) : (
                <PanelRightOpen className="h-4 w-4" />
              )}
            </motion.div>
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content - 3 Panel Grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sources Panel (Left) */}
        <CollapsiblePanel
          isOpen={leftPanelOpen}
          width={sourcesPanelWidth}
          side="left"
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
        </CollapsiblePanel>

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

        {/* Studio Panel (Right) */}
        <CollapsiblePanel
          isOpen={rightPanelOpen}
          width={studioPanelWidth}
          side="right"
        >
          <StudioPanel
            notebookId={notebook.id}
            notes={notes}
            selectedNote={selectedNote}
            onSelectNote={setSelectedNote}
          />
        </CollapsiblePanel>
      </div>
    </div>
  );
}
