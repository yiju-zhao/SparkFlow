"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
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
import { CitationProvider, useCitation, ChunkInfo } from "@/lib/context/citation-context";
import type { Source, Note, Notebook, ChatSession } from "@prisma/client";

type ChatSessionWithCount = ChatSession & {
  _count?: {
    messages: number;
  };
};

interface PreloadedMessage {
  id: string;
  sender: string;
  content: string;
}

interface NotebookLayoutProps {
  notebook: Notebook;
  sources: Source[];
  notes: Note[];
  initialChatSessions?: ChatSessionWithCount[];
  initialMessages?: PreloadedMessage[];
}

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
  initialChatSessions = [],
  initialMessages = [],
}: NotebookLayoutProps) {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [targetChunkId, setTargetChunkId] = useState<string | null>(null);

  // Citation navigation setup
  const { setOnNavigate } = useCitation();

  // Handle citation click navigation
  const handleCitationNavigate = useCallback(
    (chunkId: string, chunkInfo: ChunkInfo | undefined) => {
      // Guard against undefined chunkInfo
      if (!chunkInfo) {
        console.warn(`Citation clicked but chunk info not found: ${chunkId}`);
        return;
      }

      // Find source by document name
      const matchingSource = sources.find(
        (s) => s.title === chunkInfo.docName || s.ragflowDocumentId === chunkInfo.docId
      );

      if (matchingSource) {
        // Open left panel and select the source
        setLeftPanelOpen(true);
        setSelectedSource(matchingSource);
        setTargetChunkId(chunkId);
      }
    },
    [sources]
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
            className="h-8 w-8"
            onClick={() => setLeftPanelOpen(!leftPanelOpen)}
          >
            {leftPanelOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setRightPanelOpen(!rightPanelOpen)}
          >
            {rightPanelOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content - 3 Panel Grid */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sources Panel (Left) */}
        <AnimatePresence initial={false}>
          {leftPanelOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: sourcesPanelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="h-full shrink-0 overflow-hidden border-r border-border"
            >
              <SourcesPanel
                notebookId={notebook.id}
                datasetId={notebook.ragflowDatasetId}
                sources={sources}
                selectedSource={selectedSource}
                onSelectSource={setSelectedSource}
                targetChunkId={targetChunkId}
                onChunkNavigated={() => setTargetChunkId(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Panel (Center) */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <ChatPanel
            notebookId={notebook.id}
            datasetId={notebook.ragflowDatasetId}
            initialSessions={initialChatSessions.map((s) => ({
              id: s.id,
              title: s.title,
              lastActivity: s.lastActivity.toISOString(),
              langgraphThreadId: s.langgraphThreadId,
              _count: { messages: s._count?.messages ?? 0 },
            }))}
            initialMessages={initialMessages.map((m) => ({
              id: m.id,
              role: m.sender === "USER" ? "user" : "assistant",
              content: m.content,
            }))}
          />
        </div>

        {/* Studio Panel (Right) */}
        <AnimatePresence initial={false}>
          {rightPanelOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: studioPanelWidth, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="h-full shrink-0 overflow-hidden border-l border-border"
            >
              <StudioPanel
                notebookId={notebook.id}
                notes={notes}
                selectedNote={selectedNote}
                onSelectNote={setSelectedNote}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
