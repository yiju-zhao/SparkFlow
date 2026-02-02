"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { CitationProvider, useCitation } from "@/lib/context/citation-context";

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
  const [sourcesPanelVisible, setSourcesPanelVisible] = useState(true);

  // Determine the width of the studio panel based on whether a note is selected
  const studioPanelWidth = selectedNote
    ? STUDIO_EXPANDED_WIDTH
    : STUDIO_LIST_WIDTH;
  const [studioPanelVisible, setStudioPanelVisible] = useState(true);

  // Sync panel visibility with open state
  useEffect(() => {
    setSourcesPanelVisible(leftPanelOpen);
  }, [leftPanelOpen]);

  useEffect(() => {
    setStudioPanelVisible(rightPanelOpen);
  }, [rightPanelOpen]);

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
        <div
          className="h-full shrink-0 border-r border-border"
          style={{
            width: sourcesPanelVisible ? `${sourcesPanelWidth}px` : '0px',
            minWidth: '0',
            willChange: 'width',
            transition: 'width 100ms ease-in-out'
          }}
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
            onChunkNavigated={() => {
              setTargetChunkId(null);
              setTargetContentPreview(null);
              setTargetContentSuffix(null);
            }}
          />
        </div>

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
        <div
          className="h-full shrink-0 border-l border-border"
          style={{
            width: studioPanelVisible ? `${studioPanelWidth}px` : '0px',
            minWidth: '0',
            willChange: 'width',
            transition: 'width 100ms ease-in-out'
          }}
        >
          <StudioPanel
            notebookId={notebook.id}
            notes={notes}
            selectedNote={selectedNote}
            onSelectNote={setSelectedNote}
          />
        </div>
      </div>
    </div>
  );
}
