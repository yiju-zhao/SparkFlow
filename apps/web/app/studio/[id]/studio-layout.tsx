"use client";

import { useState } from "react";
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
import { NotesPanel } from "@/components/notes/notes-panel";
import type { Source, Note, ChatSession, Notebook } from "@prisma/client";

interface StudioLayoutProps {
  notebook: Notebook;
  sources: Source[];
  notes: Note[];
  activeSession: ChatSession | null;
}

// Panel widths
const SOURCES_LIST_WIDTH = 280;
const SOURCES_EXPANDED_WIDTH = 480;

export function StudioLayout({
  notebook,
  sources,
  notes,
  activeSession,
}: StudioLayoutProps) {
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedSource, setSelectedSource] = useState<Source | null>(null);

  // Determine the width of the sources panel based on whether a source is selected
  const sourcesPanelWidth = selectedSource
    ? SOURCES_EXPANDED_WIDTH
    : SOURCES_LIST_WIDTH;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
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
              className="shrink-0 overflow-hidden border-r border-border"
            >
              <SourcesPanel
                notebookId={notebook.id}
                sources={sources}
                selectedSource={selectedSource}
                onSelectSource={setSelectedSource}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat Panel (Center) */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <ChatPanel
            notebookId={notebook.id}
            sessionId={activeSession?.id || null}
          />
        </div>

        {/* Notes Panel (Right) */}
        <AnimatePresence initial={false}>
          {rightPanelOpen && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="shrink-0 overflow-hidden border-l border-border"
            >
              <NotesPanel notebookId={notebook.id} notes={notes} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
