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

interface HistoricalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

const LANGGRAPH_API_URL = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";

export function ChatPanel({ notebookId, datasetId }: ChatPanelProps) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isNewSession, setIsNewSession] = useState(false);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [historicalMessages, setHistoricalMessages] = useState<HistoricalMessage[]>([]);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
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
      // If thread connection fails, clear threadId to create new one on next submit
      const errorMsg = error instanceof Error ? error.message : String(error);
      if (errorMsg.includes("thread") || errorMsg.includes("not found")) {
        console.log("Thread not found, will create new thread on next message");
        setThreadId(null);
      }
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

  // Save messages to database
  const saveMessages = useCallback(
    async (
      sessionId: string,
      messagesToSave: { sender: "USER" | "ASSISTANT"; content: string }[]
    ) => {
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Convert new stream messages (only those not in historical)
  const newStreamMessages = useMemo(() => {
    const historySet = new Set(historicalMessages.map((m) => `${m.role}:${m.content.trim()}`));
    return stream.messages
      .filter((msg) => msg.type === "human" || msg.type === "ai")
      .map((msg) => ({
        id: msg.id ?? `stream-${Math.random()}`,
        type: msg.type === "human" ? "user" : "assistant",
        content: normalizeContent(msg.content),
      }))
      .filter((msg) => msg.content.trim().length > 0)
      .filter((msg) => !historySet.has(`${msg.type}:${msg.content.trim()}`));
  }, [stream.messages, historicalMessages, normalizeContent]);

  // Combine historical + new stream messages
  const visibleMessages = useMemo(() => {
    const historical = historicalMessages.map((msg) => ({
      id: msg.id,
      type: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));
    return [...historical, ...newStreamMessages];
  }, [historicalMessages, newStreamMessages]);

  useEffect(() => {
    scrollToBottom();
  }, [visibleMessages]);

  // Save assistant response when streaming completes
  useEffect(() => {
    if (stream.isLoading || !activeSessionId) return;

    const assistantMsgs = newStreamMessages.filter((m) => m.type === "assistant");
    const latest = assistantMsgs[assistantMsgs.length - 1];
    if (latest?.content?.trim()) {
      saveMessages(activeSessionId, [{ sender: "ASSISTANT", content: latest.content.trim() }])
        .then(() => fetchSessions());
    }
  }, [stream.isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

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
      setThreadId(null); // Let LangGraph create new thread
      setIsNewSession(false);
      return created;
    },
    [notebookId]
  );

  const handleNewChat = () => {
    setActiveSessionId(null);
    setThreadId(null);
    setIsNewSession(true);
    setShowHistory(false);
    setHistoricalMessages([]);
  };

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

    try {
      let sessionId = activeSessionId;

      // Create new session if needed
      if (!sessionId) {
        const session = await createSession(message);
        sessionId = session.id;
      }

      if (!sessionId) throw new Error("Unable to determine session");

      // Save user message to database immediately
      await saveMessages(sessionId, [{ sender: "USER", content: message }]);

      // Add to historical messages for immediate display
      setHistoricalMessages((prev) => [
        ...prev,
        { id: `pending-${Date.now()}`, role: "user", content: message, createdAt: new Date().toISOString() },
      ]);

      // Submit to LangGraph - if threadId is invalid, it will create new one via onThreadId
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
            return (
              <div key={messageKey} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-lg px-3 py-2 ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {isUser ? (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <>
                      <Markdown className="text-sm">{message.content}</Markdown>
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
              <p className="text-sm">
                Error: {stream.error instanceof Error ? stream.error.message : String(stream.error as unknown)}
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
