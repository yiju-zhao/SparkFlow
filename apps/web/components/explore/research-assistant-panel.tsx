"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useThreadRuntime,
} from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { X, Send, Sparkles } from "lucide-react";
import { useContextSuggestions } from "@/lib/hooks/use-context-suggestions";

interface ResearchAssistantPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ResearchAssistantTrigger({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#00D084] px-5 py-3 text-sm font-medium text-white shadow-lg hover:shadow-xl transition-shadow"
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <Sparkles className="h-4 w-4" />
      Research Assistant
    </motion.button>
  );
}

// ─── Message components ────────────────────────────────────────────────────

function HubUserMessage() {
  return (
    <div className="flex flex-col items-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md bg-foreground text-background px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
        <MessagePrimitive.Content />
      </div>
    </div>
  );
}

function HubAssistantMessage() {
  return (
    <div className="flex flex-col items-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
        <MessagePrimitive.Content />
      </div>
    </div>
  );
}

// ─── Composer ──────────────────────────────────────────────────────────────

function HubComposer() {
  return (
    <div className="shrink-0 border-t border-border p-4">
      <ComposerPrimitive.Root className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 focus-within:border-[#00D084]/50 transition-colors">
        <ComposerPrimitive.Input
          placeholder="Ask a question..."
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 max-h-32"
        />
        <ComposerPrimitive.Send className="h-7 w-7 shrink-0 rounded-lg bg-[#00D084] hover:bg-[#00B872] text-white inline-flex items-center justify-center disabled:opacity-50">
          <Send className="h-3.5 w-3.5" />
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </div>
  );
}

// ─── Empty state with suggestions ─────────────────────────────────────────

function EmptyState() {
  const suggestions = useContextSuggestions();
  const threadRuntime = useThreadRuntime();

  const handleSuggestion = (text: string) => {
    threadRuntime.append({
      role: "user",
      content: [{ type: "text", text }],
    });
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00D084]/10">
        <Sparkles className="h-6 w-6 text-[#00D084]" />
      </div>
      <div>
        <p className="text-sm font-medium">Ask anything about the research hub</p>
        <p className="text-xs text-muted-foreground mt-1">
          Explore trends, compare papers, find key insights
        </p>
      </div>
      <div className="flex flex-col gap-2 w-full max-w-70">
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => handleSuggestion(s)}
            className="text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────────

export function ResearchAssistantPanel({
  open,
  onOpenChange,
}: ResearchAssistantPanelProps) {
  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-200 bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed top-0 right-0 bottom-0 z-200 w-full max-w-md flex flex-col bg-background border-l border-border shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-5 h-14 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00D084]">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <span className="text-sm font-medium">Research Assistant</span>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Thread */}
            <ThreadPrimitive.Root className="flex flex-col flex-1 min-h-0">
              <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <ThreadPrimitive.Empty>
                  <EmptyState />
                </ThreadPrimitive.Empty>
                <ThreadPrimitive.Messages
                  components={{
                    UserMessage: HubUserMessage,
                    AssistantMessage: HubAssistantMessage,
                  }}
                />
              </ThreadPrimitive.Viewport>
              <HubComposer />
            </ThreadPrimitive.Root>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
