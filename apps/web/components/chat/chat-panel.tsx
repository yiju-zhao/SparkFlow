"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import { Send, Loader2, Sparkles, Plus, History, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface ChatPanelProps {
  notebookId: string;
  datasetId?: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  lastActivity: string;
  _count: { messages: number };
}

export function ChatPanel({ notebookId, datasetId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isNewSession, setIsNewSession] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch sessions list
  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/sessions?notebookId=${notebookId}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data);
        // Auto-select most recent if no current session
        if (!currentSessionId && data.length > 0 && !isNewSession) {
          loadSession(data[0].id);
        }
      }
    } catch (error) {
      console.error("Failed to fetch sessions:", error);
    }
  }, [notebookId, currentSessionId, isNewSession]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Load a specific session's messages
  const loadSession = async (sessionId: string) => {
    try {
      const res = await fetch(`/api/chat/${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.map((m: { id: string; role: string; content: string }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
        })));
        setCurrentSessionId(sessionId);
        setIsNewSession(false);
        setShowHistory(false);
      }
    } catch (error) {
      console.error("Failed to load session:", error);
    }
  };

  // Start a new chat
  const handleNewChat = () => {
    setMessages([]);
    setCurrentSessionId(null);
    setIsNewSession(true);
    setShowHistory(false);
  };

  // Delete a session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation(); // Prevent triggering loadSession
    if (!confirm("Delete this chat history?")) return;

    try {
      const res = await fetch(`/api/chat/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        // If we deleted the current session, start fresh
        if (currentSessionId === sessionId) {
          handleNewChat();
        }
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: uuidv4(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          notebookId,
          datasetId,
          sessionId: currentSessionId,
          newSession: isNewSession,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const assistantMessage: Message = {
        id: uuidv4(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          // Handle text chunks
          if (line.startsWith("0:")) {
            try {
              const text = JSON.parse(line.slice(2));
              setMessages((prev) => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "assistant") {
                  last.content += text;
                }
                return updated;
              });
            } catch {
              // Skip malformed lines
            }
          }
          // Handle data events (session ID, finish)
          if (line.startsWith("d:")) {
            try {
              const data = JSON.parse(line.slice(2));
              if (data.sessionId) {
                setCurrentSessionId(data.sessionId);
                setIsNewSession(false);
                // Refresh sessions list
                fetchSessions();
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: uuidv4(),
          role: "assistant",
          content: "Sorry, there was an error processing your message.",
        },
      ]);
    } finally {
      setIsLoading(false);
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
    <div className="flex h-full flex-col relative">
      {/* Header with actions */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium">Chat</h2>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleNewChat}
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            title="Chat History"
          >
            <History className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="absolute top-12 right-2 z-10 w-64 rounded-lg border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b p-2">
            <span className="text-sm font-medium">History</span>
            <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto p-2">
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">No chat history</p>
            ) : (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={`flex items-center justify-between p-2 rounded text-sm hover:bg-accent cursor-pointer ${currentSessionId === session.id ? "bg-accent" : ""}`}
                  onClick={() => loadSession(session.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{session.title}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(session.lastActivity)} · {session._count.messages} msgs
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    className="ml-2 p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                    title="Delete chat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 rounded-full bg-accent-red/10 p-4">
              <Sparkles className="h-8 w-8 text-accent-red" />
            </div>
            <h3 className="text-lg font-medium">Start a conversation</h3>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Ask questions about your sources or get help with your research
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-2xl space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"
                  }`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2 ${message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent"
                    }`}
                >
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  {message.role === "assistant" && message.content && (
                    <div className="mt-2 flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Plus className="h-3 w-3" />
                        Add to Notes
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="mx-auto max-w-2xl">
          <div className="flex gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question..."
              className="max-h-32 min-h-[44px] resize-none"
              rows={1}
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              className="h-11 w-11 shrink-0 bg-accent-red hover:bg-accent-red-hover"
              disabled={!input.trim() || isLoading}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
