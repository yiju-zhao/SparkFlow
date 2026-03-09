"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCopilotChat, useCopilotReadable, useThreads } from "@copilotkit/react-core";
import { TextMessage, MessageRole } from "@copilotkit/runtime-client-gql";
import { Button } from "@/components/ui/button";
import { X, Send, Sparkles } from "lucide-react";
import { useGenerativeComponents } from "./generative-ui";
import { useContextSuggestions } from "@/hooks/use-context-suggestions";

interface ResearchAssistantPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextData?: {
    conferenceId?: string;
    conferenceName?: string;
    sessionId?: string;
    sessionTitle?: string;
  };
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

export function ResearchAssistantPanel({
  open,
  onOpenChange,
  contextData,
}: ResearchAssistantPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Register generative UI components with CopilotKit
  useGenerativeComponents();

  // Build context string for the agent
  const contextString = useMemo(() => {
    if (contextData?.conferenceName) {
      return `User is viewing conference: ${contextData.conferenceName}`;
    }
    if (contextData?.sessionTitle) {
      return `User is viewing session: ${contextData.sessionTitle}`;
    }
    return "User is on the Research Hub homepage";
  }, [contextData]);

  // Make context readable by the agent
  useCopilotReadable(
    {
      description: "Current page context",
      value: contextString,
    },
    [contextString]
  );

  // Get context-aware suggestions
  const suggestions = useContextSuggestions();

  // Use CopilotKit for chat state
  const { visibleMessages, appendMessage, reset, isLoading } =
    useCopilotChat();

  // Get thread management to reset thread ID on close
  const { setThreadId } = useThreads();

  // Reset on close - both messages AND thread ID to avoid "Message not found" error
  useEffect(() => {
    if (!open) {
      reset();
      // Generate a new thread ID for the next session to avoid message ID mismatch
      setThreadId(crypto.randomUUID());
      setInput("");
    }
  }, [open, reset, setThreadId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages, isLoading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSend = async (text?: string) => {
    const content = text || input.trim();
    if (!content || isLoading) return;

    await appendMessage(
      new TextMessage({
        role: MessageRole.User,
        content,
      })
    );
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Helper to get message content safely
  const getMessageContent = (msg: (typeof visibleMessages)[0]): string => {
    if ("content" in msg && typeof msg.content === "string") return msg.content;
    return "";
  };

  // Helper to get message role safely
  const getMessageRole = (msg: (typeof visibleMessages)[0]) => {
    if ("role" in msg) return msg.role;
    return "assistant";
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[200] bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />

          {/* Panel */}
          <motion.div
            className="fixed top-0 right-0 bottom-0 z-[200] w-full max-w-md flex flex-col bg-background border-l border-border shadow-2xl"
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
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {(visibleMessages?.length ?? 0) === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00D084]/10">
                    <Sparkles className="h-6 w-6 text-[#00D084]" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Ask anything about the research hub
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Explore trends, compare papers, find key insights
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 w-full max-w-[280px]">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleSend(s)}
                        className="text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {visibleMessages?.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${getMessageRole(msg) === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      getMessageRole(msg) === "user"
                        ? "bg-foreground text-background rounded-br-md"
                        : "bg-muted rounded-bl-md"
                    }`}
                  >
                    {getMessageContent(msg)}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="shrink-0 border-t border-border p-4">
              <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 focus-within:border-[#00D084]/50 transition-colors">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask a question..."
                  rows={1}
                  className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 max-h-32"
                />
                <Button
                  size="icon"
                  className="h-7 w-7 shrink-0 rounded-lg bg-[#00D084] hover:bg-[#00B872] text-white"
                  onClick={() => handleSend()}
                  disabled={!input.trim() || isLoading}
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
