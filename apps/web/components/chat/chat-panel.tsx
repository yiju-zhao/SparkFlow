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
  initialSessions?: ChatSession[];
}

interface ChatSession {
  id: string;
  title: string;
  lastActivity: string;
  langgraphThreadId?: string | null;
  _count: { messages: number };
}

interface HistoricalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

const LANGGRAPH_API_URL = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";

export function ChatPanel({ notebookId, datasetId, initialSessions = [] }: ChatPanelProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialSessions.length > 0 ? initialSessions[0].id : null
  );
  const [threadId, setThreadId] = useState<string | null>(
    initialSessions.length > 0 ? (initialSessions[0].langgraphThreadId || null) : null
  );
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [initialLoadComplete, setInitialLoadComplete] = useState(initialSessions.length > 0);
  const [showHistory, setShowHistory] = useState(false);
  const [isNewSession, setIsNewSession] = useState(false);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  // Source of truth: messages from database
  const [historicalMessages, setHistoricalMessages] = useState<HistoricalMessage[]>([]);

  // Track the current streaming response separately to handle the transition properly
  const [currentStreamingContent, setCurrentStreamingContent] = useState<string>("");

  // Track if we've saved the current streaming response to avoid duplicates
  const lastSavedResponseRef = useRef<string>("");
  // Track previous loading state to detect when streaming completes
  const wasLoadingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Save AI response to Notes panel
  const handleSaveToNotes = useCallback(
    async (messageId: string, content: string) => {
      if (savingNoteId) return;
      setSavingNoteId(messageId);
      try {
        const firstLine = content.split("\n")[0].replace(/^#+\s*/, "").trim();
        const title = firstLine.length > 50 ? firstLine.slice(0, 50) + "..." : firstLine || "Chat Note";
        await createNote(notebookId, { title, content, tags: ["from-chat"] });
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

  // LangGraph stream hook
  const stream = useStream<AgentState>({
    apiUrl: LANGGRAPH_API_URL,
    assistantId: "agent",
    threadId: threadId ?? undefined,
    onThreadId: handleThreadId,
    onError: (error: unknown) => {
      console.error("Stream error:", error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("thread") || errorMsg.includes("not found")) {
        console.log("Thread not found, will create new thread on next message");
        setThreadId(null);
      }
    },
  });

  // Normalize content from LangGraph messages
  const normalizeContent = useCallback((content: unknown): string => {
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

  // Save messages to database
  const saveMessages = useCallback(
    async (sessionId: string, messagesToSave: { sender: "USER" | "ASSISTANT"; content: string }[]) => {
      if (!messagesToSave.length) return;
      try {
        await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, notebookId, messages: messagesToSave }),
        });
      } catch (error) {
        console.error("Unable to save chat history:", error);
      }
    },
    [notebookId]
  );

  // Update streaming content as tokens arrive
  useEffect(() => {
    if (stream.isLoading) {
      const aiMessages = stream.messages.filter((msg) => msg.type === "ai");
      const lastAiMessage = aiMessages[aiMessages.length - 1];
      if (lastAiMessage) {
        const content = normalizeContent(lastAiMessage.content).trim();
        if (content) {
          setCurrentStreamingContent(content);
        }
      }
    }
  }, [stream.messages, stream.isLoading, normalizeContent]);

  // Handle streaming completion: save response and add to history
  useEffect(() => {
    const wasLoading = wasLoadingRef.current;
    wasLoadingRef.current = stream.isLoading;

    // Only run when streaming just finished (was loading, now not loading)
    if (!wasLoading || stream.isLoading || !activeSessionId) return;

    // Use the currentStreamingContent which was captured during streaming
    const responseToSave = currentStreamingContent.trim();
    if (!responseToSave || responseToSave === lastSavedResponseRef.current) {
      setCurrentStreamingContent("");
      return;
    }

    // Mark as saved to prevent duplicates
    lastSavedResponseRef.current = responseToSave;

    // Save to database and add to historical messages
    saveMessages(activeSessionId, [{ sender: "ASSISTANT", content: responseToSave }]);
    setHistoricalMessages((prev) => [
      ...prev,
      {
        id: `response-${Date.now()}`,
        role: "assistant",
        content: responseToSave,
        createdAt: new Date().toISOString(),
      },
    ]);

    // Clear streaming content
    setCurrentStreamingContent("");
    fetchSessions();
  }, [stream.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build visible messages: historical + streaming response (if any)
  const visibleMessages = useMemo(() => {
    const messages = historicalMessages.map((msg) => ({
      id: msg.id,
      type: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    // Show streaming content if we're loading and have content
    if (stream.isLoading && currentStreamingContent) {
      messages.push({
        id: "streaming-response",
        type: "assistant",
        content: currentStreamingContent,
      });
    }

    return messages;
  }, [historicalMessages, stream.isLoading, currentStreamingContent]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages]);

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
    } catch {
      setHistoricalMessages([]);
    }
    setCurrentStreamingContent("");
    lastSavedResponseRef.current = "";
  }, []);

  const loadSession = useCallback(
    async (session: ChatSession) => {
      setActiveSessionId(session.id);
      setThreadId(session.langgraphThreadId || null);
      setIsNewSession(false);
      setShowHistory(false);
      await fetchSessionMessages(session.id);
    },
    [fetchSessionMessages]
  );

  // Fetch sessions list
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/sessions?notebookId=${notebookId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        if (!activeSessionId && data.length > 0 && !isNewSession) {
          loadSession(data[0]);
        }
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    }
  }, [notebookId, activeSessionId, isNewSession, loadSession]);

  // Only fetch on mount if we don't have initial data
  useEffect(() => {
    if (!initialLoadComplete) {
      fetchSessions().finally(() => setInitialLoadComplete(true));
    } else if (initialSessions.length > 0 && historicalMessages.length === 0) {
      // Load messages for the first session if we have initial data but no messages yet
      fetchSessionMessages(initialSessions[0].id);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const createSession = useCallback(
    async (title?: string) => {
      const res = await fetch(`/api/notebooks/${notebookId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to create chat session");
      const created = await res.json();
      setSessions((prev) => [created, ...prev]);
      setActiveSessionId(created.id);
      setThreadId(null);
      setIsNewSession(false);
      return created;
    },
    [notebookId]
  );

  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setThreadId(null);
    setIsNewSession(true);
    setShowHistory(false);
    setHistoricalMessages([]);
    setCurrentStreamingContent("");
    lastSavedResponseRef.current = "";
  }, []);

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this chat history?")) return;
    try {
      const res = await fetch(`/api/chat/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) handleNewChat();
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
    setCurrentStreamingContent("");
    lastSavedResponseRef.current = "";

    try {
      let sessionId = activeSessionId;

      if (!sessionId) {
        const session = await createSession(message);
        sessionId = session.id;
      }

      if (!sessionId) throw new Error("Unable to determine session");

      // Save user message to database and add to historical messages immediately
      await saveMessages(sessionId, [{ sender: "USER", content: message }]);
      setHistoricalMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: "user",
          content: message,
          createdAt: new Date().toISOString(),
        },
      ]);

      // Submit to LangGraph
      stream.submit(
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
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium">Chat</h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7" onClick={handleNewChat} title="New Chat">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7" onClick={() => setShowHistory(!showHistory)} title="Chat History">
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
                    className={`group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted ${activeSessionId === session.id ? "bg-muted" : ""}`}
                    onClick={() => loadSession(session)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{session.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.lastActivity)} · {session._count.messages} msgs
                      </p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => handleDeleteSession(e, session.id)}>
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
            const isStreaming = message.id === "streaming-response";
            return (
              <div key={messageKey} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {isUser ? (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <>
                      <Markdown className="text-sm">{message.content}</Markdown>
                      {!isStreaming && (
                        <div className="mt-2 flex justify-end border-t border-border/50 pt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => handleSaveToNotes(messageKey, message.content)}
                            disabled={savingNoteId === messageKey}
                            title="Save to Notes"
                          >
                            {savingNoteId === messageKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <StickyNote className="h-3 w-3" />}
                            <span>Save to Notes</span>
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
        {stream.isLoading && !currentStreamingContent && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        {stream.error ? (
          <div className="flex justify-start">
            <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2">
              <p className="text-sm">
                Error: {stream.error instanceof Error ? stream.error.message : String(stream.error)}
              </p>
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
          <Button type="submit" size="icon" disabled={!input.trim() || stream.isLoading}>
            {stream.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
