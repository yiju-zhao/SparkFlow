"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { Send, Loader2, Sparkles, Plus, History, X, Trash2, StickyNote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/ui/markdown";
import { createNote } from "@/lib/actions/notes";
import type { AgentState } from "./types";

interface ChatPanelProps {
  notebookId: string;
  datasetId?: string | null;
}

interface ChatSession {
  id: string;
  title: string;
  lastActivity: string;
  langgraphThreadId?: string | null;
  _count: { messages: number };
}

const LANGGRAPH_API_URL = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";

// Interface for historical messages from database
interface HistoricalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export function ChatPanel({ notebookId, datasetId }: ChatPanelProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isNewSession, setIsNewSession] = useState(false);
  const [pendingAssistantSave, setPendingAssistantSave] = useState<string | null>(null);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [historicalMessages, setHistoricalMessages] = useState<HistoricalMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Save AI response to Notes panel
  const handleSaveToNotes = useCallback(
    async (messageId: string, content: string) => {
      if (savingNoteId) return;
      setSavingNoteId(messageId);
      try {
        // Create a title from the first line or first 50 chars
        const firstLine = content.split("\n")[0].replace(/^#+\s*/, "").trim();
        const title = firstLine.length > 50 ? firstLine.slice(0, 50) + "..." : firstLine || "Chat Note";

        await createNote(notebookId, {
          title,
          content,
          tags: ["from-chat"],
        });
      } catch (error) {
        console.error("Failed to save note:", error);
      } finally {
        setSavingNoteId(null);
      }
    },
    [notebookId, savingNoteId]
  );

  // Save thread ID to database when LangGraph creates it
  const handleThreadId = useCallback(
    async (newThreadId: string) => {
      setThreadId(newThreadId);
      // If we have an active session, save the thread ID to it
      if (activeSessionId) {
        try {
          await fetch(`/api/chat/${activeSessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ langgraphThreadId: newThreadId }),
          });
        } catch (error) {
          console.error("Failed to save thread ID:", error);
        }
      }
    },
    [activeSessionId]
  );

  // LangGraph stream hook - let it auto-create threads
  const stream = useStream<AgentState>({
    apiUrl: LANGGRAPH_API_URL,
    assistantId: "agent",
    threadId: threadId ?? undefined,
    onThreadId: handleThreadId,
    onError: (error) => {
      console.error("Stream error:", error);
    },
  });

  const normalizeContent = useCallback((content: unknown) => {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map((item) => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item && "text" in item && typeof item.text === "string") {
            return item.text;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    return "";
  }, []);

  const saveMessages = useCallback(
    async (
      sessionId: string,
      messagesToSave: { sender: "USER" | "ASSISTANT"; content: string; metadata?: Record<string, unknown> }[]
    ) => {
      if (!messagesToSave.length) return;
      try {
        const res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            notebookId,
            messages: messagesToSave,
          }),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(errorText || "Failed to save chat history");
        }
      } catch (error) {
        console.error("Unable to save chat history:", error);
      }
    },
    [notebookId]
  );

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Convert stream messages format for consistent display
  const streamMessages = useMemo(
    () =>
      stream.messages
        .filter((message) => message.type === "human" || message.type === "ai")
        .map((message) => ({
          id: message.id ?? `stream-${Date.now()}-${Math.random()}`,
          type: message.type === "human" ? "user" : "assistant",
          content: normalizeContent(message.content),
        }))
        .filter((message) => typeof message.content === "string" && message.content.trim().length > 0),
    [normalizeContent, stream.messages]
  );

  // Combine historical messages with stream messages, deduplicating
  const visibleMessages = useMemo(() => {
    // Convert historical messages to unified format
    const historical = historicalMessages.map((msg) => ({
      id: msg.id,
      type: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    // Create a Set of historical content for deduplication
    const historicalContentSet = new Set(
      historicalMessages.map((msg) => `${msg.role}:${msg.content.trim()}`)
    );

    // Filter stream messages to only include new ones not in historical
    const newStreamMessages = streamMessages.filter(
      (msg) => !historicalContentSet.has(`${msg.type}:${msg.content.trim()}`)
    );

    // Combine: historical first, then only NEW stream messages
    return [...historical, ...newStreamMessages];
  }, [historicalMessages, streamMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [visibleMessages]);

  useEffect(() => {
    if (stream.error && pendingAssistantSave) {
      setPendingAssistantSave(null);
    }
  }, [stream.error, pendingAssistantSave]);

  // Fetch historical messages for a session
  const fetchSessionMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/chat/${sessionId}`);
      if (res.ok) {
        const messages: HistoricalMessage[] = await res.json();
        setHistoricalMessages(messages);
      } else {
        setHistoricalMessages([]);
      }
    } catch (error) {
      console.error("Failed to fetch session messages:", error);
      setHistoricalMessages([]);
    }
  }, []);

  const loadSession = useCallback(async (session: ChatSession) => {
    setActiveSessionId(session.id);
    setThreadId(session.langgraphThreadId || null);
    setIsNewSession(false);
    setPendingAssistantSave(null);
    setShowHistory(false);
    // Fetch historical messages for this session
    await fetchSessionMessages(session.id);
  }, [fetchSessionMessages]);

  // Fetch sessions list from our backend (for history)
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/sessions?notebookId=${notebookId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        // Auto-select most recent if no current session
        if (!activeSessionId && data.length > 0 && !isNewSession) {
          loadSession(data[0]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    }
  }, [notebookId, activeSessionId, isNewSession, loadSession]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!pendingAssistantSave || stream.isLoading) return;
    if (pendingAssistantSave !== activeSessionId) return;

    // Use streamMessages (not visibleMessages which includes historical) to find new assistant response
    const assistantMessages = streamMessages.filter((message) => message.type === "assistant");
    const latestAssistant = assistantMessages[assistantMessages.length - 1];
    const assistantContent =
      latestAssistant && typeof latestAssistant.content === "string"
        ? latestAssistant.content.trim()
        : "";

    if (!assistantContent) {
      setPendingAssistantSave(null);
      return;
    }

    saveMessages(pendingAssistantSave, [
      { sender: "ASSISTANT", content: assistantContent },
    ]).then(() => {
      fetchSessions();
      setPendingAssistantSave(null);
    });
  }, [pendingAssistantSave, stream.isLoading, streamMessages, saveMessages, fetchSessions, activeSessionId]);

  const createSession = useCallback(
    async (title?: string) => {
      const res = await fetch(`/api/notebooks/${notebookId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });

      if (!res.ok) {
        throw new Error("Failed to create chat session");
      }

      const created = await res.json();
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
      // Don't set threadId here - let LangGraph create it via onThreadId
      setThreadId(null);
      setIsNewSession(false);
      return created;
    },
    [notebookId]
  );

  // Start a new chat
  const handleNewChat = () => {
    setActiveSessionId(null);
    setThreadId(null);
    setIsNewSession(true);
    setPendingAssistantSave(null);
    setShowHistory(false);
    setHistoricalMessages([]); // Clear historical messages for new chat
  };

  // Delete a session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this chat history?")) return;

    try {
      const res = await fetch(`/api/chat/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) {
          handleNewChat();
        }
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || stream.isLoading) return;

    const message = input.trim();
    setInput("");

    try {
      let sessionId = activeSessionId;

      // Create a new session if needed
      if (!sessionId) {
        const session = await createSession(message);
        sessionId = session.id;
      }

      if (!sessionId) {
        throw new Error("Unable to determine session");
      }

      // Save the user message immediately
      await saveMessages(sessionId, [{ sender: "USER", content: message }]);

      setPendingAssistantSave(sessionId);

      // Submit to LangGraph stream - it will auto-create thread if needed
      await stream.submit(
        { messages: [{ type: "human", content: message }] },
        {
          config: {
            configurable: {
              dataset_ids: datasetId ? [datasetId] : [],
              notebook_id: notebookId,
            },
          },
        }
      );

      fetchSessions();
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  return (
    <div className="flex h-full min-w-0 flex-col relative overflow-hidden">
      {/* Header with actions */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium">Chat</h2>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7"
            onClick={handleNewChat}
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7"
            onClick={() => setShowHistory(!showHistory)}
            title="Chat History"
          >
            {showHistory ? <X className="h-4 w-4" /> : <History className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="absolute top-10 right-2 z-10 w-64 max-h-80 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          <div className="p-2">
            <h3 className="text-xs font-medium text-muted-foreground mb-2">Recent Chats</h3>
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No chat history</p>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted ${activeSessionId === session.id ? "bg-muted" : ""
                      }`}
                    onClick={() => loadSession(session)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{session.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.lastActivity)} · {session._count.messages} msgs
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
        {visibleMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Sparkles className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Start a conversation</p>
            </div>
          </div>
        ) : (
          visibleMessages.map((message, idx) => {
            const messageKey = message.id ?? `msg-${idx}`;
            const isUser = message.type === "user";
            return (
              <div
                key={messageKey}
                className={`flex ${isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 ${isUser
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                    }`}
                >
                  {isUser ? (
                    <p className="text-sm whitespace-pre-wrap">{message.content as string}</p>
                  ) : (
                    <>
                      <Markdown className="text-sm">{message.content as string}</Markdown>
                      {/* Save to Notes button */}
                      <div className="mt-2 flex justify-end border-t border-border/50 pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => handleSaveToNotes(messageKey, message.content as string)}
                          disabled={savingNoteId === messageKey}
                          title="Save to Notes"
                        >
                          {savingNoteId === messageKey ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <StickyNote className="h-3 w-3" />
                          )}
                          <span>Save to Notes</span>
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        {stream.isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        {stream.error ? (
          <div className="flex justify-start">
            <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2">
              <p className="text-sm">Error: {stream.error instanceof Error ? stream.error.message : String(stream.error)}</p>
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            className="min-h-[40px] max-h-[120px] resize-none"
            disabled={stream.isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || stream.isLoading}
          >
            {stream.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
