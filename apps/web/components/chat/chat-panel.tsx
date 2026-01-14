"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import { Send, Loader2, Sparkles, Plus, History, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/ui/markdown";
import type { AgentState } from "./types";

interface ChatPanelProps {
  notebookId: string;
  datasetId?: string | null;
}

interface ChatSession {
  id: string;
  title: string;
  lastActivity: string;
  _count: { messages: number };
}

const LANGGRAPH_API_URL = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";

export function ChatPanel({ notebookId, datasetId }: ChatPanelProps) {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isNewSession, setIsNewSession] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // LangGraph stream hook
  const stream = useStream<AgentState>({
    apiUrl: LANGGRAPH_API_URL,
    assistantId: "agent",
    threadId: threadId ?? undefined,
    onThreadId: (id) => {
      setThreadId(id);
      setIsNewSession(false);
      fetchSessions();
    },
    onError: (error) => {
      console.error("Stream error:", error);
    },
  });

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [stream.messages]);

  // Fetch sessions list from our backend (for history)
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/sessions?notebookId=${notebookId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        // Auto-select most recent if no current session
        if (!threadId && data.length > 0 && !isNewSession) {
          loadSession(data[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    }
  }, [notebookId, threadId, isNewSession]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Load a specific session
  const loadSession = async (sessionId: string) => {
    setThreadId(sessionId);
    setIsNewSession(false);
    setShowHistory(false);
  };

  // Start a new chat
  const handleNewChat = () => {
    setThreadId(null);
    setIsNewSession(true);
    setShowHistory(false);
  };

  // Delete a session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this chat history?")) return;

    try {
      const res = await fetch(`/api/chat/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (threadId === sessionId) {
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

    // Submit to LangGraph stream
    stream.submit({
      messages: [{ type: "human", content: message }],
    });
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
    <div className="flex h-full flex-col relative">
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
                    className={`group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted ${threadId === session.id ? "bg-muted" : ""
                      }`}
                    onClick={() => loadSession(session.id)}
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {stream.messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Sparkles className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Start a conversation</p>
            </div>
          </div>
        ) : (
          stream.messages.map((message, idx) => (
            <div
              key={message.id ?? idx}
              className={`flex ${message.type === "human" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 ${message.type === "human"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                  }`}
              >
                {message.type === "human" ? (
                  <p className="text-sm whitespace-pre-wrap">{message.content as string}</p>
                ) : (
                  <Markdown className="text-sm">{message.content as string}</Markdown>
                )}
              </div>
            </div>
          ))
        )}
        {stream.isLoading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        )}
        {stream.error && (
          <div className="flex justify-start">
            <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2">
              <p className="text-sm">Error: {stream.error.message}</p>
            </div>
          </div>
        )}
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
